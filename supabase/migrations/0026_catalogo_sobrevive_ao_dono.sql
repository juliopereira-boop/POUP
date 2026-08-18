-- ===========================================================================
-- 0026: O CATALOGO SOBREVIVE A EXCLUSAO DA CONTA QUE O CADASTROU
-- ===========================================================================
-- POR QUE ESTA MIGRATION EXISTE (o incidente)
-- ---------------------------------------------------------------------------
-- O catalogo do POUP (construtoras, empreendimentos, correspondentes, regras
-- de comissao e material de venda publicados pelo dono do app) e gravado nas
-- MESMAS tabelas dos cadastros privados dos corretores, com is_catalog = true e
-- user_id apontando para o admin que cadastrou.
--
-- Todas essas tabelas nasceram com:
--
--     user_id uuid not null references auth.users (id) on delete cascade
--
-- Consequencia: no dia em que a conta do admin foi excluida, o cascade levou
-- junto TODO o catalogo do aplicativo - inclusive as adocoes de outros
-- corretores, que morreram pelo company_id. Um unico "excluir minha conta"
-- apagou o acervo do produto inteiro. Foi exatamente o que aconteceu.
--
-- ---------------------------------------------------------------------------
-- POR QUE NAO BASTA TROCAR O CASCADE POR "ON DELETE SET NULL"
-- ---------------------------------------------------------------------------
-- Porque a chave estrangeira e cega: ela nao sabe diferenciar a linha do
-- catalogo da linha privada de um corretor comum. Com SET NULL na tabela
-- inteira, quando um corretor qualquer excluisse a conta dele, as empresas
-- PRIVADAS dele ficariam para tras como linhas orfas, invisiveis para todo
-- mundo e eternas no banco. Isso e lixo de dados e, pior, contraria o que a
-- exclusao de conta promete ao usuario (e o que a LGPD e a App Store cobram):
-- os dados dele tem que sumir de verdade.
--
-- O que se quer e uma regra CONDICIONAL:
--
--     linha do catalogo  -> solta do dono e continua existindo
--     linha privada      -> vai embora com o dono, como sempre foi
--
-- Chave estrangeira nao expressa condicao. Gatilho expressa. Por isso o
-- desenho abaixo:
--
--   1. user_id passa a ACEITAR nulo nessas tabelas (so aceitar; nada mais).
--   2. Um gatilho BEFORE DELETE em auth.users solta as linhas do CATALOGO do
--      dono (user_id = null) ANTES de o cascade rodar.
--   3. O cascade roda em seguida e nao encontra mais nada do catalogo para
--      apagar - nulo nao casa com o id que esta sendo excluido. As linhas
--      privadas, que o gatilho nao tocou, seguem sendo apagadas normalmente.
--
-- O cascade continua exatamente como estava. Nada foi afrouxado.
--
-- ---------------------------------------------------------------------------
-- POR QUE SOLTAR O DONO NAO QUEBRA A LEITURA DO CATALOGO
-- ---------------------------------------------------------------------------
-- Porque a RLS do catalogo (migration 0024) nunca dependeu de user_id para o
-- caminho do catalogo. Ela decide por is_catalog / is_catalog_company() na
-- leitura e por is_app_admin() na escrita:
--
--     companies      select : auth.uid() = user_id OR is_catalog
--     companies      write  : (auth.uid() = user_id AND NOT is_catalog)
--                             OR (is_catalog AND is_app_admin())
--     filhas         select : auth.uid() = user_id OR is_catalog_company(...)
--
-- Com user_id nulo o primeiro lado do OR simplesmente da falso, e o segundo -
-- o do catalogo - continua valendo igual. Ou seja: o corretor continua vendo e
-- adotando, e o proximo admin continua editando. Nada no aplicativo precisou
-- mudar por causa desta migration.
--
-- ---------------------------------------------------------------------------
-- ESTA MIGRATION NAO RECUPERA O QUE JA FOI PERDIDO
-- ---------------------------------------------------------------------------
-- Ela impede a repeticao. Dado ja apagado so volta por backup do banco
-- (Supabase -> Database -> Backups), e backup tem prazo: quanto mais tempo
-- passa, menor a chance. Ver supabase/admin_recuperar_acesso.sql.
--
-- Migration idempotente: pode ser executada mais de uma vez.
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. PERMITIR user_id NULO NAS TABELAS DO CATALOGO
-- ---------------------------------------------------------------------------
-- "Permitir" e a palavra exata: nenhuma linha existente e alterada aqui, e o
-- aplicativo continua gravando o user_id em todo insert (o with check da RLS
-- exige isso para linha privada). Nulo passa a ser possivel apenas como
-- resultado do gatilho do passo 3 - o estado "linha do catalogo, sem dono".

alter table public.companies            alter column user_id drop not null;
alter table public.developments         alter column user_id drop not null;
alter table public.correspondents       alter column user_id drop not null;
alter table public.commission_rules     alter column user_id drop not null;
alter table public.commission_campaigns alter column user_id drop not null;

comment on column public.companies.user_id is
  'Dono da linha. NULO significa "linha do catalogo do POUP sem dono": o admin que a cadastrou excluiu a conta e o gatilho detach_catalog_before_user_delete a soltou, para o catalogo nao morrer junto. Linha privada (is_catalog = false) NUNCA pode ficar nula - ver o check companies_owner_required.';


-- ---------------------------------------------------------------------------
-- 2. TRAVA: LINHA PRIVADA CONTINUA OBRIGADA A TER DONO
-- ---------------------------------------------------------------------------
-- O passo 1 abriu a porta para nulo na tabela inteira. Este check fecha a
-- porta de novo para tudo que NAO e catalogo: empresa privada sem dono seria
-- exatamente o lixo invisivel que esta migration quer evitar.
--
-- So companies tem is_catalog proprio, entao so ela consegue expressar a
-- condicao em um check (check nao aceita subconsulta). As tabelas filhas ficam
-- protegidas pelo gatilho, que so solta linha de empresa do catalogo, e pela
-- RLS, que ja exige auth.uid() = user_id em toda escrita privada.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'companies_owner_required'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_owner_required
      check (is_catalog or user_id is not null);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. company_materials: TROCA DE CHAVE PRIMARIA
-- ---------------------------------------------------------------------------
-- Esta tabela e a unica em que user_id faz parte da CHAVE PRIMARIA
-- (user_id, company_id) - e coluna de chave primaria e obrigatoriamente NOT
-- NULL, entao o passo 1 nao teria como se aplicar aqui e o link do material de
-- venda do catalogo continuaria morrendo com o admin.
--
-- A saida e uma chave primaria propria (id) e um indice unico em
-- (user_id, company_id) no lugar da antiga chave composta. O indice unico e o
-- que o upsert do aplicativo usa: o `onConflict: 'user_id,company_id'` do
-- SupabaseMaterialRepository infere por indice unico, nao por chave primaria,
-- entao ele continua funcionando sem nenhuma alteracao de codigo.

alter table public.company_materials
  add column if not exists id uuid not null default gen_random_uuid();

do $$
begin
  -- Sai a chave composta (e com ela a obrigatoriedade de user_id).
  if exists (
    select 1 from pg_constraint
    where conname = 'company_materials_pkey'
      and conrelid = 'public.company_materials'::regclass
      and contype = 'p'
  ) and not exists (
    -- ...somente se ela ainda for a composta: se ja for a de `id`, nao mexe.
    select 1 from pg_index i
    where i.indrelid = 'public.company_materials'::regclass
      and i.indisprimary
      and i.indnatts = 1
  ) then
    alter table public.company_materials drop constraint company_materials_pkey;
    alter table public.company_materials add constraint company_materials_pkey primary key (id);
  end if;
end $$;

-- O que o upsert do aplicativo passa a usar. Continua impedindo duas linhas de
-- material do mesmo usuario para a mesma empresa.
create unique index if not exists company_materials_user_company_key
  on public.company_materials (user_id, company_id);

alter table public.company_materials alter column user_id drop not null;

comment on column public.company_materials.user_id is
  'Dono da linha. Nulo = material do catalogo cujo admin excluiu a conta (ver gatilho detach_catalog_before_user_delete). A leitura do catalogo e por company_id, entao o link continua chegando a quem adotou.';


-- ---------------------------------------------------------------------------
-- 4. O GATILHO: SOLTAR O CATALOGO ANTES DE O CASCADE PASSAR
-- ---------------------------------------------------------------------------
-- BEFORE DELETE em auth.users. Roda antes de o Postgres propagar o cascade,
-- entao a hora de desligar o vinculo e aqui: depois nao ha mais linha para
-- desligar.
--
-- A ORDEM E DE PROPOSITO: primeiro as filhas, depois a empresa. Todas as
-- filhas descobrem que sao do catalogo perguntando a empresa (is_catalog), e
-- essa pergunta so tem resposta enquanto a empresa ainda estiver marcada -
-- o que continua verdadeiro aqui, ja que soltamos o dono sem tocar em
-- is_catalog. Ainda assim, filhas primeiro e a ordem que nao depende de
-- nenhuma sutileza de visibilidade dentro da transacao.
--
-- Somente linha de empresa do CATALOGO e solta. Linha privada nao e tocada e
-- segue sendo apagada pelo cascade, como o usuario espera ao excluir a conta.

create or replace function public.detach_catalog_from_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.developments d
     set user_id = null
   where d.user_id = old.id
     and exists (select 1 from public.companies c
                  where c.id = d.company_id and c.is_catalog);

  update public.correspondents t
     set user_id = null
   where t.user_id = old.id
     and exists (select 1 from public.companies c
                  where c.id = t.company_id and c.is_catalog);

  update public.commission_rules r
     set user_id = null
   where r.user_id = old.id
     and exists (select 1 from public.companies c
                  where c.id = r.company_id and c.is_catalog);

  update public.commission_campaigns k
     set user_id = null
   where k.user_id = old.id
     and exists (select 1 from public.companies c
                  where c.id = k.company_id and c.is_catalog);

  update public.company_materials m
     set user_id = null
   where m.user_id = old.id
     and exists (select 1 from public.companies c
                  where c.id = m.company_id and c.is_catalog);

  update public.companies
     set user_id = null
   where user_id = old.id
     and is_catalog;

  return old;
end;
$$;

comment on function public.detach_catalog_from_user() is
  'BEFORE DELETE em auth.users: solta do dono as linhas do catalogo (user_id = null) para que o cascade nao apague o acervo do aplicativo junto com a conta do admin. Linhas privadas nao sao tocadas e continuam sendo apagadas.';

drop trigger if exists detach_catalog_before_user_delete on auth.users;
create trigger detach_catalog_before_user_delete
  before delete on auth.users
  for each row execute function public.detach_catalog_from_user();


-- ---------------------------------------------------------------------------
-- 5. CONFERENCIA
-- ---------------------------------------------------------------------------
-- Depois de rodar, isto tem que devolver uma linha. Se nao devolver, o gatilho
-- nao foi criado e o catalogo continua exposto.

select tgname as gatilho, tgrelid::regclass as tabela, tgenabled as estado
from pg_trigger
where tgname = 'detach_catalog_before_user_delete';
