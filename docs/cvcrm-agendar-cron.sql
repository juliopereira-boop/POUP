-- ===========================================================================
-- DISPONIBILIDADE DO CV — O SEGREDO DO CRON E OS JOBS
-- ===========================================================================
-- Já rodado no projeto do POUP em 26/10/2026. Fica aqui para refazer em
-- outro projeto (homologação) ou depois de uma restauração. Rode no SQL
-- Editor, parte por parte. Precisa do pg_net e do pg_cron ligados.
--
-- Antes: a migration 20261026120000_disponibilidade_cvcrm.sql aplicada, as
-- funções `cvcrm-disponibilidade-sync` (Verify JWT DESLIGADO) e
-- `cvcrm-disponibilidade` (Verify JWT LIGADO) publicadas, e os secrets
-- CVCRM_URL, CVCRM_EMAIL e CVCRM_TOKEN cadastrados em Edge Functions → Secrets.
-- ===========================================================================


-- 1. O SEGREDO DO CRON E A URL DO PROJETO, NO VAULT ---------------------------
-- O segredo é gerado aqui mesmo: ninguém digita, ninguém vê. A função do cron
-- confere o cabeçalho `x-sync-secret` contra ele (`cvcrm_confere_segredo_do_cron`).
-- Troque <ref> pelo id do projeto (Settings → General).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cvcrm_sync_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cvcrm_sync_secret',
      'Segredo do cron da disponibilidade do CV CRM (x-sync-secret). Gerado no banco.');
  end if;
  if not exists (select 1 from vault.secrets where name = 'cvcrm_project_url') then
    perform vault.create_secret('https://<ref>.supabase.co', 'cvcrm_project_url',
      'URL do projeto, para o cron chamar as Edge Functions do CV CRM.');
  end if;
end $$;


-- 2. O PING: confere os secrets do CV e o acesso ----------------------------
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'cvcrm_project_url') || '/functions/v1/cvcrm-disponibilidade-sync',
  headers := jsonb_build_object('Content-Type', 'application/json',
                                'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cvcrm_sync_secret')),
  body := '{"modo":"ping"}'::jsonb,
  timeout_milliseconds := 60000) as pedido;
-- Uns segundos depois (troque o número pelo que voltou acima):
--   select status_code, content from net._http_response where id = <pedido>;
-- Esperado: 200 e {"ok":true,"empreendimentos":<quantos o CV tem>}.
-- A primeira chamada depois de publicar pode voltar "JWT issued at future":
-- é o relógio do serviço; rode de novo.


-- 3. OS JOBS -----------------------------------------------------------------
-- Leve: de minuto em minuto, o histórico de situação do CVDW (uma chamada para
-- todos os empreendimentos). Completa: às :07 e :37, o mapa inteiro de cada
-- empreendimento vinculado.
select cron.schedule('cvcrm-disponibilidade-leve', '* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cvcrm_project_url') || '/functions/v1/cvcrm-disponibilidade-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cvcrm_sync_secret')),
    body := '{"modo":"leve"}'::jsonb,
    timeout_milliseconds := 55000);
$cron$);

select cron.schedule('cvcrm-disponibilidade-completo', '7,37 * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cvcrm_project_url') || '/functions/v1/cvcrm-disponibilidade-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cvcrm_sync_secret')),
    body := '{"modo":"completo"}'::jsonb,
    timeout_milliseconds := 150000);
$cron$);

-- O histórico do pg_cron: um job por minuto são 1.440 linhas por dia. Uma
-- limpeza diária mantém só a última semana.
select cron.schedule('cvcrm-disponibilidade-historico', '20 4 * * *', $cron$
  delete from cron.job_run_details where end_time < now() - interval '7 days';
$cron$);


-- 4. CONFERÊNCIA ---------------------------------------------------------------
--   select jobname, schedule, active from cron.job where jobname like 'cvcrm-%';
--   select modo, terminado_em, ok, lidas, mudaram, erro, cursor from public.cvcrm_sync_estado;
--   select e.cv_empreendimento, e.cv_etapa, d.name, e.ultimo_leve_em, e.ultimo_completo_em, e.ultimo_erro
--     from public.development_cvcrm_empreendimentos e join public.developments d on d.id = e.development_id;
--
-- Para parar:
--   select cron.unschedule('cvcrm-disponibilidade-leve');
--   select cron.unschedule('cvcrm-disponibilidade-completo');
