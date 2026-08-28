-- ===========================================================================
-- 0032: CONSENTIMENTO REGISTRADO E TRAVA DE ABUSO NA CAPTACAO PUBLICA
-- ===========================================================================
-- DUAS COISAS, PELO MESMO MOTIVO: A PAGINA DE CAPTACAO E PUBLICA
-- ---------------------------------------------------------------------------
-- `/captar?c=<uuid do corretor>` responde sem login, por natureza -- e o link
-- que o corretor publica no story e no cartao. Isso a torna a unica porta do
-- POUP aberta para o mundo, e ela precisa de duas coisas que as telas
-- autenticadas nao precisam.
--
-- ---------------------------------------------------------------------------
-- 1. PROVAR O CONSENTIMENTO
-- ---------------------------------------------------------------------------
-- Quem preenche aquele formulario e um TERCEIRO: nao e o assinante do POUP, e
-- os dados dele viram um lead na carteira do corretor. A LGPD pede que o
-- consentimento seja demonstravel, e ate agora nao havia registro nenhum -- so
-- uma frase embaixo do botao, que nem consentimento e.
--
-- Guardar apenas um booleano nao resolveria: no dia em que o texto mudasse,
-- ninguem saberia com o que cada pessoa concordou. Por isso vai a VERSAO e o
-- TEXTO integral, congelados no momento do aceite.
--
-- ---------------------------------------------------------------------------
-- 2. IMPEDIR QUE INUNDEM A BASE DE UM CORRETOR
-- ---------------------------------------------------------------------------
-- Com o UUID do corretor em maos -- e ele esta na URL publica --, qualquer
-- pessoa podia chamar `capture-lead` em laco e encher a carteira dele de lixo.
-- Nao vaza dado nenhum (o insert e fixado no corretor validado), mas destroi o
-- CRM de quem depende dele para trabalhar. Era o unico achado "Alto" que a
-- primeira auditoria de seguranca deixou em aberto.
--
-- A contagem fica no banco, e nao na Edge Function, porque a funcao nao tem
-- memoria entre invocacoes -- cada chamada e um processo novo.
--
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. O CONSENTIMENTO, JUNTO DO LEAD
-- ---------------------------------------------------------------------------
-- Colunas na propria tabela `leads`, e nao numa tabela a parte: o consentimento
-- e um atributo daquele lead e morre com ele. Separado, sobreviveria a exclusao
-- e viraria um registro orfa de alguem que pediu para sair.

alter table public.leads
  add column if not exists consent_at timestamptz,
  add column if not exists consent_versao integer,
  add column if not exists consent_texto text;

comment on column public.leads.consent_at is
  'Quando a pessoa marcou a autorizacao na pagina publica. Null = lead cadastrado a mao pelo corretor.';
comment on column public.leads.consent_texto is
  'O texto exato que ela leu. Congelado: mudar o texto do formulario nao pode reescrever o passado.';


-- ---------------------------------------------------------------------------
-- 2. TRAVA DE ABUSO
-- ---------------------------------------------------------------------------
-- Uma linha por (corretor, janela de hora). Sem RLS aberta a ninguem: quem
-- conta e a Edge Function, com service role.

create table if not exists public.captacao_rate (
  broker_id uuid not null references auth.users (id) on delete cascade,
  /** Inicio da hora, em UTC. Truncar a hora e o suficiente e mantem a tabela pequena. */
  janela timestamptz not null,
  tentativas integer not null default 0,
  primary key (broker_id, janela)
);

comment on table public.captacao_rate is
  'Contagem de envios da pagina publica de captacao, por corretor e por hora. So service role.';

alter table public.captacao_rate enable row level security;
-- Sem policies: ninguem alcanca pelo aplicativo.

create index if not exists captacao_rate_janela_idx on public.captacao_rate (janela);


-- ---------------------------------------------------------------------------
-- 3. CONTAR E DECIDIR, ATOMICAMENTE
-- ---------------------------------------------------------------------------
-- Mesmo raciocinio de `consumir_ia`: ler-somar-gravar deixa duas chamadas
-- simultaneas verem o mesmo numero, e o teto vaza exatamente no caso que ele
-- existe para conter -- o disparo automatizado em paralelo.
--
-- O `on conflict ... do update` resolve isso numa instrucao so: o banco
-- serializa, e o valor devolvido ja e o total depois do incremento.

create or replace function public.registrar_captacao(p_broker uuid, p_teto integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_janela timestamptz := date_trunc('hour', now());
  v_total integer;
  v_teto integer := greatest(1, least(coalesce(p_teto, 30), 1000));
begin
  if p_broker is null then
    return jsonb_build_object('permitido', false, 'motivo', 'sem_corretor');
  end if;

  insert into public.captacao_rate (broker_id, janela, tentativas)
  values (p_broker, v_janela, 1)
  on conflict (broker_id, janela) do update
    set tentativas = captacao_rate.tentativas + 1
  returning tentativas into v_total;

  -- Faxina barata: uma vez a cada ~100 chamadas, apaga o que ja nao importa.
  -- Sem isto a tabela cresce para sempre com janelas que ninguem mais consulta.
  if v_total % 100 = 0 then
    delete from public.captacao_rate where janela < now() - interval '2 days';
  end if;

  if v_total > v_teto then
    return jsonb_build_object('permitido', false, 'motivo', 'rajada', 'tentativas', v_total);
  end if;

  return jsonb_build_object('permitido', true, 'tentativas', v_total);
end;
$$;

comment on function public.registrar_captacao(uuid, integer) is
  'Conta um envio da pagina publica e diz se ainda cabe na hora. Chamada so pela Edge Function capture-lead.';

-- Nem `anon` nem `authenticated` chamam isto: quem chama e a Edge Function com
-- service role. Aberta ao publico, ela viraria o proprio vetor de abuso.
revoke all on function public.registrar_captacao(uuid, integer) from public;


-- ===========================================================================
-- CONFERENCIA
-- ===========================================================================
--   select broker_id, janela, tentativas from public.captacao_rate
--    order by janela desc limit 20;
--
--   select name, consent_at, consent_versao from public.leads
--    where consent_at is not null order by consent_at desc limit 20;
--
-- Um corretor que apareca com centenas de tentativas numa hora e sinal de
-- ataque ao link publico dele -- ou de um teste seu.
-- ===========================================================================
