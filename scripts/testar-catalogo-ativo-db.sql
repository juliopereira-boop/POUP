-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-catalogo-ativo-db.sql
--
-- Migration 20260927120000: empresa do catálogo nasce inativa, só o admin vê
-- (ela e os empreendimentos dela); ativada, aparece para todos. Tipo do
-- corretor e percentual Imob com as validações.
\set ON_ERROR_STOP on
begin;
create table if not exists public.profiles (id uuid primary key references auth.users (id), full_name text);
create table if not exists public.commission_rules (id uuid primary key default gen_random_uuid(), company_id uuid unique, default_pct numeric not null default 2);
-- O andaime tem uma policy simplificada; a de verdade vem da migration.
drop policy if exists sel on public.companies;
alter table public.companies add column if not exists ativa boolean;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'), -- corretor
  ('00000000-0000-4000-8000-000000000008'); -- admin
insert into public.app_admins values ('00000000-0000-4000-8000-000000000008');
-- Antes da migration: uma empresa do catálogo que já existia.
insert into public.companies (id, user_id, name, is_catalog) values
  ('c0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000008', 'Canopus', true);

\ir ../supabase/migrations/20260927120000_catalogo_ativo_e_comissao_por_tipo.sql
\ir ../supabase/migrations/20260927120000_catalogo_ativo_e_comissao_por_tipo.sql

-- Depois: uma empresa nova no catálogo (nasce inativa, pelo default) e uma particular do corretor.
insert into public.companies (id, user_id, name, is_catalog) values
  ('c0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008', 'Construtora Nova', true),
  ('c0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Minha Particular', false);
insert into public.developments (company_id, user_id, name) values
  ('c0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000008', 'Village Antigo'),
  ('c0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008', 'Village Novo');

do $$
begin
  assert (select ativa from public.companies where id = 'c0000000-0000-4000-8000-000000000001'), 'a que já existia continua ativa';
  assert not (select ativa from public.companies where id = 'c0000000-0000-4000-8000-000000000002'), 'a nova nasce inativa';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  assert (select string_agg(name, ',' order by name) from public.companies) = 'Canopus,Minha Particular',
         'corretor não vê a inativa: ' || (select string_agg(name, ',' order by name) from public.companies);
  assert (select string_agg(name, ',' order by name) from public.developments) = 'Village Antigo',
         'nem os empreendimentos dela';
  assert not public.is_catalog_company('c0000000-0000-4000-8000-000000000002'), 'para o corretor, inativa não é catálogo';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.companies where is_catalog) = 2, 'o admin vê as duas';
  assert (select count(*) from public.developments) = 2, 'e os empreendimentos das duas';
end $$;

reset role;
update public.companies set ativa = true where id = 'c0000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.companies where is_catalog) = 2, 'ativada, aparece para o corretor';
  assert (select count(*) from public.developments) = 2, 'com os empreendimentos';
end $$;
reset role;

-- Tipo do corretor e percentual Imob.
insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000001');
update public.profiles set tipo_corretor = 'house';
update public.profiles set tipo_corretor = 'imob';
update public.profiles set tipo_corretor = null;
do $$
begin
  begin
    update public.profiles set tipo_corretor = 'autonomo';
    raise exception 'tipo inválido deveria ser recusado';
  exception when check_violation then null;
  end;
end $$;
insert into public.commission_rules (company_id, default_pct, pct_imob) values ('c0000000-0000-4000-8000-000000000001', 5, 4);
do $$
begin
  begin
    update public.commission_rules set pct_imob = 120;
    raise exception 'percentual acima de 100 deveria ser recusado';
  exception when check_violation then null;
  end;
end $$;

select 'catálogo ativo e comissão por tipo: todas as verificações passaram' as resultado;
rollback;
