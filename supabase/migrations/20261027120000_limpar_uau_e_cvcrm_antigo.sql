-- ===========================================================================
-- LIMPEZA: O UAU E A PRIMEIRA VERSÃO DO CV (UMA CONTA SÓ)
-- ===========================================================================
-- Autorizada pelo dono do POUP em 27/10/2026 ("pode apagar").
--
-- A disponibilidade vem do CV CRM de cada construtora
-- (20261026180000_cvcrm_por_empresa.sql). Saem:
--   • tudo do UAU: tabelas, funções, a coluna developments.uau_fonte_preco e
--     os segredos do Vault;
--   • as cópias "_antiga" da primeira versão do CV e as três funções
--     "obsoleta" que só existiam para recusar chamada com a assinatura velha.
--
-- FICA `development_unit_disponibilidade`: nasceu na migration do UAU, mas é
-- a tabela de cores do CV (e vai pelo Realtime).
--
-- FICAM, POR COMPATIBILIDADE, duas funções com nome do UAU e SEM NENHUM dado
-- do UAU: o app iOS da build 9 (versão 1.0.1) ainda chama
-- `uau_disponibilidade` e `uau_empreendimentos_com_preco`. Elas agora
-- devolvem as cores do CV no formato que aquela versão espera. Saem quando
-- ninguém mais usar a 1.0.1.
--
-- Rodar de novo não faz nada (if exists / create or replace).
-- ===========================================================================


-- 1. COMPATIBILIDADE COM O APP 1.0.1 ----------------------------------------

-- As cores do CV, no formato da 1.0.1 ("temUau" = o empreendimento tem o CV
-- ligado). Sem valor do UAU e sem fonte de preço: vale a tabela de preço.
create or replace function public.uau_disponibilidade(p_development uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := public.disponibilidade_do_empreendimento(p_development);
begin
  return jsonb_build_object(
    'temUau', coalesce((v ->> 'ativa')::boolean, false),
    'atualizadoEm', v -> 'atualizadoEm',
    'fontePreco', 'automatico',
    'unidades', coalesce(v -> 'unidades', '[]'::jsonb));
end;
$$;

comment on function public.uau_disponibilidade(uuid) is
  'Compatibilidade com o app 1.0.1 (build 9): as cores do CV no formato antigo. Nada do UAU.';

revoke all on function public.uau_disponibilidade(uuid) from public, anon;
grant execute on function public.uau_disponibilidade(uuid) to authenticated, service_role;

-- Nenhum empreendimento usa preço do UAU: lista vazia.
create or replace function public.uau_empreendimentos_com_preco()
returns table (development_id uuid, fonte_preco text)
language sql
stable
set search_path = public
as $$
  select null::uuid, null::text where false;
$$;

comment on function public.uau_empreendimentos_com_preco() is
  'Compatibilidade com o app 1.0.1 (build 9): nenhum empreendimento usa preço do UAU.';

revoke all on function public.uau_empreendimentos_com_preco() from public, anon;
grant execute on function public.uau_empreendimentos_com_preco() to authenticated, service_role;


-- 2. AS TABELAS DO UAU ------------------------------------------------------
-- Os gatilhos `uau_unidades_mudaram` e `uau_status_mudou` saem com as tabelas.
drop table if exists public.development_unit_uau;
drop table if exists public.uau_unidades;
drop table if exists public.uau_status_situacao;
drop table if exists public.uau_sync_log;
drop table if exists public.uau_sync_trava;
drop table if exists public.development_uau_obras;

alter table public.developments drop column if exists uau_fonte_preco;


-- 3. AS FUNÇÕES DO UAU ------------------------------------------------------
drop function if exists public.uau_aplicar_leitura(integer, text, text, jsonb, smallint[], smallint);
drop function if exists public.uau_classificar_status(smallint, text);
drop function if exists public.uau_codigos_vendidos();
drop function if exists public.uau_confere_segredo_do_cron(text);
drop function if exists public.uau_conferencia(uuid);
drop function if exists public.uau_definir_fonte_preco(uuid, text);
drop function if exists public.uau_exigir_admin(uuid);
drop function if exists public.uau_mesmo_identificador(text, text);
drop function if exists public.uau_painel();
drop function if exists public.uau_recalcular_disponibilidade(uuid[]);
drop function if exists public.uau_registrar_erro(integer, text, text);
drop function if exists public.uau_remover_obra(uuid, integer, text);
drop function if exists public.uau_salvar_obra(uuid, integer, text, boolean);
drop function if exists public.uau_salvar_vinculos(uuid, jsonb, uuid[]);
drop function if exists public.uau_sync_iniciar(text, interval);
drop function if exists public.uau_sync_terminar(text);
drop function if exists public.uau_trg_status_mudou();
drop function if exists public.uau_trg_unidades_mudaram();


-- 4. OS SEGREDOS DO UAU NO VAULT --------------------------------------------
delete from vault.secrets where name in ('uau_sync_secret', 'uau_project_url');


-- 5. A PRIMEIRA VERSÃO DO CV (UMA CONTA SÓ) ----------------------------------
drop table if exists public.development_unit_cvcrm_antiga;
drop table if exists public.cvcrm_unidades_antiga;
drop table if exists public.development_cvcrm_empreendimentos_antiga;

drop function if exists public.cvcrm_aplicar_leitura(integer, integer, text, jsonb);
drop function if exists public.cvcrm_aplicar_mudancas(jsonb);
drop function if exists public.cvcrm_registrar_erro(integer, integer, text);
