-- ===========================================================================
-- 0020: CONCESSAO PREGUICOSA (LAZY) DO PERIODO DE TESTE
-- ===========================================================================
-- PROBLEMA QUE ESTA MIGRATION RESOLVE
--
--   Na 0018 o teste gratuito so era concedido dentro do trigger
--   on_auth_user_created -> handle_new_user() -> grant_trial_if_campaign_active().
--   Esse trigger dispara SOMENTE no INSERT em auth.users, ou seja, apenas
--   quando a conta e criada pela PRIMEIRA vez.
--
--   Consequencia: quem ja tinha conta antes de a campanha ser ligada (e o
--   proprio dono, testando com uma conta que ja existia de um login anterior)
--   continua com status = 'none' e cai no PAYWALL, mesmo com a campanha
--   LIGADA. Era exatamente o sintoma relatado.
--
-- SOLUCAO
--
--   1. public.ensure_my_trial(): o proprio app pede o trial no momento em que
--      carrega a assinatura. Se a conta esta sem acesso, nunca usou trial e a
--      campanha esta ligada, o trial e concedido na hora.
--   2. Bloco de saneamento no final: concede o trial, de uma unica vez, para
--      as contas que JA EXISTEM hoje e nunca tiveram teste — se e somente se a
--      campanha estiver LIGADA no momento em que esta migration rodar.
--
--   Toda a REGRA continua em grant_trial_if_campaign_active() (0018). Aqui nao
--   ha regra duplicada: ensure_my_trial() so decide QUEM (sempre auth.uid()) e
--   informa SE concedeu.
--
-- Migration idempotente: pode ser executada mais de uma vez sem efeito
-- colateral (nunca concede dois trials para a mesma conta). Rode inteira no
-- SQL Editor do Supabase.
--
-- PRE-REQUISITO: a migration 0018_trial_campaign.sql ja deve ter sido rodada.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. PRE-REQUISITOS (auto-suficiencia)
-- ---------------------------------------------------------------------------
-- Se a 0018 nao rodou, para aqui com uma mensagem clara em vez de deixar um
-- erro obscuro no meio do arquivo.

do $$
begin
  if to_regclass('public.trial_campaign') is null then
    raise exception
      'Rode a migration 0018_trial_campaign.sql antes desta (public.trial_campaign nao existe).';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'grant_trial_if_campaign_active'
  ) then
    raise exception
      'Rode a migration 0018_trial_campaign.sql antes desta (public.grant_trial_if_campaign_active nao existe).';
  end if;
end
$$;

-- Colunas do rastro do trial (garantidas mesmo que a 0018 tenha sido editada).
alter table public.subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_days integer;


-- ---------------------------------------------------------------------------
-- 1. ensure_my_trial(): O APP PEDE O TRIAL PARA SI MESMO
-- ---------------------------------------------------------------------------
-- SEGURANCA
--   * NAO recebe parametro de user_id. O alvo e SEMPRE auth.uid(), lido do JWT
--     pelo proprio banco. Um usuario nao tem como conceder trial para outro.
--   * security definer porque grant_trial_if_campaign_active() foi revogada de
--     authenticated na 0018 (o cliente nao pode chama-la direto, escolhendo o
--     alvo). Esta funcao e o unico portao, e ele so abre para o dono do JWT.
--   * search_path fixo em public: nao da para sequestrar a resolucao de nomes.
--   * Sem sessao autenticada (auth.uid() nulo) nao faz absolutamente nada.
--
-- TRAVAS (todas herdadas de grant_trial_if_campaign_active, nada e afrouxado)
--   * so concede se a campanha estiver enabled, usando o trial_days dela;
--   * nunca concede duas vezes  -> exige trial_started_at is null;
--   * nao mexe em quem ja paga  -> exige status = 'none';
--   * nao mexe em assinatura Stripe -> exige stripe_subscription_id is null;
--   * garante storage_limit_bytes valido (5 GB) para o upload nao quebrar
--     com P0001.
--
-- RETORNO
--   boolean:
--     true  = o trial FOI concedido AGORA, nesta chamada. O cliente deve
--             reconsultar a assinatura, que agora esta 'trialing'.
--     false = nada mudou. Pode ser porque a campanha esta desligada, porque a
--             conta ja usou o trial, porque ja tem assinatura ativa, ou porque
--             nao ha sessao autenticada. Em todos esses casos o cliente segue
--             com a assinatura que ja tinha lido.
--   Nunca levanta excecao no fluxo normal: e chamada em todo carregamento do
--   app e nao pode derrubar o login.

create or replace function public.ensure_my_trial()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_before timestamptz;
  v_after timestamptz;
  v_found boolean;
begin
  -- Sem sessao autenticada: nao faz nada.
  if v_uid is null then
    return false;
  end if;

  -- Rede de seguranca: se por qualquer motivo a linha de assinatura nao existe
  -- (conta criada antes do trigger, ou trigger que falhou), cria a linha
  -- 'none' para o PROPRIO usuario. Sem isso o update abaixo nao pega nada e a
  -- conta ficaria presa no paywall para sempre.
  if not exists (select 1 from public.subscriptions s where s.user_id = v_uid) then
    insert into public.subscriptions (user_id, status)
    values (v_uid, 'none')
    on conflict (user_id) do nothing;
  end if;

  -- Trava a linha ANTES de chamar a concessao. Duas chamadas simultaneas
  -- (dois dispositivos, dois refreshes) sao serializadas aqui: a segunda so
  -- prossegue depois da primeira e ja enxerga trial_started_at preenchido,
  -- entao devolve false em vez de anunciar uma segunda concessao.
  select s.trial_started_at into v_before
  from public.subscriptions s
  where s.user_id = v_uid
  for update;

  get diagnostics v_found = row_count;
  if v_found is not true then
    return false;
  end if;

  -- Conta que ja usou o trial nao passa daqui (a funcao da 0018 tambem barra,
  -- mas evitamos ate o trabalho).
  if v_before is not null then
    return false;
  end if;

  -- TODA a regra de negocio vive na funcao da 0018.
  perform public.grant_trial_if_campaign_active(v_uid);

  select s.trial_started_at into v_after
  from public.subscriptions s
  where s.user_id = v_uid;

  return v_after is not null;
end;
$$;

comment on function public.ensure_my_trial() is
  'Concede o periodo de teste ao PROPRIO usuario autenticado (auth.uid()), se a campanha estiver ligada e a conta nunca tiver usado trial. Retorna true somente quando concedeu agora. Nao aceita user_id do cliente.';

-- Ninguem alem do usuario logado. Sem parametro = sem como mirar em outro.
revoke all on function public.ensure_my_trial() from public;
revoke all on function public.ensure_my_trial() from anon;
grant execute on function public.ensure_my_trial() to authenticated;

-- Reforca a trava da 0018: o cliente NUNCA chama a funcao com alvo escolhido.
revoke all on function public.grant_trial_if_campaign_active(uuid) from public;
revoke all on function public.grant_trial_if_campaign_active(uuid) from anon;
revoke all on function public.grant_trial_if_campaign_active(uuid) from authenticated;


-- ===========================================================================
-- 2. SANEAMENTO: DAR O TESTE PARA AS CONTAS QUE JA EXISTEM HOJE
-- ===========================================================================
-- POR QUE ISTO EXISTE
--   O trial da 0018 so era concedido no INSERT em auth.users. Quem ja tinha
--   conta quando a campanha foi ligada ficou com status = 'none' e caiu no
--   paywall. Este bloco corrige essas contas de uma vez.
--
-- QUANDO ELE AGE
--   SOMENTE se a campanha estiver LIGADA (trial_campaign.enabled = true) no
--   instante em que esta migration roda. Com a campanha desligada ele nao toca
--   em nada — e apenas imprime um aviso.
--
-- QUEM ELE PEGA (as mesmas travas de sempre, aplicadas pela funcao da 0018)
--   Apenas contas com status = 'none', trial_started_at nulo e sem
--   stripe_subscription_id. Ou seja:
--     - NAO mexe em quem paga (status = 'active');
--     - NAO da um segundo trial para quem ja teve um (mesmo vencido);
--     - NAO mexe em quem tem assinatura no Stripe.
--
-- IDEMPOTENTE: rodar a migration de novo nao concede nada de novo, porque as
-- contas atendidas na primeira execucao passam a ter trial_started_at
-- preenchido e param de casar com o filtro.
--
-- SE VOCE NAO QUISER ESTE SANEAMENTO AUTOMATICO: comente o bloco `do $$ ... $$;`
-- inteiro abaixo. Nesse caso as contas antigas ainda assim recebem o trial na
-- primeira vez que abrirem o app, via ensure_my_trial() — so que uma a uma, no
-- primeiro acesso de cada uma, em vez de todas agora.

do $$
declare
  v_enabled boolean;
  v_alvos integer;
  v_concedidos integer;
begin
  select tc.enabled into v_enabled
  from public.trial_campaign tc
  where tc.id
  limit 1;

  if coalesce(v_enabled, false) is not true then
    raise notice
      'Campanha DESLIGADA: nenhuma conta antiga recebeu teste. Ligue a campanha e rode esta migration de novo (ou deixe o proprio app conceder no primeiro acesso de cada conta).';
    return;
  end if;

  select count(*) into v_alvos
  from public.subscriptions s
  where s.status = 'none'
    and s.trial_started_at is null
    and s.stripe_subscription_id is null;

  -- A concessao (e todas as travas) fica a cargo da funcao da 0018.
  perform public.grant_trial_if_campaign_active(s.user_id)
  from public.subscriptions s
  where s.status = 'none'
    and s.trial_started_at is null
    and s.stripe_subscription_id is null;

  select count(*) into v_concedidos
  from public.subscriptions s
  where s.status = 'trialing'
    and s.trial_started_at is not null
    and s.current_period_end > now();

  raise notice
    'Saneamento do teste gratuito: % conta(s) elegivel(is) processada(s). Total de contas em teste valido agora: %.',
    coalesce(v_alvos, 0), coalesce(v_concedidos, 0);
end
$$;


-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, rode no SQL Editor depois da migration)
-- ---------------------------------------------------------------------------
--
-- -- Estado da campanha:
-- select * from public.trial_campaign;
--
-- -- Quem esta em teste valido agora:
-- select u.email, s.status, s.trial_days, s.trial_started_at, s.current_period_end
-- from public.subscriptions s
-- join auth.users u on u.id = s.user_id
-- where s.status = 'trialing'
-- order by s.current_period_end;
--
-- -- Contas que continuam sem acesso (devem ser so as que ja usaram o teste
-- -- ou que cancelaram):
-- select u.email, s.status, s.trial_started_at, s.current_period_end
-- from public.subscriptions s
-- join auth.users u on u.id = s.user_id
-- where s.status not in ('active', 'trialing')
-- order by u.email;
-- ===========================================================================
