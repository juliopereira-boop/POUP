-- ===========================================================================
-- RECUPERAR O ACESSO DE ADMIN
-- ===========================================================================
-- Rode no Supabase: SQL Editor -> New query -> colar -> Run.
--
-- Este arquivo NAO e uma migration: e um utilitario para rodar a mao quando
-- for preciso promover uma conta a administrador do POUP.
--
-- ---------------------------------------------------------------------------
-- ANTES DE QUALQUER COISA: BACKUP (isto e urgente e tem prazo)
-- ---------------------------------------------------------------------------
-- Se voce chegou aqui porque PERDEU DADOS (o catalogo sumiu junto com a conta
-- excluida), pare e va primeiro em:
--
--     Supabase -> Database -> Backups
--
-- E o unico caminho que traz o dado de volta. Backup tem janela de retencao:
-- cada dia que passa e uma chance a menos. Restaurar cria uma copia do banco
-- no ponto no tempo escolhido - escolha um horario ANTES da exclusao.
--
-- Este arquivo nao recupera dado nenhum. Ele so devolve o ACESSO de admin.
--
-- ---------------------------------------------------------------------------
-- PARA NAO ACONTECER DE NOVO
-- ---------------------------------------------------------------------------
-- Rode a migration supabase/migrations/0026_catalogo_sobrevive_ao_dono.sql.
-- Depois dela, excluir a conta do admin nao apaga mais o catalogo: as linhas
-- do catalogo se soltam do dono e continuam existindo. E a Edge Function
-- delete-account passa a recusar a exclusao de uma conta que esteja em
-- app_admins, para o acesso de admin nao evaporar por um toque.
--
-- ---------------------------------------------------------------------------
-- COMO USAR
-- ---------------------------------------------------------------------------
-- 1. Crie a conta de novo no app (cadastro normal). Este script NAO cria
--    usuario - ele so promove um usuario que ja existe.
-- 2. Troque o e-mail nos dois lugares marcados com <<<<<< TROQUE AQUI.
-- 3. Rode o PASSO 1 sozinho e leia o resultado. Depois rode o resto.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- PASSO 1 - Diagnostico: o que sobrou no banco?
-- ---------------------------------------------------------------------------
-- Rode este bloco PRIMEIRO, sozinho, e leia o resultado antes de continuar.
-- Se "empresas_catalogo" for maior que zero, nem tudo se perdeu.
-- "catalogo_sem_dono" so aparece depois da migration 0026: e a contagem de
-- linhas do catalogo que sobreviveram a exclusao de quem as cadastrou.

select
  (select count(*) from auth.users)                                    as usuarios,
  (select count(*) from public.app_admins)                             as admins,
  (select count(*) from public.companies)                              as empresas_total,
  (select count(*) from public.companies where is_catalog)             as empresas_catalogo,
  (select count(*) from public.companies
     where is_catalog and user_id is null)                             as catalogo_sem_dono,
  (select count(*) from public.developments)                           as empreendimentos,
  (select count(*) from public.correspondents)                         as correspondentes,
  (select count(*) from public.company_adoptions)                      as adocoes;


-- ---------------------------------------------------------------------------
-- PASSO 2 - Promover a conta a administrador
-- ---------------------------------------------------------------------------
-- Troque o e-mail abaixo pelo da conta que voce acabou de criar no app.

do $$
declare
  v_email text := 'gestao@poupgestao.com';   -- <<<<<< TROQUE AQUI
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_email);

  if v_user_id is null then
    raise exception
      'Nao existe usuario com o e-mail %. Crie a conta no app primeiro (tela de cadastro) e rode de novo.',
      v_email;
  end if;

  insert into public.app_admins (user_id, note)
  values (v_user_id, 'dono do app')
  on conflict (user_id) do nothing;

  raise notice 'Pronto: % agora e administrador (user_id = %).', v_email, v_user_id;
end $$;


-- ---------------------------------------------------------------------------
-- PASSO 3 - Conferir
-- ---------------------------------------------------------------------------
-- Tem que aparecer uma linha com o seu e-mail.

select u.email, a.note, a.created_at
from public.app_admins a
join auth.users u on u.id = a.user_id;


-- ---------------------------------------------------------------------------
-- PASSO 4 (opcional) - Liberar acesso sem passar pela assinatura
-- ---------------------------------------------------------------------------
-- A conta precisa de assinatura ativa para entrar no app. Enquanto voce estiver
-- testando, isto libera o acesso da SUA conta sem passar pelo Stripe.
-- Troque o e-mail pelo mesmo do passo 2.

do $$
declare
  v_email text := 'gestao@poupgestao.com';   -- <<<<<< TROQUE AQUI
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_email);
  if v_user_id is null then
    raise exception 'Usuario % nao encontrado.', v_email;
  end if;

  insert into public.subscriptions (user_id, status, plan_tier, storage_limit_bytes)
  values (v_user_id, 'active', 'pro', 25 * 1024 * 1024 * 1024)
  on conflict (user_id) do update
    set status              = 'active',
        plan_tier           = 'pro',
        storage_limit_bytes = 25 * 1024 * 1024 * 1024;

  raise notice 'Assinatura Pro ativada para % (uso interno/teste).', v_email;
end $$;


-- ---------------------------------------------------------------------------
-- PASSO 5 (opcional) - Adotar de volta o catalogo orfao
-- ---------------------------------------------------------------------------
-- Se o PASSO 1 mostrou "catalogo_sem_dono" maior que zero, as empresas do
-- catalogo continuam la, apenas sem dono - e o app ja as mostra para todos,
-- porque a RLS do catalogo decide por is_catalog, nao por user_id.
--
-- Este passo apenas ASSUME a autoria delas de novo, para o painel do admin
-- listar essas empresas como suas. E cosmetico: nao rode se nao precisar.

-- do $$
-- declare
--   v_email text := 'gestao@poupgestao.com';   -- <<<<<< TROQUE AQUI
--   v_user_id uuid;
-- begin
--   select id into v_user_id from auth.users where lower(email) = lower(v_email);
--   if v_user_id is null then
--     raise exception 'Usuario % nao encontrado.', v_email;
--   end if;
--
--   update public.companies      set user_id = v_user_id where is_catalog and user_id is null;
--   update public.developments   d set user_id = v_user_id where d.user_id is null
--     and exists (select 1 from public.companies c where c.id = d.company_id and c.is_catalog);
--   update public.correspondents t set user_id = v_user_id where t.user_id is null
--     and exists (select 1 from public.companies c where c.id = t.company_id and c.is_catalog);
--   update public.commission_rules r set user_id = v_user_id where r.user_id is null
--     and exists (select 1 from public.companies c where c.id = r.company_id and c.is_catalog);
--   update public.commission_campaigns k set user_id = v_user_id where k.user_id is null
--     and exists (select 1 from public.companies c where c.id = k.company_id and c.is_catalog);
--   -- o "not exists" evita esbarrar no indice unico (user_id, company_id) caso
--   -- a conta nova ja tenha uma linha de material para a mesma empresa.
--   update public.company_materials m set user_id = v_user_id where m.user_id is null
--     and exists (select 1 from public.companies c where c.id = m.company_id and c.is_catalog)
--     and not exists (select 1 from public.company_materials x
--                      where x.company_id = m.company_id and x.user_id = v_user_id);
--
--   raise notice 'Catalogo orfao reatribuido a %.', v_email;
-- end $$;
