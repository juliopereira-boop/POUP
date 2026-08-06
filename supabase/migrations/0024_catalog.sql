-- ===========================================================================
-- 0024: CATALOGO DO SISTEMA (CONSTRUTORAS PRE-CADASTRADAS PELO ADMIN)
-- ===========================================================================
-- O que esta migration entrega:
--   1. public.companies.is_catalog  -> a empresa e do catalogo do POUP.
--   2. fotos redondas: companies.photo_url e developments.photo_url.
--   3. public.company_adoptions     -> quem usa qual empresa do catalogo.
--   4. RLS reescrita nos cadastros para o catalogo ser LIDO por todos e
--      ESCRITO somente pelo admin.
--   5. bucket 'catalog' (publico) para as fotos e a raiz 'catalog/' dentro do
--      bucket 'uploads' para o material de venda do catalogo.
--
-- A DECISAO DE ARQUITETURA QUE EXPLICA TUDO O RESTO:
--
--   Adotar e um VINCULO, nao uma copia.
--
-- Nao existe duplicacao de linha. Quando o corretor adota, gravamos apenas uma
-- linha em company_adoptions e a leitura dele passa a ALCANCAR A MESMA linha da
-- empresa do admin - a mesma regra de comissao, os mesmos empreendimentos, o
-- mesmo material. Consequencia pratica, que e o objetivo: o admin muda a regra
-- ou cadastra um empreendimento novo e isso vale na hora para todos os que
-- adotaram, sem migracao de dados e sem risco de copia velha.
--
-- E por isso que a RLS destas tabelas nao pode mais ser "auth.uid() = user_id":
-- as linhas do catalogo pertencem ao ADMIN (user_id = o admin que cadastrou) e
-- precisam ser visiveis para os outros.
--
-- Migration idempotente: pode ser executada mais de uma vez.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. COLUNAS NOVAS
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists is_catalog boolean not null default false,
  add column if not exists photo_url text;

alter table public.developments
  add column if not exists photo_url text;

comment on column public.companies.is_catalog is
  'true = construtora do catalogo do POUP, cadastrada pelo admin e adotavel por qualquer corretor. user_id aponta para o admin que criou. Somente admin pode ligar/desligar (ver policies): um corretor comum nao publica a empresa dele no catalogo de todos.';
comment on column public.companies.photo_url is
  'Foto redonda da construtora. URL publica do bucket catalog.';
comment on column public.developments.photo_url is
  'Foto redonda do empreendimento. URL publica do bucket catalog.';


-- ---------------------------------------------------------------------------
-- 2. ADOCOES
-- ---------------------------------------------------------------------------
-- A tabela e so o vinculo: nao copia nada da empresa. Sem colunas de dados de
-- proposito - qualquer campo copiado aqui viraria informacao velha no dia em
-- que o admin editasse a empresa.

create table if not exists public.company_adoptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);

comment on table public.company_adoptions is
  'Vinculo entre o corretor e uma construtora do catalogo. NAO e copia: a leitura do adotante alcanca a mesma linha da empresa do admin, entao toda atualizacao do admin reflete automaticamente. Desadotar = apagar a linha daqui.';
comment on column public.company_adoptions.user_id is
  'Corretor que adotou. O unique com company_id impede adocao duplicada (o app pode reenviar sem medo).';
comment on column public.company_adoptions.company_id is
  'Empresa do catalogo adotada. On delete cascade: se o admin remover a empresa, a adocao desaparece com ela.';

-- Consulta mais frequente: "quais empresas EU adotei" (monta a lista do app).
create index if not exists company_adoptions_user_idx
  on public.company_adoptions (user_id);
-- Do outro lado: quantos/quais corretores adotaram uma empresa (tela do admin).
create index if not exists company_adoptions_company_idx
  on public.company_adoptions (company_id);

-- Indice parcial: a vitrine lista SO o catalogo, que e um punhado de linhas
-- dentro de uma tabela cheia de empresas privadas dos corretores.
create index if not exists companies_is_catalog_idx
  on public.companies (is_catalog)
  where is_catalog;


-- ---------------------------------------------------------------------------
-- 3. FUNCOES DE APOIO DA RLS
-- ---------------------------------------------------------------------------
-- developments, correspondents, commission_rules, commission_campaigns e
-- company_materials NAO tem coluna is_catalog: a condicao e derivada da
-- EMPRESA. Essas duas funcoes concentram a derivacao em um lugar so, para as
-- policies filhas nao repetirem subquery (e nao divergirem com o tempo).
--
-- security definer de proposito: a policy da tabela filha nao deve depender da
-- policy de public.companies para conseguir enxergar a empresa. Sao stable e
-- leem uma linha por chave primaria, entao o custo dentro da policy e baixo.

create or replace function public.is_catalog_company(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.companies c
    where c.id = cid and c.is_catalog
  );
$$;

comment on function public.is_catalog_company(uuid) is
  'true quando a empresa e do catalogo do POUP. Usada pelas policies das tabelas filhas, que nao tem is_catalog proprio.';

create or replace function public.is_own_private_company(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.companies c
    where c.id = cid
      and c.user_id = auth.uid()
      and not c.is_catalog
  );
$$;

comment on function public.is_own_private_company(uuid) is
  'true quando a empresa e do proprio usuario e NAO e do catalogo. Escrever em filha de empresa do catalogo exige admin.';

grant execute on function public.is_catalog_company(uuid) to authenticated;
grant execute on function public.is_own_private_company(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. RLS: EMPRESAS
-- ---------------------------------------------------------------------------
-- A antiga "companies_all_own" (for all, using auth.uid() = user_id) precisa
-- SAIR, e nao apenas ganhar companhia: policies permissivas se somam com OR,
-- entao enquanto ela existir o corretor continuaria podendo marcar
-- is_catalog = true na empresa dele.

alter table public.companies enable row level security;

drop policy if exists "companies_all_own" on public.companies;

-- LEITURA: a propria OU qualquer uma do catalogo.
-- O catalogo e uma VITRINE: precisa ser navegavel ANTES de adotar, senao o
-- corretor nao teria como decidir. Por isso a leitura nao olha
-- company_adoptions.
drop policy if exists "companies_select_own_or_catalog" on public.companies;
create policy "companies_select_own_or_catalog"
  on public.companies for select
  to authenticated
  using (auth.uid() = user_id or is_catalog);

-- ESCRITA: a propria E nao-catalogo, OU catalogo E admin.
--
-- TRAVA ANTI-ESCALACAO (o ponto mais delicado desta migration):
-- o UPDATE e conferido nos DOIS lados. O "using" decide qual linha ele pode
-- pegar; o "with check" decide como a linha pode FICAR. Sem o with check, um
-- corretor comum pegaria a empresa dele (linha propria, nao-catalogo, o using
-- passa) e gravaria is_catalog = true - publicando a empresa dele, com a regra
-- de comissao dele, no catalogo de TODOS os usuarios do app. Com o with check,
-- o estado final tambem precisa ser "nao-catalogo ou admin", e a tentativa e
-- recusada. O mesmo vale no sentido inverso: nao-admin nao consegue tirar uma
-- empresa do catalogo (o using ja o impede de alcancar a linha).
drop policy if exists "companies_insert_own_or_admin" on public.companies;
create policy "companies_insert_own_or_admin"
  on public.companies for insert
  to authenticated
  with check (
    (auth.uid() = user_id and not is_catalog)
    or (is_catalog and public.is_app_admin())
  );

drop policy if exists "companies_update_own_or_admin" on public.companies;
create policy "companies_update_own_or_admin"
  on public.companies for update
  to authenticated
  using (
    (auth.uid() = user_id and not is_catalog)
    or (is_catalog and public.is_app_admin())
  )
  with check (
    (auth.uid() = user_id and not is_catalog)
    or (is_catalog and public.is_app_admin())
  );

drop policy if exists "companies_delete_own_or_admin" on public.companies;
create policy "companies_delete_own_or_admin"
  on public.companies for delete
  to authenticated
  using (
    (auth.uid() = user_id and not is_catalog)
    or (is_catalog and public.is_app_admin())
  );


-- ---------------------------------------------------------------------------
-- 5. RLS: EMPREENDIMENTOS
-- ---------------------------------------------------------------------------
-- Mesma logica das empresas, com is_catalog derivado da empresa. A escrita
-- tambem exige que a empresa seja do proprio usuario: antes bastava
-- user_id = auth.uid() na linha do empreendimento, o que permitia pendurar um
-- empreendimento na empresa de outra pessoa.

alter table public.developments enable row level security;

drop policy if exists "developments_all_own" on public.developments;

drop policy if exists "developments_select_own_or_catalog" on public.developments;
create policy "developments_select_own_or_catalog"
  on public.developments for select
  to authenticated
  using (auth.uid() = user_id or public.is_catalog_company(company_id));

drop policy if exists "developments_insert_own_or_admin" on public.developments;
create policy "developments_insert_own_or_admin"
  on public.developments for insert
  to authenticated
  with check (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );

drop policy if exists "developments_update_own_or_admin" on public.developments;
create policy "developments_update_own_or_admin"
  on public.developments for update
  to authenticated
  using (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  )
  with check (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );

drop policy if exists "developments_delete_own_or_admin" on public.developments;
create policy "developments_delete_own_or_admin"
  on public.developments for delete
  to authenticated
  using (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );


-- ---------------------------------------------------------------------------
-- 6. RLS: FILHAS DA EMPRESA (CORRESPONDENTES, COMISSAO, MATERIAL)
-- ---------------------------------------------------------------------------
-- correspondents, commission_rules, commission_campaigns e company_materials
-- seguem exatamente o mesmo desenho:
--
--   leitura : a propria linha OU qualquer linha de empresa do catalogo
--   escrita : a propria em empresa propria nao-catalogo
--             OU admin em empresa do catalogo
--
-- A leitura das linhas do catalogo e o coracao do vinculo: e ela que faz a
-- REGRA DE COMISSAO cadastrada pelo admin valer para quem adotou, sem copiar a
-- regra para a conta do corretor. Se o admin corrige o percentual, o proximo
-- lancamento do adotante ja sai com o valor novo.
--
-- A leitura nao exige adocao (mesmo motivo da vitrine em companies: a tela de
-- detalhe do catalogo mostra a regra e o material ANTES de o corretor aceitar
-- o aviso e adotar). Nada aqui e dado privado de outro corretor: e o catalogo
-- publicado pelo dono do app.

alter table public.correspondents enable row level security;

drop policy if exists "correspondents_all_own" on public.correspondents;

drop policy if exists "correspondents_select_own_or_catalog" on public.correspondents;
create policy "correspondents_select_own_or_catalog"
  on public.correspondents for select
  to authenticated
  using (auth.uid() = user_id or public.is_catalog_company(company_id));

drop policy if exists "correspondents_insert_own_or_admin" on public.correspondents;
create policy "correspondents_insert_own_or_admin"
  on public.correspondents for insert
  to authenticated
  with check (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );

drop policy if exists "correspondents_update_own_or_admin" on public.correspondents;
create policy "correspondents_update_own_or_admin"
  on public.correspondents for update
  to authenticated
  using (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  )
  with check (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );

drop policy if exists "correspondents_delete_own_or_admin" on public.correspondents;
create policy "correspondents_delete_own_or_admin"
  on public.correspondents for delete
  to authenticated
  using (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );


alter table public.commission_rules enable row level security;

drop policy if exists "commission_rules_all_own" on public.commission_rules;

drop policy if exists "commission_rules_select_own_or_catalog" on public.commission_rules;
create policy "commission_rules_select_own_or_catalog"
  on public.commission_rules for select
  to authenticated
  using (auth.uid() = user_id or public.is_catalog_company(company_id));

drop policy if exists "commission_rules_insert_own_or_admin" on public.commission_rules;
create policy "commission_rules_insert_own_or_admin"
  on public.commission_rules for insert
  to authenticated
  with check (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );

drop policy if exists "commission_rules_update_own_or_admin" on public.commission_rules;
create policy "commission_rules_update_own_or_admin"
  on public.commission_rules for update
  to authenticated
  using (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  )
  with check (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );

drop policy if exists "commission_rules_delete_own_or_admin" on public.commission_rules;
create policy "commission_rules_delete_own_or_admin"
  on public.commission_rules for delete
  to authenticated
  using (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );


alter table public.commission_campaigns enable row level security;

drop policy if exists "commission_campaigns_all_own" on public.commission_campaigns;

drop policy if exists "commission_campaigns_select_own_or_catalog" on public.commission_campaigns;
create policy "commission_campaigns_select_own_or_catalog"
  on public.commission_campaigns for select
  to authenticated
  using (auth.uid() = user_id or public.is_catalog_company(company_id));

drop policy if exists "commission_campaigns_insert_own_or_admin" on public.commission_campaigns;
create policy "commission_campaigns_insert_own_or_admin"
  on public.commission_campaigns for insert
  to authenticated
  with check (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );

drop policy if exists "commission_campaigns_update_own_or_admin" on public.commission_campaigns;
create policy "commission_campaigns_update_own_or_admin"
  on public.commission_campaigns for update
  to authenticated
  using (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  )
  with check (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );

drop policy if exists "commission_campaigns_delete_own_or_admin" on public.commission_campaigns;
create policy "commission_campaigns_delete_own_or_admin"
  on public.commission_campaigns for delete
  to authenticated
  using (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );


-- company_materials tem chave primaria (user_id, company_id): a linha do
-- catalogo e a do ADMIN. O app busca por company_id, entao a policy de leitura
-- precisa alcancar a linha do admin - de novo o vinculo, nao a copia.
alter table public.company_materials enable row level security;

drop policy if exists "company_materials_all_own" on public.company_materials;

drop policy if exists "company_materials_select_own_or_catalog" on public.company_materials;
create policy "company_materials_select_own_or_catalog"
  on public.company_materials for select
  to authenticated
  using (auth.uid() = user_id or public.is_catalog_company(company_id));

drop policy if exists "company_materials_insert_own_or_admin" on public.company_materials;
create policy "company_materials_insert_own_or_admin"
  on public.company_materials for insert
  to authenticated
  with check (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );

drop policy if exists "company_materials_update_own_or_admin" on public.company_materials;
create policy "company_materials_update_own_or_admin"
  on public.company_materials for update
  to authenticated
  using (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  )
  with check (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );

drop policy if exists "company_materials_delete_own_or_admin" on public.company_materials;
create policy "company_materials_delete_own_or_admin"
  on public.company_materials for delete
  to authenticated
  using (
    (auth.uid() = user_id and public.is_own_private_company(company_id))
    or (public.is_catalog_company(company_id) and public.is_app_admin())
  );


-- ---------------------------------------------------------------------------
-- 7. RLS: ADOCOES
-- ---------------------------------------------------------------------------
-- Cada um ve e mexe somente nas proprias adocoes. O with check impede gravar
-- adocao no nome de outro corretor.

alter table public.company_adoptions enable row level security;

drop policy if exists "company_adoptions_all_own" on public.company_adoptions;
create policy "company_adoptions_all_own"
  on public.company_adoptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.company_adoptions to authenticated;


-- ---------------------------------------------------------------------------
-- 8. STORAGE: BUCKET 'catalog' (FOTOS REDONDAS)
-- ---------------------------------------------------------------------------
-- PUBLICO de proposito. A foto e embutida no PDF da proposta, que e gerado no
-- CLIENTE: o gerador precisa baixar a imagem por URL simples, sem token e sem
-- sessao. Com bucket privado a URL assinada expiraria e a proposta sairia com
-- buraco no lugar da foto. Sao logos/fachadas de construtora - material de
-- divulgacao, nada sensivel.
--
-- O "do update set public = true" existe porque a migration pode ser rodada de
-- novo depois de alguem ter criado o bucket a mao como privado.

insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', true)
on conflict (id) do update set public = true;

-- Leitura liberada (inclusive anon): e o que sustenta a URL publica do PDF.
drop policy if exists "catalog_read_public" on storage.objects;
create policy "catalog_read_public"
  on storage.objects for select
  using (bucket_id = 'catalog');

-- Escrita: somente o admin publica/troca/apaga foto do catalogo.
drop policy if exists "catalog_insert_admin" on storage.objects;
create policy "catalog_insert_admin"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and public.is_app_admin());

drop policy if exists "catalog_update_admin" on storage.objects;
create policy "catalog_update_admin"
  on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and public.is_app_admin())
  with check (bucket_id = 'catalog' and public.is_app_admin());

drop policy if exists "catalog_delete_admin" on storage.objects;
create policy "catalog_delete_admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and public.is_app_admin());


-- ---------------------------------------------------------------------------
-- 9. STORAGE: RAIZ 'catalog/' DENTRO DO BUCKET 'uploads'
-- ---------------------------------------------------------------------------
-- O material de venda continua no bucket 'uploads' (privado, servido por URL
-- assinada) e ganha uma raiz nova: 'catalog/...' e o material do catalogo.
--
-- As policies antigas de 'uploads' exigem que a PRIMEIRA pasta do caminho seja
-- o uuid do usuario. Elas continuam valendo e nao foram tocadas - as policies
-- abaixo apenas se SOMAM a elas (policies permissivas combinam com OR). Nao ha
-- brecha: 'catalog' nunca e igual a um uuid, entao a policy antiga jamais
-- autoriza escrita nessa raiz, e as novas exigem admin.

-- Qualquer autenticado LE: quem adotou precisa baixar o material que o admin
-- subiu, e a lista de arquivos vem de um list() nesse prefixo.
drop policy if exists "uploads_catalog_select_authenticated" on storage.objects;
create policy "uploads_catalog_select_authenticated"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'catalog'
  );

drop policy if exists "uploads_catalog_insert_admin" on storage.objects;
create policy "uploads_catalog_insert_admin"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'catalog'
    and public.is_app_admin()
  );

drop policy if exists "uploads_catalog_update_admin" on storage.objects;
create policy "uploads_catalog_update_admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'catalog'
    and public.is_app_admin()
  )
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'catalog'
    and public.is_app_admin()
  );

drop policy if exists "uploads_catalog_delete_admin" on storage.objects;
create policy "uploads_catalog_delete_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = 'catalog'
    and public.is_app_admin()
  );


-- ---------------------------------------------------------------------------
-- 10. COTA DE ARMAZENAMENTO: 'catalog/' NAO E COBRADO DE NINGUEM
-- ---------------------------------------------------------------------------
-- O trigger public.enforce_storage_quota cobra o upload da cota do dono, e o
-- dono e deduzido da PRIMEIRA pasta do caminho (o uuid). Em 'catalog/...' nao
-- existe dono: o material e do sistema, usado por todos os adotantes. Cobrar
-- isso da cota do admin faria o catalogo do app crescer as custas do plano de
-- uma pessoa e, no limite, travaria a publicacao de material novo.
--
-- Dois desvios, entao:
--   a) raiz 'catalog' -> sai sem cobrar nada;
--   b) sem dono identificavel (caminho na raiz do bucket, ou upload por service
--      role, onde auth.uid() e nulo) -> sai sem cobrar, em vez de comparar com
--      um limite que nao pertence a ninguem.
-- O restante da regra fica exatamente como estava em 0015: limite da
-- assinatura, com fallback de 5 GB quando a assinatura nao tem limite gravado.
--
-- public.user_storage_used nao precisou mudar: ela soma apenas objetos cuja
-- primeira pasta e o uuid do usuario, e 'catalog' nunca casa com um uuid -
-- logo o material do catalogo ja nao entra no consumo de ninguem.

create or replace function public.enforce_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = storage, public
as $$
declare
  uid uuid := auth.uid();
  incoming bigint := coalesce((new.metadata->>'size')::bigint, 0);
  fallback bigint := 5::bigint * 1024 * 1024 * 1024;
  root text := (storage.foldername(new.name))[1];
  used bigint;
  lim bigint;
begin
  if new.bucket_id <> 'uploads' then
    return new;
  end if;

  -- Material do catalogo: do sistema, sem dono. Nao consome cota de ninguem.
  if root = 'catalog' then
    return new;
  end if;

  -- Sem dono para cobrar: nao inventa um limite, apenas nao cobra.
  if root is null or uid is null then
    return new;
  end if;

  select coalesce(storage_limit_bytes, 0) into lim
  from public.subscriptions
  where user_id = uid;

  if coalesce(lim, 0) <= 0 then
    lim := fallback;
  end if;

  select coalesce(public.user_storage_used(uid), 0) into used;

  if used + incoming > lim then
    raise exception
      'Limite de armazenamento do seu plano foi atingido (% de % bytes). Faça upgrade para o plano Pro.',
      used + incoming, lim
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_storage_quota on storage.objects;
create trigger enforce_storage_quota
  before insert on storage.objects
  for each row execute function public.enforce_storage_quota();
