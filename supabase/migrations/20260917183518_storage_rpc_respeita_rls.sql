-- Versão alinhada ao registro de aplicação no projeto POUP.
-- Consulta pública de quota deve respeitar as políticas de Storage do chamador.
-- No trigger de quota, o chamador continua sendo a função privilegiada existente.
alter function public.user_storage_used(uuid) security invoker;
revoke all on function public.user_storage_used(uuid) from public, anon;
grant execute on function public.user_storage_used(uuid) to authenticated, service_role;
