-- Política de privacidade: retenção de eventos por até 180 dias.
-- Apenas telemetria; não apaga leads, contas, catálogo ou arquivos.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'poup-retencao-telemetria-180-dias',
  '15 3 * * *',
  $$delete from public.analytics_events where criado_em < now() - interval '180 days'$$
);
