-- ===========================================================================
-- LIGAR A LEITURA AUTOMÁTICA DO UAU (pg_cron + pg_net + Vault) — Fase 6
-- ===========================================================================
-- Rode no SQL Editor do Supabase do POUP DEPOIS que:
--   1. a migration da disponibilidade rodou;
--   2. a função `uau-disponibilidade-sync` foi publicada (Verify JWT desligado);
--   3. o `ping` respondeu ok;
--   4. o piloto foi vinculado e conferido na tela do admin.
--
-- O segredo do cron é guardado no Vault, e não no texto do job: `cron.job` é
-- legível por quem tem acesso ao banco, o Vault não.
-- ===========================================================================

-- 1. Extensões (no Supabase: Database → Extensions, ou assim):
create extension if not exists pg_net;
-- pg_cron já está ligado no POUP (retenção de telemetria).

-- 2. Vault. O segredo do cron é GERADO no próprio banco: ninguém digita nem vê.
--    A função `uau-disponibilidade-sync` confere o cabeçalho contra o Vault
--    (`uau_confere_segredo_do_cron`); não há secret para cadastrar na função.
--    No POUP isto já foi feito em 20/10/2026.
--
--    select vault.create_secret('https://<REF-DO-PROJETO>.supabase.co', 'uau_project_url');
--    select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'uau_sync_secret');
--
--    Conferir sem mostrar o valor:
--    select name, length(decrypted_secret) from vault.decrypted_secrets where name like 'uau_%';

-- 3. Os dois jobs. `cron.schedule` com nome substitui o de mesmo nome: rodar de
--    novo não duplica.

-- Leve: de minuto em minuto, só as não vendidas. 120 s de espera no pg_net
-- (o mesmo do ALPHA): a chamada continua mesmo que demore.
select cron.schedule('uau-disponibilidade-leve', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'uau_project_url')
           || '/functions/v1/uau-disponibilidade-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'uau_sync_secret')),
    body := '{"modo":"leve"}'::jsonb,
    timeout_milliseconds := 120000);
$$);

-- Completa: de 30 em 30 minutos, fora do minuto cheio (7 e 37).
select cron.schedule('uau-disponibilidade-completo', '7,37 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'uau_project_url')
           || '/functions/v1/uau-disponibilidade-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'uau_sync_secret')),
    body := '{"modo":"completo"}'::jsonb,
    timeout_milliseconds := 150000);
$$);

-- Limpeza do registro (30 dias).
select cron.schedule('uau-disponibilidade-log-limpeza', '23 4 * * *', $$
  delete from public.uau_sync_log where iniciado_em < now() - interval '30 days';
$$);

-- ===========================================================================
-- CONFERIR
-- ===========================================================================
--   select jobname, schedule, active from cron.job where jobname like 'uau-disponibilidade%';
--   select status, start_time, return_message from cron.job_run_details d
--     join cron.job j using (jobid) where j.jobname like 'uau-disponibilidade%'
--    order by start_time desc limit 10;
--   select id, modo, iniciado_em, terminado_em, ok, obras, lidas, mudaram, erro
--     from public.uau_sync_log order by id desc limit 10;
--   select id, status_code, left(content, 300) from net._http_response order by id desc limit 5;
--
-- DESLIGAR (pausa sem apagar nada):
--   update cron.job set active = false where jobname like 'uau-disponibilidade%';
-- ===========================================================================
