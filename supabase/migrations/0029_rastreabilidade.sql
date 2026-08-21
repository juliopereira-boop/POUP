-- ===========================================================================
-- 0029: RASTREABILIDADE DO PILOTO (E O BOTAO DE REPORTAR PROBLEMA)
-- ===========================================================================
-- POR QUE ESTA MIGRATION EXISTE
-- ---------------------------------------------------------------------------
-- O piloto responde perguntas que nenhuma opiniao responde: quantos corretores
-- criam a primeira empresa depois de assinar? Em que etapa da simulacao eles
-- param? Quem volta no segundo dia? Sem medir, a resposta e sempre "acho que".
--
-- ---------------------------------------------------------------------------
-- A REGRA QUE DESENHOU ESTA TABELA: NENHUM DADO DO CLIENTE
-- ---------------------------------------------------------------------------
-- Os eventos guardam ID interno, etapa, duracao e resultado. Nao guardam nome,
-- CPF, telefone, email, renda, valor de imovel nem texto livre de negociacao.
--
-- Isso nao esta escrito so no comentario: esta na FORMA da tabela. Nao existe
-- coluna de texto livre onde um dado do cliente pudesse cair. `etapa` e
-- `resultado` sao rotulos curtos com teto de 40 caracteres, `evento` so aceita
-- valores de uma lista fechada, e o unico identificador e um uuid interno. Nao
-- ha como registrar PII aqui nem por descuido nem por pressa.
--
-- E LGPD tambem e isso: o dado que nao existe nao vaza, nao precisa de base
-- legal e nao entra em pedido de exclusao.
--
-- ---------------------------------------------------------------------------
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. EVENTOS
-- ---------------------------------------------------------------------------
-- `evento` e lista fechada por CHECK, e nao texto livre, por dois motivos:
--
--   1. um nome de evento inventado no aplicativo entraria em silencio e nunca
--      apareceria no painel — o erro mais chato de achar em telemetria;
--   2. nome de evento e onde alguem escreveria `simulacao_maria_silva` sem
--      pensar. Lista fechada fecha essa porta.
--
-- Para acrescentar um evento: entre na lista aqui E no catalogo do aplicativo
-- (`src/features/analytics/eventos.ts`). Os dois lados de proposito: um evento
-- novo e uma decisao, nao um efeito colateral de digitar uma string.

create table if not exists public.analytics_events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  evento text not null,
  /** Rotulo curto de onde no fluxo aconteceu. Nunca dado do cliente. */
  etapa text,
  /** 'ok' | 'erro' | 'cancelado' | outro rotulo curto. */
  resultado text,
  /** Quanto tempo a etapa levou, em milissegundos. */
  duracao_ms integer,
  /** Um id INTERNO (empresa, empreendimento, simulacao) — nunca um id externo. */
  ref_id uuid,
  criado_em timestamptz not null default now()
);

comment on table public.analytics_events is
  'Telemetria do produto. SEM dado sensivel do cliente: so id interno, etapa, duracao e resultado.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'analytics_events_evento_valido') then
    alter table public.analytics_events add constraint analytics_events_evento_valido check (
      evento in (
        'signup_completed',
        'onboarding_completed',
        'company_created',
        'development_created',
        'simulation_started',
        'simulation_step_completed',
        'simulation_abandoned',
        'proposal_generated',
        'proposal_shared',
        'user_returned',
        'subscription_viewed'
      )
    );
  end if;

  -- Teto curto nos rotulos: e o que impede texto livre de virar coluna de
  -- observacao, que e por onde dado de cliente entraria.
  if not exists (select 1 from pg_constraint where conname = 'analytics_events_rotulos_curtos') then
    alter table public.analytics_events add constraint analytics_events_rotulos_curtos check (
      (etapa is null or length(etapa) <= 40)
      and (resultado is null or length(resultado) <= 40)
    );
  end if;

  -- Duracao negativa ou absurda e sinal de relogio do aparelho fora de hora,
  -- nao de uso real. 24 horas em ms.
  if not exists (select 1 from pg_constraint where conname = 'analytics_events_duracao_sana') then
    alter table public.analytics_events add constraint analytics_events_duracao_sana check (
      duracao_ms is null or (duracao_ms >= 0 and duracao_ms <= 86400000)
    );
  end if;
end
$$;

alter table public.analytics_events enable row level security;

-- O aplicativo SO INSERE, e so no proprio nome.
drop policy if exists "analytics_events_insert_own" on public.analytics_events;
create policy "analytics_events_insert_own"
  on public.analytics_events for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Quem LE e o admin. O corretor nao precisa do proprio historico de cliques, e
-- deixar ele ler seria expor a telemetria a quem ela mede.
drop policy if exists "analytics_events_select_admin" on public.analytics_events;
create policy "analytics_events_select_admin"
  on public.analytics_events for select
  to authenticated
  using (public.is_app_admin());

-- Sem update nem delete: telemetria que pode ser editada nao serve de prova de
-- nada. A limpeza por idade e o `podar_analytics()` no fim deste arquivo.

create index if not exists analytics_events_evento_idx
  on public.analytics_events (evento, criado_em desc);
create index if not exists analytics_events_user_idx
  on public.analytics_events (user_id, criado_em desc);


-- ---------------------------------------------------------------------------
-- 2. REPORTAR PROBLEMA OU DAR SUGESTAO
-- ---------------------------------------------------------------------------
-- Aqui o texto livre e o PONTO: e o corretor descrevendo com as palavras dele o
-- que aconteceu. A diferenca em relacao aos eventos e o consentimento — ele
-- escreveu de proprio punho sabendo que estava mandando para o suporte.
--
-- Ainda assim o formulario pede para nao incluir dado de cliente, e o teto de
-- 2000 caracteres evita que alguem cole uma conversa inteira ali.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  /** Rota do app onde o problema aconteceu, capturada automaticamente. */
  tela text,
  /** Etapa dentro da tela, quando a tela tem etapas. */
  etapa text,
  mensagem text not null,
  /** 'aberto' | 'lido' | 'resolvido' — o admin move a mao. */
  situacao text not null default 'aberto',
  criado_em timestamptz not null default now()
);

comment on table public.feedback is
  'Problemas e sugestoes escritos pelo proprio corretor, com a tela e a etapa onde aconteceu.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_mensagem_tamanho') then
    alter table public.feedback add constraint feedback_mensagem_tamanho check (
      length(btrim(mensagem)) between 3 and 2000
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_situacao_valida') then
    alter table public.feedback add constraint feedback_situacao_valida check (
      situacao in ('aberto', 'lido', 'resolvido')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_tela_curta') then
    alter table public.feedback add constraint feedback_tela_curta check (
      (tela is null or length(tela) <= 200) and (etapa is null or length(etapa) <= 40)
    );
  end if;
end
$$;

alter table public.feedback enable row level security;

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own"
  on public.feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

-- O corretor ve o que ele mesmo mandou (para saber que chegou).
drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own"
  on public.feedback for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "feedback_select_admin" on public.feedback;
create policy "feedback_select_admin"
  on public.feedback for select
  to authenticated
  using (public.is_app_admin());

-- Só o admin muda a situação (aberto -> lido -> resolvido).
drop policy if exists "feedback_update_admin" on public.feedback;
create policy "feedback_update_admin"
  on public.feedback for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create index if not exists feedback_situacao_idx on public.feedback (situacao, criado_em desc);


-- ---------------------------------------------------------------------------
-- 3. O PAINEL
-- ---------------------------------------------------------------------------
-- Uma funcao, e nao a tela somando linha por linha: em alguns milhares de
-- usuarios a tabela de eventos passa de centenas de milhares de linhas, e
-- baixar isso para contar no aparelho seria absurdo. O agregado sai do
-- Postgres pronto.

create or replace function public.painel_eventos(p_dias integer default 30)
returns table (
  evento text,
  total bigint,
  pessoas bigint,
  erros bigint,
  duracao_mediana integer
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select e.evento,
         count(*) as total,
         count(distinct e.user_id) as pessoas,
         count(*) filter (where e.resultado = 'erro') as erros,
         percentile_disc(0.5) within group (order by e.duracao_ms)
           filter (where e.duracao_ms is not null) as duracao_mediana
    from public.analytics_events e
   where public.is_app_admin()
     and e.criado_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)))
   group by e.evento
   order by count(*) desc;
$$;

comment on function public.painel_eventos(integer) is
  'Contagem de eventos por tipo nos ultimos N dias. Só responde para admin.';

revoke all on function public.painel_eventos(integer) from public;
grant execute on function public.painel_eventos(integer) to authenticated;


-- O funil que importa no piloto: de cada corretor que se cadastrou, quantos
-- chegaram a cada marco. Uma linha, na ordem do caminho.
create or replace function public.painel_funil(p_dias integer default 30)
returns table (marco text, pessoas bigint, ordem integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with janela as (
    select e.user_id, e.evento
      from public.analytics_events e
     where public.is_app_admin()
       and e.criado_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)))
  ),
  marcos(marco, evento, ordem) as (
    values
      ('Criou a conta',        'signup_completed',    1),
      ('Terminou o começo',    'onboarding_completed',2),
      ('Cadastrou empresa',    'company_created',     3),
      ('Cadastrou imóvel',     'development_created', 4),
      ('Começou a simular',    'simulation_started',  5),
      ('Gerou proposta',       'proposal_generated',  6),
      ('Enviou proposta',      'proposal_shared',     7),
      ('Voltou outro dia',     'user_returned',       8)
  )
  select m.marco,
         (select count(distinct j.user_id) from janela j where j.evento = m.evento) as pessoas,
         m.ordem
    from marcos m
   order by m.ordem;
$$;

comment on function public.painel_funil(integer) is
  'Quantas pessoas distintas alcancaram cada marco do funil. Só responde para admin.';

revoke all on function public.painel_funil(integer) from public;
grant execute on function public.painel_funil(integer) to authenticated;


-- Consumo de IA agregado por recurso, no ciclo corrente. E a outra metade da
-- rastreabilidade: os eventos dizem o que o corretor faz, este diz o que isso
-- custa.
create or replace function public.painel_consumo_ia()
returns table (recurso text, total bigint, pessoas bigint, maior integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select u.recurso,
         sum(u.usados)::bigint as total,
         count(*)::bigint as pessoas,
         max(u.usados) as maior
    from public.ai_usage u
   where public.is_app_admin()
     and u.ciclo = public.ciclo_ia_atual()
   group by u.recurso
   order by sum(u.usados) desc;
$$;

comment on function public.painel_consumo_ia() is
  'Consumo de IA do mes corrente por recurso: total, quantas pessoas e o maior consumidor.';

revoke all on function public.painel_consumo_ia() from public;
grant execute on function public.painel_consumo_ia() to authenticated;


-- ---------------------------------------------------------------------------
-- 4. PODA
-- ---------------------------------------------------------------------------
-- Telemetria e dado que so tem valor recente: a pergunta "onde as pessoas
-- param" e sobre o mes passado, nao sobre o ano passado. Guardar para sempre
-- custa espaco e aumenta a superficie de um vazamento sem ganhar nada.
--
-- Nao esta agendada: rode a mao, ou configure um cron no Supabase quando o
-- volume justificar.

create or replace function public.podar_analytics(p_dias integer default 180)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_apagados bigint;
begin
  if not public.is_app_admin() then
    raise exception 'Só o administrador pode podar a telemetria.';
  end if;

  delete from public.analytics_events
   where criado_em < now() - make_interval(days => greatest(30, coalesce(p_dias, 180)));

  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

comment on function public.podar_analytics(integer) is
  'Apaga eventos mais antigos que N dias (minimo 30). So admin.';

revoke all on function public.podar_analytics(integer) from public;
grant execute on function public.podar_analytics(integer) to authenticated;


-- ===========================================================================
-- CONFERENCIA
-- ===========================================================================
--   select * from public.painel_eventos(30);
--   select * from public.painel_funil(30);
--   select * from public.painel_consumo_ia();
--   select tela, etapa, mensagem, criado_em from public.feedback order by criado_em desc;
--
-- Provar que nao ha dado sensivel: as unicas colunas de texto de
-- analytics_events sao `evento` (lista fechada), `etapa` e `resultado` (40
-- caracteres). Nao existe onde escrever um nome.
--   select distinct evento, etapa, resultado from public.analytics_events;
-- ===========================================================================
