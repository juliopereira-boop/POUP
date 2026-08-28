-- ===========================================================================
-- 0033: FILA DE RECONCILIACAO DA EXCLUSAO DE CONTA
-- ===========================================================================
-- POR QUE ESTA TABELA EXISTE
-- ---------------------------------------------------------------------------
-- A funcao `delete-account` faz cinco passos em ordem (Stripe, Apple, arquivos,
-- conferencia, usuario) e ABORTA quando um deles falha. Isso e deliberado e
-- continua: seguir em frente deixaria uma cobranca viva sem dono, ou um
-- documento de cliente num bucket cujo dono deixou de existir. Parar e
-- recuperavel; seguir nao e.
--
-- O que faltava era o outro lado. Quando o Stripe esta fora do ar, o corretor
-- recebe um 503, a conta dele continua inteira -- e **nao fica registro nenhum
-- de que ele tentou excluir**. Se ele desistir de tentar de novo, ninguem
-- jamais fica sabendo que houve um pedido de exclusao. O pedido morre no log
-- da Edge Function, que ninguem le e que rotaciona.
--
-- Isso e risco concreto em duas frentes:
--
--   * a **App Store** exige que a exclusao de conta seja possivel de dentro do
--     app. Uma dependencia de terceiro que trava para sempre, em silencio, e
--     na pratica a exclusao nao existir;
--   * a **LGPD** trata o pedido de eliminacao como direito do titular, com
--     prazo. Um pedido que nao deixa rastro nao tem como ser cumprido no prazo
--     nem como ser demonstrado depois.
--
-- Uma linha por corretor com pedido em aberto: em que etapa parou, com qual
-- erro, quantas vezes ja tentou, quando comecou e quando foi a ultima vez.
--
-- ---------------------------------------------------------------------------
-- POR QUE NAO E UMA FILA COM ROBO
-- ---------------------------------------------------------------------------
-- Nao ha worker automatico, e a escolha e consciente. Um processo que apaga
-- contas sozinho, retomando de uma etapa qualquer, e a coisa mais perigosa que
-- da para construir aqui -- e o problema real nunca foi a falta de automacao:
-- foi a **invisibilidade**. Com a tabela, o operador enxerga os pedidos presos
-- e resolve; e a proxima tentativa do proprio corretor, que ja funcionava,
-- continua sendo o caminho normal.
--
-- Se um dia o volume justificar um robo, ele le exatamente esta tabela.
--
-- ---------------------------------------------------------------------------
-- SEM POLICY NENHUMA, COMO EM 0031 E 0032
-- ---------------------------------------------------------------------------
-- RLS ligada e zero policies: so a service role, que vive apenas dentro das
-- Edge Functions, alcanca. Mesmo padrao de `apple_credentials` e de
-- `captacao_rate`. Nao ha nada aqui que o corretor precise ver na tela -- a
-- mensagem que ele le ja vem da propria funcao, no momento da falha.
--
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A PENDENCIA
-- ---------------------------------------------------------------------------
-- Chave pelo `user_id`: um corretor tem no maximo um pedido de exclusao em
-- aberto. Tentar de novo nao cria linha nova, incrementa a que existe -- e o
-- contador e justamente o sinal de "isto nao esta se resolvendo sozinho".
--
-- `on delete cascade` faz a linha sumir no instante em que a conta finalmente e
-- excluida. Ou seja: o que sobra na tabela e, por construcao, so o que ainda
-- nao foi cumprido.

create table if not exists public.exclusao_pendente (
  user_id uuid primary key references auth.users (id) on delete cascade,
  /** Em qual dos cinco passos a exclusao parou. Ver o check abaixo. */
  etapa text not null,
  /** O motivo tecnico, para o operador. Nunca chega na tela do corretor. */
  erro text,
  tentativas integer not null default 1,
  primeira_em timestamptz not null default now(),
  ultima_em timestamptz not null default now()
);

comment on table public.exclusao_pendente is
  'Pedidos de exclusao de conta que pararam numa dependencia externa. Sem policy: apenas service role.';
comment on column public.exclusao_pendente.tentativas is
  'Quantas vezes o corretor ja pediu. Numero alto = travado de verdade, nao azar de rede.';
comment on column public.exclusao_pendente.primeira_em is
  'Quando ele pediu pela PRIMEIRA vez. E deste instante que corre o prazo do titular.';

alter table public.exclusao_pendente enable row level security;

-- Sem policies, de proposito. Ver o cabecalho.

-- O check nomeia as etapas para o operador nao precisar ler a Edge Function
-- para entender a linha. Se um passo novo entrar la, esta lista entra junto --
-- e a migration falhando alto e melhor do que uma etapa 'undefined' gravada.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exclusao_pendente_etapa_conhecida') then
    alter table public.exclusao_pendente add constraint exclusao_pendente_etapa_conhecida
      check (etapa in ('stripe', 'apple', 'arquivos', 'conferencia', 'usuario'));
  end if;
end
$$;

-- O operador olha por "quem esta esperando ha mais tempo".
create index if not exists exclusao_pendente_primeira_idx
  on public.exclusao_pendente (primeira_em);


-- ---------------------------------------------------------------------------
-- 2. REGISTRAR A TENTATIVA, NUMA INSTRUCAO SO
-- ---------------------------------------------------------------------------
-- Mesmo motivo de `registrar_captacao` e `consumir_ia`: ler-somar-gravar pelo
-- client sao tres viagens ao banco num caminho que ja esta com problema. O
-- `on conflict do update` resolve numa instrucao, e o valor devolvido ja e o
-- total depois do incremento.
--
-- `primeira_em` NAO e tocado no update: e o carimbo do primeiro pedido, e e ele
-- que responde "ha quanto tempo esta pessoa esta esperando".

create or replace function public.registrar_exclusao_pendente(
  p_user uuid,
  p_etapa text,
  p_erro text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tentativas integer;
begin
  if p_user is null then
    return 0;
  end if;

  insert into public.exclusao_pendente (user_id, etapa, erro)
  values (p_user, p_etapa, left(coalesce(p_erro, ''), 500))
  on conflict (user_id) do update
    set etapa = excluded.etapa,
        erro = excluded.erro,
        tentativas = exclusao_pendente.tentativas + 1,
        ultima_em = now()
  returning tentativas into v_tentativas;

  return v_tentativas;
end;
$$;

comment on function public.registrar_exclusao_pendente(uuid, text, text) is
  'Marca que a exclusao de conta parou numa etapa. Chamada so pela Edge Function delete-account.';

-- Nem `anon` nem `authenticated`: quem chama e a Edge Function com service
-- role. Aberta, viraria um jeito de qualquer logado sujar a fila do operador.
revoke all on function public.registrar_exclusao_pendente(uuid, text, text) from public;


-- ===========================================================================
-- CONFERENCIA
-- ===========================================================================
-- A tabela precisa estar com RLS ligado e ZERO policies:
--   select relrowsecurity from pg_class where relname = 'exclusao_pendente';
--   select count(*) from pg_policies where tablename = 'exclusao_pendente';
--
-- Quem esta preso, e ha quanto tempo (esta e a consulta do dia a dia):
--   select user_id, etapa, tentativas, erro,
--          now() - primeira_em as esperando_ha
--     from public.exclusao_pendente
--    order by primeira_em;
--
-- A tabela VAZIA e o estado normal: cada exclusao concluida apaga a propria
-- linha, e o `on delete cascade` apaga de novo junto com o usuario.
--
-- Uma linha com `etapa = 'stripe'` e `tentativas` alto significa que a
-- assinatura precisa ser cancelada na mao no painel do Stripe; depois disso a
-- proxima tentativa do corretor passa. Uma linha com `etapa = 'arquivos'`
-- significa olhar o bucket `uploads/<user_id>` no Storage.
-- ===========================================================================
