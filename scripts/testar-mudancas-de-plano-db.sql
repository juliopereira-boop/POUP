-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-mudancas-de-plano-db.sql
--
-- O que este arquivo prova (migration 20260928180000):
--   1. o corretor grava o motivo dele (o user_id vem do login);
--   2. não grava em nome de outro, nem motivo fora da lista, nem "outro" sem
--      explicar;
--   3. lê só os dele; o admin lê todos.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20260928180000_mudancas_de_plano.sql
-- Idempotente.
\ir ../supabase/migrations/20260928180000_mudancas_de_plano.sql

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'u1@example.invalid', '{}'),
  ('00000000-0000-4000-8000-000000000002', 'u2@example.invalid', '{}'),
  ('00000000-0000-4000-8000-000000000008', 'u8@example.invalid', '{}');
insert into public.app_admins (user_id) values ('00000000-0000-4000-8000-000000000008');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  insert into public.mudancas_de_plano (de, para, motivo, plataforma) values ('pro', 'start', 'caro', 'ios');
  assert (select user_id from public.mudancas_de_plano limit 1) = '00000000-0000-4000-8000-000000000001', '1: user_id do login';

  begin
    insert into public.mudancas_de_plano (user_id, de, para, motivo) values ('00000000-0000-4000-8000-000000000002', 'pro', 'start', 'caro');
    raise exception '2a: gravou em nome de outro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.mudancas_de_plano (de, para, motivo) values ('pro', 'start', 'porque sim');
    raise exception '2b: motivo fora da lista';
  exception when check_violation then null;
  end;
  begin
    insert into public.mudancas_de_plano (de, para, motivo, comentario) values ('pro', 'cancelar', 'outro', ' ');
    raise exception '2c: outro sem explicar';
  exception when check_violation then null;
  end;
  insert into public.mudancas_de_plano (de, para, motivo, comentario) values ('pro', 'cancelar', 'outro', 'Mudei de ramo');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.mudancas_de_plano) = 0, '3a: outro corretor não lê';
  begin
    update public.mudancas_de_plano set motivo = 'caro';
    raise exception '3b: update liberado';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.mudancas_de_plano) = 2, '3c: admin lê todos';
end $$;

reset role;
rollback;
\echo 'mudanças de plano: tudo certo'
