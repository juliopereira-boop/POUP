-- ===========================================================================
-- CV CRM: O ENVIO DA RESERVA
-- ===========================================================================
-- Com a documentação do POST /api/v1/comercial/reservas em mãos (enviada
-- pelo dono do POUP em 27/10/2026), a reserva leva:
--   idpessoa_cv (o cliente, achado pelo CPF no pré-cadastro), o empreendimento
--   e a unidade do CV, idcorretor_cv (o corretor achado pelo CPF do perfil) e
--   as CONDIÇÕES — uma por série do CV (ato, mensais, semestrais, anuais,
--   financiamento, FGTS, subsídio), com quantidade, valor e vencimento.
--
-- O que esta migration traz:
--   1. as séries do CV de cada conta (aprendidas do histórico de condições
--      das reservas, no CVDW — o usuário de integração não lista séries) e o
--      de-para que o admin escolhe: qual série é o ato, quais as mensais…;
--   2. o recibo que deixa tentar de novo depois de uma recusa (e destrava um
--      envio que ficou sem resposta).
--
-- DEPENDE DE: 20261027130000_cvcrm_reserva_e_tabela.sql.
-- MIGRATION IDEMPOTENTE e sem remover nada.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. AS SÉRIES DO CV E O DE-PARA DO FLUXO DA SIMULAÇÃO
-- ---------------------------------------------------------------------------

alter table public.cvcrm_integracoes
  -- { "ato": 12, "mensal": 15, "semestral": 16, "anual": 17, "financiamento": 3, "fgts": 4, "subsidio": 5 }
  add column if not exists series_reserva jsonb not null default '{}'::jsonb,
  add column if not exists series_cursor text;

comment on column public.cvcrm_integracoes.series_reserva is
  'De-para do fluxo da simulação para as séries do CV (idserie). Escolhido pelo admin.';

create table if not exists public.cvcrm_series (
  integracao_id uuid not null references public.cvcrm_integracoes(id) on delete cascade,
  cv_serie integer not null check (cv_serie > 0),
  nome text not null check (char_length(nome) between 1 and 120),
  vista_em timestamptz not null default now(),
  primary key (integracao_id, cv_serie)
);

comment on table public.cvcrm_series is
  'As séries de pagamento do CV de cada conta, vistas nas condições das reservas (CVDW).';

alter table public.cvcrm_series enable row level security;
revoke all on public.cvcrm_series from public, anon, authenticated;
grant all on public.cvcrm_series to service_role;

-- `p_series`: [{ "cv_serie": 12, "nome": "Ato" }]
create or replace function public.cvcrm_aplicar_series(p_integracao uuid, p_series jsonb, p_cursor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if p_series is null or jsonb_typeof(p_series) <> 'array' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;
  insert into public.cvcrm_series as s (integracao_id, cv_serie, nome, vista_em)
  select distinct on ((x->>'cv_serie')::integer)
         p_integracao, (x->>'cv_serie')::integer, left(btrim(x->>'nome'), 120), now()
    from jsonb_array_elements(p_series) x
   where (x->>'cv_serie') ~ '^[0-9]+$' and (x->>'cv_serie')::integer > 0 and btrim(coalesce(x->>'nome', '')) <> ''
  on conflict (integracao_id, cv_serie) do update set nome = excluded.nome, vista_em = now();
  get diagnostics v_n = row_count;
  update public.cvcrm_integracoes
     set series_cursor = coalesce(p_cursor, series_cursor)
   where id = p_integracao;
  return jsonb_build_object('gravadas', v_n);
end;
$$;

revoke all on function public.cvcrm_aplicar_series(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.cvcrm_aplicar_series(uuid, jsonb, text) to service_role;

-- O admin escolhe a série de cada parte do fluxo. Nulo (ou ausente) = sem série.
create or replace function public.cvcrm_definir_series(p_company uuid, p_mapa jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mapa jsonb := '{}'::jsonb;
  k text;
  v jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cvcrm_integracoes where company_id = p_company) then
    raise exception 'sem_integracao' using errcode = '22023';
  end if;
  if p_mapa is null or jsonb_typeof(p_mapa) <> 'object' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_mapa) loop
    if k not in ('ato', 'mensal', 'semestral', 'anual', 'financiamento', 'fgts', 'subsidio') then
      raise exception 'serie_invalida' using errcode = '22023';
    end if;
    continue when v is null or jsonb_typeof(v) = 'null';
    if jsonb_typeof(v) <> 'number' or (v::text)::numeric <= 0 or (v::text)::numeric <> trunc((v::text)::numeric) then
      raise exception 'serie_invalida' using errcode = '22023';
    end if;
    v_mapa := v_mapa || jsonb_build_object(k, (v::text)::integer);
  end loop;
  update public.cvcrm_integracoes set series_reserva = v_mapa, updated_at = now() where company_id = p_company;
  return public.cvcrm_integracao(p_company);
end;
$$;

revoke all on function public.cvcrm_definir_series(uuid, jsonb) from public, anon;
grant execute on function public.cvcrm_definir_series(uuid, jsonb) to authenticated, service_role;

-- A tela da empresa passa a mostrar as séries conhecidas e o de-para.
create or replace function public.cvcrm_integracao(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
             'companyId', i.company_id, 'url', i.url, 'email', i.email,
             'temToken', i.token_secret_id is not null and i.situacao <> 'pendente',
             'ativo', i.ativo, 'situacao', i.situacao,
             'ultimoTesteEm', i.ultimo_teste_em, 'ultimoErro', i.ultimo_erro, 'ultimoErroEm', i.ultimo_erro_em,
             'ultimaLeveEm', i.ultima_leve_em, 'reservaHabilitada', i.reserva_habilitada,
             'tabelaPrecoCv', i.tabela_preco_cv,
             'corretores', (select count(*) from public.cvcrm_corretores c where c.integracao_id = i.id and c.ativo),
             'corretoresLidosEm', i.corretores_lidos_em, 'corretoresErro', i.corretores_erro,
             'tabelaLidaEm', i.tabela_lida_em, 'tabelaErro', i.tabela_erro,
             'seriesReserva', i.series_reserva,
             'series', coalesce((select jsonb_agg(jsonb_build_object('id', s.cv_serie, 'nome', s.nome) order by s.nome)
                                   from public.cvcrm_series s where s.integracao_id = i.id), '[]'::jsonb),
             'empreendimentos', (select count(*) from public.development_cvcrm_empreendimentos e
                                  where e.integracao_id = i.id and e.ativo))
      from public.cvcrm_integracoes i
     where i.company_id = p_company);
end;
$$;

revoke all on function public.cvcrm_integracao(uuid) from public, anon;
grant execute on function public.cvcrm_integracao(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. O RECIBO: TENTAR DE NOVO DEPOIS DE UMA RECUSA
-- ---------------------------------------------------------------------------
-- O mesmo pedido (simulação + unidade):
--   * já CRIADO no CV → devolve o recibo, sem enviar de novo;
--   * ENVIANDO há menos de 5 minutos → "em andamento";
--   * recusado, com erro, ou enviando sem resposta há 5 minutos → nova
--     tentativa no mesmo recibo (o CV recusa unidade já reservada, então uma
--     reserva que tenha entrado sem resposta não duplica).
create or replace function public.cvcrm_reserva_abrir(
  p_integracao uuid, p_simulation uuid, p_unit uuid, p_cv_unidade integer, p_por uuid, p_chave text,
  p_corpo_hash text, p_precadastro integer, p_corretor integer, p_imobiliaria integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.cvcrm_reservas;
begin
  -- Envio da mesma unidade que ficou sem resposta: destrava.
  update public.cvcrm_reservas
     set situacao = 'erro', erro = 'Sem resposta do CV.', respondido_em = now()
   where integracao_id = p_integracao and cv_unidade = p_cv_unidade
     and situacao = 'enviando' and criado_em < now() - interval '5 minutes';

  select * into r from public.cvcrm_reservas where chave_idempotencia = p_chave for update;
  if found then
    if r.situacao = 'criada' then
      return jsonb_build_object('id', r.id, 'novo', false, 'situacao', r.situacao, 'cvReserva', r.cv_reserva);
    end if;
    if r.situacao = 'enviando' then
      raise exception 'reserva_em_andamento' using errcode = '23505';
    end if;
    begin
      update public.cvcrm_reservas
         set situacao = 'enviando', erro = null, respondido_em = null, criado_em = now(), pedido_por = p_por,
             corpo_hash = p_corpo_hash, cv_precadastro = p_precadastro, cv_corretor = p_corretor,
             cv_imobiliaria = p_imobiliaria, unit_id = coalesce(p_unit, unit_id)
       where id = r.id
      returning * into r;
    exception when unique_violation then
      raise exception 'reserva_em_andamento' using errcode = '23505';
    end;
    return jsonb_build_object('id', r.id, 'novo', true, 'situacao', r.situacao, 'cvReserva', null);
  end if;

  begin
    insert into public.cvcrm_reservas (integracao_id, simulation_id, unit_id, cv_unidade, pedido_por,
      chave_idempotencia, situacao, corpo_hash, cv_precadastro, cv_corretor, cv_imobiliaria)
    values (p_integracao, p_simulation, p_unit, p_cv_unidade, p_por, p_chave, 'enviando', p_corpo_hash,
      p_precadastro, p_corretor, p_imobiliaria)
    returning * into r;
  exception when unique_violation then
    raise exception 'reserva_em_andamento' using errcode = '23505';
  end;
  return jsonb_build_object('id', r.id, 'novo', true, 'situacao', r.situacao, 'cvReserva', null);
end;
$$;

revoke all on function public.cvcrm_reserva_abrir(uuid, uuid, uuid, integer, uuid, text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.cvcrm_reserva_abrir(uuid, uuid, uuid, integer, uuid, text, text, integer, integer, integer)
  to service_role;
