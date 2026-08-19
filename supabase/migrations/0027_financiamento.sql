-- ===========================================================================
-- SIMULADOR DE FINANCIAMENTO HABITACIONAL
-- ===========================================================================
-- Três tabelas, e cada uma existe por uma razão diferente:
--
--   financing_rule_versions  as REGRAS, versionadas e globais (só o admin
--                            escreve, todo corretor lê). É o que tira as
--                            condições financeiras de dentro do código.
--   financing_rule_audit     a TRILHA de quem mudou o quê, quando e por quê.
--   financing_simulations    as SIMULAÇÕES do corretor, cada uma carregando o
--                            SNAPSHOT das regras que a produziram.
--
-- ---------------------------------------------------------------------------
-- A DECISÃO QUE MAIS IMPORTA AQUI: O SNAPSHOT
-- ---------------------------------------------------------------------------
-- `financing_simulations.rules_snapshot` guarda a versão de regras INTEIRA, em
-- JSON, no momento em que a simulação foi feita. É redundante de propósito.
--
-- Sem isso, mudar a taxa amanhã recalcularia silenciosamente a proposta que o
-- cliente recebeu ontem — e a proposta impressa deixaria de bater com o
-- sistema, sem ninguém perceber. Guardar só o número da versão não resolve:
-- alguém pode editar a versão em vez de criar outra. O snapshot é o único jeito
-- de uma simulação de agosto continuar sendo, para sempre, uma simulação de
-- agosto.
--
-- ---------------------------------------------------------------------------
-- DADO PESSOAL
-- ---------------------------------------------------------------------------
-- A simulação guarda renda e idade do cliente, e pode estar ligada a um lead
-- que tem CPF. Tudo protegido por RLS pelo `user_id`, e o CPF NÃO é copiado
-- para cá: quem tem CPF é o lead, e um dado pessoal duplicado é um dado pessoal
-- que alguém esquece de apagar.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. VERSÕES DE REGRAS
-- ---------------------------------------------------------------------------
create table if not exists public.financing_rule_versions (
  id uuid primary key default gen_random_uuid(),

  -- 'AAAA.MM'. Único, porque duas versões com o mesmo nome tornariam o
  -- snapshot ambíguo justamente na hora de auditar.
  version text not null unique,

  effective_from date not null,
  effective_to date,

  -- rascunho | ativa | encerrada
  status text not null default 'rascunho',

  -- A VersaoRegras completa (src/features/financiamento/regras.ts).
  -- Fica em JSON, e não normalizada em vinte tabelas, porque a forma das
  -- regras muda junto com o produto: acrescentar um encargo novo seria uma
  -- migration a cada mudança de portaria. O aplicativo valida a forma; o banco
  -- guarda e versiona.
  payload jsonb not null,

  source text,
  source_url text,
  notes text,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financing_rule_versions_status_idx
  on public.financing_rule_versions (status, effective_from desc);

comment on table public.financing_rule_versions is
  'Regras de financiamento, versionadas. Global: só o admin do app escreve, todo corretor lê a vigente.';
comment on column public.financing_rule_versions.payload is
  'VersaoRegras completa em JSON. Cada parâmetro carrega origem (oficial/estimativa/pendente) e fonte.';

-- Só UMA versão ativa por vez. É índice único parcial, e não trigger, porque
-- a garantia precisa valer mesmo se alguém escrever direto no SQL Editor.
create unique index if not exists financing_rule_versions_uma_ativa
  on public.financing_rule_versions ((status))
  where status = 'ativa';

alter table public.financing_rule_versions enable row level security;

-- Leitura: qualquer usuário autenticado. As regras não são segredo — são a
-- condição que o corretor apresenta ao cliente.
drop policy if exists "financing_rules_read" on public.financing_rule_versions;
create policy "financing_rules_read"
  on public.financing_rule_versions for select
  to authenticated
  using (true);

-- Escrita: só o dono do app. A autorização é do BANCO, nunca da tela —
-- esconder o botão não protege nada.
drop policy if exists "financing_rules_write_admin" on public.financing_rule_versions;
create policy "financing_rules_write_admin"
  on public.financing_rule_versions for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop trigger if exists financing_rule_versions_set_updated_at on public.financing_rule_versions;
create trigger financing_rule_versions_set_updated_at
  before update on public.financing_rule_versions
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 2. AUDITORIA DAS REGRAS
-- ---------------------------------------------------------------------------
-- Quem alterou, quando, o que era e o que passou a ser. É exigência de
-- auditoria: uma condição financeira que muda sem rastro é uma condição que
-- ninguém consegue explicar depois.
create table if not exists public.financing_rule_audit (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references public.financing_rule_versions (id) on delete set null,
  version text not null,

  -- Caminho do parâmetro dentro do payload. Ex.: 'produtos.mcmv_2.taxaAnualPct'
  campo text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  motivo text,

  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists financing_rule_audit_versao_idx
  on public.financing_rule_audit (version, changed_at desc);

comment on table public.financing_rule_audit is
  'Trilha de auditoria das mudanças de parâmetro financeiro. Só o admin lê e escreve.';

alter table public.financing_rule_audit enable row level security;

drop policy if exists "financing_audit_admin" on public.financing_rule_audit;
create policy "financing_audit_admin"
  on public.financing_rule_audit for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());


-- ---------------------------------------------------------------------------
-- 3. SIMULAÇÕES DE FINANCIAMENTO
-- ---------------------------------------------------------------------------
create table if not exists public.financing_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- O CLIENTE é o eixo de tudo.
  --
  -- Uma simulação de financiamento e uma de poupança do mesmo cliente
  -- compartilham dados (renda, valor aprovado, subsídio, FGTS). Ligando as
  -- duas ao lead, o corretor faz o financiamento e o simulador de poupança já
  -- abre preenchido — que é exatamente o pedido.
  --
  -- `on delete set null`: apagar o lead não pode apagar o histórico comercial
  -- do corretor. A simulação sobrevive sem o vínculo.
  lead_id uuid references public.leads (id) on delete set null,

  company_id uuid references public.companies (id) on delete set null,
  development_id uuid references public.developments (id) on delete set null,
  block integer,
  unit text,

  -- Denormalizado de propósito: a lista precisa mostrar cliente e
  -- empreendimento sem cinco junções, e o nome do empreendimento na simulação
  -- de agosto é o nome que ele tinha em agosto.
  client_name text,
  development_name text,

  -- EntradaSimulacao e ResultadoSimulacao (sem a tabela de 420 linhas, que é
  -- regerada pelo motor a partir da entrada — guardá-la seria dezenas de KB
  -- por simulação para reproduzir algo determinístico).
  input jsonb not null,
  result jsonb not null,

  -- O congelamento. Ver o cabeçalho.
  rules_snapshot jsonb not null,
  rule_version text not null,

  -- Colunas espelhadas do resultado, para filtrar e ordenar sem abrir o JSON.
  property_value numeric,
  financed_value numeric,
  first_installment numeric,
  term_months integer,
  amortization text,
  eligible boolean,

  status text not null default 'simulacao',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financing_simulations_user_idx
  on public.financing_simulations (user_id, created_at desc);
create index if not exists financing_simulations_lead_idx
  on public.financing_simulations (lead_id, created_at desc);
create index if not exists financing_simulations_dev_idx
  on public.financing_simulations (development_id);

comment on table public.financing_simulations is
  'Simulações de financiamento habitacional. Cada linha guarda o snapshot das regras que a produziram.';
comment on column public.financing_simulations.rules_snapshot is
  'Versão de regras congelada. Mudar a taxa depois NÃO recalcula esta simulação.';
comment on column public.financing_simulations.lead_id is
  'O cliente. É por ele que os dados viajam entre o simulador de financiamento e o de poupança.';

alter table public.financing_simulations enable row level security;

drop policy if exists "financing_simulations_all_own" on public.financing_simulations;
create policy "financing_simulations_all_own"
  on public.financing_simulations for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists financing_simulations_set_updated_at on public.financing_simulations;
create trigger financing_simulations_set_updated_at
  before update on public.financing_simulations
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 4. COMPARTILHAMENTO COM O CLIENTE
-- ---------------------------------------------------------------------------
-- O corretor manda um link para o cliente ver a simulação. O link:
--
--   * NÃO dá acesso a nada do painel do corretor — a leitura é feita por uma
--     Edge Function com service role que devolve SÓ o resumo daquela linha;
--   * expira, porque um link de proposta que vale para sempre é um vazamento
--     esperando acontecer;
--   * pode ser revogado, porque negociação muda.
--
-- O token fica GUARDADO COMO HASH. Se o banco vazar, os links já emitidos
-- continuam inúteis — é o mesmo motivo pelo qual senha não se guarda em texto.
create table if not exists public.financing_share_tokens (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.financing_simulations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  views integer not null default 0,
  last_viewed_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists financing_share_simulation_idx
  on public.financing_share_tokens (simulation_id);

comment on table public.financing_share_tokens is
  'Links públicos e expiráveis de uma simulação. O token é guardado como hash SHA-256.';

alter table public.financing_share_tokens enable row level security;

-- O corretor gerencia os próprios links. A LEITURA pública não passa por aqui:
-- ela é feita pela Edge Function com service role, que é quem sabe conferir o
-- hash sem expor a tabela.
drop policy if exists "financing_share_own" on public.financing_share_tokens;
create policy "financing_share_own"
  on public.financing_share_tokens for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 5. A VERSÃO VIGENTE, NUMA CHAMADA SÓ
-- ---------------------------------------------------------------------------
-- O aplicativo precisa da regra ativa em toda simulação. Deixar isso como
-- consulta na tela obrigaria cada tela a repetir o mesmo filtro de status e
-- vigência — e uma delas erraria.
create or replace function public.financing_active_rules()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select payload
  from public.financing_rule_versions
  where status = 'ativa'
    and effective_from <= current_date
    and (effective_to is null or effective_to >= current_date)
  order by effective_from desc
  limit 1;
$$;

comment on function public.financing_active_rules is
  'A versão de regras vigente hoje, ou NULL. Devolvendo NULL, o app usa a versão de fábrica (REGRAS_PADRAO), que traz os parâmetros oficiais como pendentes.';


-- ---------------------------------------------------------------------------
-- 6. PREÇO NO EMPREENDIMENTO
-- ---------------------------------------------------------------------------
-- O simulador de poder de compra termina mostrando QUAIS UNIDADES DO CORRETOR
-- cabem no valor calculado — e para isso ele precisa de preço. O cadastro de
-- empreendimentos não tinha nenhum.
--
-- É preço DO EMPREENDIMENTO ("a partir de"), e não da unidade. O POUP não tem
-- tabela de unidades: elas são digitadas livremente na simulação (bloco 2,
-- apto 304). Modelar um espelho de vendas inteiro seria outro produto; um
-- "valor a partir de" resolve a pergunta comercial real ("o que cabe em
-- R$ 250 mil?") com uma coluna.
--
-- `null` = sem preço cadastrado. E aí o empreendimento NÃO aparece nem como
-- compatível nem como incompatível: sem preço não há como afirmar nenhum dos
-- dois, e listá-lo numa das colunas seria inventar informação.
alter table public.developments
  add column if not exists unit_value_from numeric;

comment on column public.developments.unit_value_from is
  'Valor "a partir de" da unidade, em reais. Alimenta a lista de unidades compatíveis do poder de compra. NULL = não cadastrado.';
