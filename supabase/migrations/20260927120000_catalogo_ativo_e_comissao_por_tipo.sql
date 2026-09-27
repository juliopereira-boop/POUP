-- AJUSTES DE SETEMBRO: catálogo com empresa inativa, corretor House/Imob e a
-- regra de comissão de cada tipo.
--
--   1. companies.ativa — empresa do CATÁLOGO nasce inativa: só o admin a vê
--      até ativar. Ao ativar, aparece para todos os corretores (com os
--      empreendimentos, correspondentes, regras e materiais dela). As que já
--      existem continuam ativas: nada some da tela de ninguém.
--   2. profiles.tipo_corretor — 'house' (corretor da casa/construtora) ou
--      'imob' (de imobiliária parceira).
--   3. commission_rules.pct_imob — o percentual do corretor Imob. O
--      `default_pct` de sempre passa a ser o do House (e vale para quem ainda
--      não escolheu o tipo). `pct_imob` vazio = mesmo percentual do House.
--
-- Idempotente.

-- ---------------------------------------------------------------------------
-- 1. EMPRESA DO CATÁLOGO ATIVA / INATIVA
-- ---------------------------------------------------------------------------
alter table public.companies add column if not exists ativa boolean;
update public.companies set ativa = true where ativa is null;
alter table public.companies alter column ativa set default false;
alter table public.companies alter column ativa set not null;

comment on column public.companies.ativa is
  'Só vale para o catálogo: inativa = só o admin vê. Nasce false; as que existiam antes ficaram true.';

-- A leitura de tudo que é "filho" de uma empresa do catálogo (empreendimentos,
-- correspondentes, regras de comissão, campanhas, materiais, blocos e
-- unidades) passa por esta função. Inativa = não é catálogo para quem não é admin.
create or replace function public.is_catalog_company(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.companies c
    where c.id = cid and c.is_catalog and (c.ativa or public.is_app_admin())
  );
$$;

comment on function public.is_catalog_company(uuid) is
  'true quando a empresa e do catalogo do POUP e esta ativa (ou quem pergunta e admin). Usada pelas policies das tabelas filhas.';

revoke all on function public.is_catalog_company(uuid) from public, anon;
grant execute on function public.is_catalog_company(uuid) to authenticated, service_role;

drop policy if exists "companies_select_own_or_catalog" on public.companies;
create policy "companies_select_own_or_catalog"
  on public.companies for select
  to authenticated
  using (auth.uid() = user_id or (is_catalog and (ativa or public.is_app_admin())));


-- ---------------------------------------------------------------------------
-- 2. TIPO DO CORRETOR
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists tipo_corretor text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_tipo_corretor_valido') then
    alter table public.profiles add constraint profiles_tipo_corretor_valido
      check (tipo_corretor is null or tipo_corretor in ('house', 'imob'));
  end if;
end $$;

comment on column public.profiles.tipo_corretor is
  'house = corretor da casa; imob = corretor de imobiliária parceira. Decide qual percentual da regra de comissão vale.';


-- ---------------------------------------------------------------------------
-- 3. PERCENTUAL DO CORRETOR IMOB
-- ---------------------------------------------------------------------------
alter table public.commission_rules add column if not exists pct_imob numeric;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'commission_rules_pct_imob_valido') then
    alter table public.commission_rules add constraint commission_rules_pct_imob_valido
      check (pct_imob is null or (pct_imob >= 0 and pct_imob <= 100));
  end if;
end $$;

comment on column public.commission_rules.pct_imob is
  '% sobre o valor da unidade para o corretor Imob. null = o mesmo default_pct (que é o do House).';
