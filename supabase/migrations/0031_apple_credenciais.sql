-- ===========================================================================
-- 0031: CREDENCIAL DA APPLE, PARA PODER REVOGAR NA EXCLUSAO DA CONTA
-- ===========================================================================
-- POR QUE ISTO EXISTE
-- ---------------------------------------------------------------------------
-- A Apple exige que um aplicativo com Sign in with Apple **revogue os tokens**
-- quando o usuario exclui a conta. Nao basta apagar a linha do nosso banco: do
-- lado da Apple a autorizacao continuaria valendo, e o app apareceria para
-- sempre na lista "Apps usando seu Apple ID" de alguem que ja foi embora.
--
-- Revogar exige um `refresh_token` da Apple. Ele so pode ser obtido no momento
-- do login, trocando o `authorizationCode` (que vale poucos minutos) por um
-- token duradouro. Ou seja: e preciso guardar no login para conseguir revogar
-- na exclusao, semanas depois.
--
-- ---------------------------------------------------------------------------
-- ESTA TABELA E MAIS SENSIVEL QUE AS OUTRAS
-- ---------------------------------------------------------------------------
-- Um `refresh_token` da Apple e uma credencial viva. Por isso, ao contrario de
-- todas as outras tabelas do POUP, esta **nao tem policy nenhuma** -- nem de
-- leitura para o proprio dono.
--
-- Com RLS ligado e zero policies, o resultado e: ninguem alcanca pelo
-- aplicativo. So a chave de service role, que vive apenas dentro das Edge
-- Functions, consegue ler ou escrever. O usuario nao precisa ver este dado, e
-- o que ninguem precisa ver nao deve ser exposto.
--
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================

create table if not exists public.apple_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  /** refresh_token devolvido pela Apple na troca do authorization code. */
  refresh_token text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.apple_credentials is
  'refresh_token da Apple, usado so para revogar a autorizacao quando a conta e excluida. Sem policy: apenas service role.';

alter table public.apple_credentials enable row level security;

-- Sem policies, de proposito. Ver o cabecalho.
-- Qualquer `create policy` aqui abre uma credencial viva para o aplicativo.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'apple_credentials_token_nao_vazio') then
    alter table public.apple_credentials add constraint apple_credentials_token_nao_vazio
      check (length(btrim(refresh_token)) > 0);
  end if;
end
$$;


-- ===========================================================================
-- CONFERENCIA
-- ===========================================================================
-- A tabela precisa estar com RLS ligado e ZERO policies:
--   select relrowsecurity from pg_class where relname = 'apple_credentials';
--   select count(*) from pg_policies where tablename = 'apple_credentials';
--
-- ---------------------------------------------------------------------------
-- SEGREDOS QUE PRECISAM EXISTIR NAS EDGE FUNCTIONS
-- ---------------------------------------------------------------------------
-- Sem eles a revogacao nao acontece (e a exclusao avisa isso no log):
--
--   APPLE_TEAM_ID      -- 10 caracteres, no topo direito do developer.apple.com
--   APPLE_KEY_ID       -- do arquivo .p8 gerado em Keys
--   APPLE_PRIVATE_KEY  -- conteudo do .p8, com as linhas BEGIN/END
--   APPLE_CLIENT_ID    -- o bundle identifier do app (ex.: online.poupcrm.app)
--
-- O .p8 e baixavel UMA vez. Guarde em lugar seguro antes de colar aqui.
-- ===========================================================================
