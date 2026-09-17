-- Triggers não são APIs; sua execução pelo trigger não depende destas grants.
revoke all on function public.detach_catalog_from_user(), public.enforce_storage_quota(),
  public.handle_new_user(), public.lead_stages_enforce_unique_flags(), public.trial_campaign_guard()
  from public, anon, authenticated;
-- Helpers de policies e RPCs do painel continuam disponíveis após login.
revoke all on function public.is_app_admin(), public.is_catalog_company(uuid),
  public.is_own_private_company(uuid), public.trial_active_count(), public.user_storage_used(uuid)
  from public, anon;
grant execute on function public.is_app_admin(), public.is_catalog_company(uuid),
  public.is_own_private_company(uuid), public.trial_active_count(), public.user_storage_used(uuid)
  to authenticated, service_role;

-- Estorno só pelo servidor: o usuário não pode zerar a própria cota via RPC.
create or replace function public.estornar_ia_servico(p_user uuid, p_recurso text, p_peso integer default 1)
returns void language sql security invoker set search_path = ''
as $$
  update public.ai_usage
    set usados = greatest(0, usados - greatest(1, least(coalesce(p_peso, 1), 100))),
        janela_usados = greatest(0, janela_usados - greatest(1, least(coalesce(p_peso, 1), 100))),
        updated_at = now()
    where user_id = p_user and recurso = p_recurso and ciclo = public.ciclo_ia_atual();
$$;
revoke all on function public.estornar_ia_servico(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.estornar_ia_servico(uuid,text,integer) to service_role;
revoke all on function public.estornar_ia(text,integer) from public, anon, authenticated;

create or replace function public.consumir_ia(p_recurso text, p_peso integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_plano text;
  v_teto integer;
  v_teto_min integer;
  v_ciclo text;
  v_agora timestamptz := now();
  v_peso integer;
  v_usados integer;
  v_janela integer;
begin
  if v_user is null then
    return jsonb_build_object('permitido', false, 'motivo', 'nao_autenticado');
  end if;
  if p_recurso is null or length(p_recurso) > 40 then
    return jsonb_build_object('permitido', false, 'motivo', 'recurso_invalido');
  end if;

  v_peso := greatest(1, least(coalesce(p_peso, 1), 100));
  v_plano := public.plano_de_cobranca(v_user);
  -- LIA exige Pro ativo, inclusive para administradores; não usa a cota admin.
  if p_recurso in ('lia_escuta', 'lia_fechamento', 'lia_agenda') then
    select case when status = 'active' and plan_tier = 'pro' then 'pro' else 'nenhum' end
      into v_plano from public.subscriptions where user_id = v_user;
    v_plano := coalesce(v_plano, 'nenhum');
  end if;

  select l.teto_mes, l.teto_minuto
    into v_teto, v_teto_min
    from public.ai_limits l
   where l.plano = v_plano and l.recurso = p_recurso;

  if v_teto is null then
    -- Recurso sem teto cadastrado para este plano. Recusa: nao gastar API e
    -- sempre a resposta segura para uma configuracao incompleta.
    return jsonb_build_object(
      'permitido', false, 'motivo', 'sem_limite_cadastrado', 'plano', v_plano
    );
  end if;

  if v_teto = 0 then
    return jsonb_build_object(
      'permitido', false, 'motivo', 'plano_nao_inclui', 'plano', v_plano, 'teto', 0
    );
  end if;

  v_ciclo := public.ciclo_ia_atual();

  insert into public.ai_usage (user_id, recurso, ciclo, usados, janela_inicio, janela_usados)
  values (v_user, p_recurso, v_ciclo, 0, v_agora, 0)
  on conflict (user_id, recurso, ciclo) do nothing;

  /*
   * `for update` serializa duas chamadas simultaneas do MESMO corretor.
   * Sem ele, ler-somar-gravar deixa duas requisicoes concorrentes verem o
   * mesmo `usados` e gravarem o mesmo valor+1: o teto vaza exatamente no caso
   * que ele existe para conter, que e o disparo automatizado em paralelo.
   */
  select u.usados,
         case
           when u.janela_inicio > v_agora - interval '1 minute' then u.janela_usados
           else 0
         end
    into v_usados, v_janela
    from public.ai_usage u
   where u.user_id = v_user and u.recurso = p_recurso and u.ciclo = v_ciclo
     for update;

  if v_teto >= 0 and v_usados + v_peso > v_teto then
    return jsonb_build_object(
      'permitido', false, 'motivo', 'teto_mes',
      'usados', v_usados, 'teto', v_teto, 'plano', v_plano
    );
  end if;

  if v_teto_min >= 0 and v_janela + v_peso > v_teto_min then
    return jsonb_build_object(
      'permitido', false, 'motivo', 'rajada',
      'usados', v_usados, 'teto', v_teto, 'teto_minuto', v_teto_min, 'plano', v_plano
    );
  end if;

  update public.ai_usage u
     set usados = u.usados + v_peso,
         janela_inicio = case
           when u.janela_inicio > v_agora - interval '1 minute' then u.janela_inicio
           else v_agora
         end,
         janela_usados = v_janela + v_peso,
         updated_at = v_agora
   where u.user_id = v_user and u.recurso = p_recurso and u.ciclo = v_ciclo;

  return jsonb_build_object(
    'permitido', true, 'usados', v_usados + v_peso, 'teto', v_teto, 'plano', v_plano
  );
end;
$$;

