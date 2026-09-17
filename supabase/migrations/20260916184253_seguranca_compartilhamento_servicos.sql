-- Executar após 0027, 0031, 0032, 0033 e planos_start_pro.
-- Não altera assinaturas, catálogo, leads nem arquivos existentes.

-- Um token do usuário A nunca pode apontar para a simulação de B.
drop policy if exists financing_share_own on public.financing_share_tokens;
create policy financing_share_own on public.financing_share_tokens
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.financing_simulations s
      where s.id = simulation_id and s.user_id = (select auth.uid()))
  );

-- Serviços internos: RLS fechada e privilégios explicitamente fechados.
revoke all on public.apple_credentials, public.captacao_rate, public.exclusao_pendente
  from public, anon, authenticated;
grant all on public.apple_credentials, public.captacao_rate, public.exclusao_pendente
  to service_role;
revoke all on function public.registrar_captacao(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.registrar_captacao(uuid, integer) to service_role;
revoke all on function public.registrar_exclusao_pendente(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_exclusao_pendente(uuid, text, text) to service_role;

-- TRUNCATE não passa por RLS; clientes só recebem operações que passam.
revoke all on public.financing_rule_versions, public.financing_rule_audit,
  public.financing_simulations, public.financing_share_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.financing_rule_versions,
  public.financing_rule_audit, public.financing_simulations, public.financing_share_tokens
  to authenticated;
grant all on public.financing_rule_versions, public.financing_rule_audit,
  public.financing_simulations, public.financing_share_tokens to service_role;
revoke all on function public.financing_active_rules() from public, anon;
grant execute on function public.financing_active_rules() to authenticated, service_role;

-- Busca previsível também nas funções invoker/triggers antigas.
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.cpf_digits(text) set search_path = public, pg_temp;
alter function public.ciclo_ia_atual() set search_path = public, pg_temp;

-- Nenhuma cota de LIA fora do Pro (a Edge também confere plano ativo).
update public.ai_limits set teto_mes = 0, teto_minuto = 0
  where recurso in ('lia_escuta', 'lia_fechamento', 'lia_agenda') and plano <> 'pro';

-- Mantém as RPCs usadas pelo app; retira somente o acesso anônimo indevido.
revoke all on function public.consumir_ia(text, integer), public.estornar_ia(text, integer),
  public.meu_uso_ia(), public.painel_consumo_ia(), public.painel_eventos(integer),
  public.painel_funil(integer), public.podar_analytics(integer) from public, anon;

create index if not exists analytics_events_retencao_idx on public.analytics_events(criado_em);
