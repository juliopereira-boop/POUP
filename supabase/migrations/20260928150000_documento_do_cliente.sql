-- ===========================================================================
-- RANKING: A VENDA TAMBÉM PRECISA DO DOCUMENTO DO CLIENTE (COM O CPF)
-- ===========================================================================
-- Além do comprovante de pagamento do sinal (20260928120000), a venda passa a
-- precisar do DOCUMENTO DO CLIENTE com o CPF: RG (o CPF vem impresso no
-- verso), CNH (modelo antigo, campo "CPF"; modelo novo, campo "4d CPF"), CIN —
-- a Carteira de Identidade Nacional, cujo número É o CPF — ou o comprovante de
-- inscrição no CPF da Receita. Venda aprovada = comprovante confere E o CPF do
-- documento é o CPF do cliente cadastrado na venda.
--
-- QUEM LÊ: a mesma Edge Function `conferir-comprovante` (com `tipo:
-- 'documento'`) tira do documento os CPFs com dígitos verificadores válidos e
-- grava AQUI só o HASH (sha256) de cada um — o número em si não é guardado.
-- QUEM DECIDE é o banco, comparando com o hash do CPF da venda de agora:
-- editou o CPF do cliente ou trocou o documento, a conferência acompanha.
--
-- ATENÇÃO: vendas que já pontuavam passam a pedir o documento
-- ('sem_documento') até ele ser anexado. A auditoria pode validar à mão.
--
-- DEPENDE DE: 20260928120000_comprovante_do_sinal.sql.
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. O DOCUMENTO NA VENDA (no mesmo bucket sigiloso do comprovante)
-- ---------------------------------------------------------------------------

alter table public.sales add column if not exists documento_path text;
alter table public.sales add column if not exists documento_nome text;
alter table public.sales add column if not exists documento_enviado_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_documento_na_pasta_do_dono') then
    alter table public.sales
      add constraint sales_documento_na_pasta_do_dono check (
        documento_path is null
        or (char_length(documento_path) <= 400 and split_part(documento_path, '/', 1) = user_id::text)
      );
  end if;
end $$;

comment on column public.sales.documento_path is
  'Documento do cliente com o CPF (RG, CNH, CIN ou comprovante do CPF), no bucket comprovantes-venda. Exigido para a venda pontuar no ranking.';


-- ---------------------------------------------------------------------------
-- 2. O QUE FOI LIDO DO DOCUMENTO (só a Edge Function escreve)
-- ---------------------------------------------------------------------------

create table if not exists public.ranking_documentos (
  sale_id uuid primary key references public.sales (id) on delete cascade,
  documento_path text not null,
  origem text not null check (origem in ('pdf', 'imagem')),
  -- O texto tem cara de documento de identificação.
  parece_documento boolean not null default false,
  -- sha256 (hex) de cada CPF válido encontrado. O número não é guardado.
  cpfs_hash text[] not null default '{}',
  lido_em timestamptz not null default now()
);

alter table public.ranking_documentos enable row level security;
revoke all on public.ranking_documentos from public, anon, authenticated;
grant all on public.ranking_documentos to service_role;

comment on table public.ranking_documentos is
  'Hash dos CPFs lidos do documento do cliente. Escrita só pela Edge Function conferir-comprovante (service_role); ninguém lê direto.';


-- ---------------------------------------------------------------------------
-- 3. A CONFERÊNCIA DO DOCUMENTO
-- ---------------------------------------------------------------------------

-- sha256 (hex) dos 11 dígitos — o mesmo cálculo da Edge Function.
create or replace function public.ranking_hash_cpf(p_digitos text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_digitos ~ '^[0-9]{11}$' then encode(sha256(convert_to(p_digitos, 'UTF8')), 'hex') end;
$$;

-- 'confere' | 'nao_confere' | 'em_analise' (nada lido ainda para este arquivo).
create or replace function public.ranking_conferencia_documento(
  p_leitura public.ranking_documentos,
  p_documento_path text,
  p_cpf_digitos text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_documento_path is null then 'em_analise'
    when p_leitura.sale_id is null or p_leitura.documento_path is distinct from p_documento_path then 'em_analise'
    when p_leitura.parece_documento
         and public.ranking_hash_cpf(p_cpf_digitos) = any (p_leitura.cpfs_hash)
      then 'confere'
    else 'nao_confere'
  end;
$$;

revoke all on function public.ranking_hash_cpf(text),
  public.ranking_conferencia_documento(public.ranking_documentos, text, text) from public, anon, authenticated;
grant execute on function public.ranking_hash_cpf(text),
  public.ranking_conferencia_documento(public.ranking_documentos, text, text) to service_role;


-- ---------------------------------------------------------------------------
-- 4. A SITUAÇÃO DE CADA VENDA — comprovante E documento
-- ---------------------------------------------------------------------------
-- Igual à de 20260928120000, com três situações depois das do comprovante:
--   'sem_documento'          — falta o documento do cliente;
--   'documento_em_analise'   — anexado, ainda sem conferência;
--   'documento_nao_confere'  — o CPF do documento não é o CPF da venda.
-- A validação da auditoria ('valida') passa por cima.

create or replace function public.ranking_situacao_das_vendas(p_inicio date, p_fim date)
returns table (
  sale_id uuid,
  user_id uuid,
  sale_value numeric,
  sale_date date,
  situacao text
)
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  base as (
    select s.id, s.user_id, s.sale_value, s.sale_date, s.status, s.created_at,
           s.client_cpf_digits as cpf,
           s.comprovante_path,
           public.ranking_chave(s.development_name) as emp,
           coalesce(s.block, 0) as bloco,
           public.ranking_chave(s.unit) as uni,
           r.decisao,
           public.ranking_conferencia(k, s.comprovante_path, s.sale_date,
                                      public.ranking_valor_do_campo(sim.state ->> 'ato')) as conferencia,
           s.documento_path,
           public.ranking_conferencia_documento(dc, s.documento_path, s.client_cpf_digits) as conferencia_doc
      from public.sales s
      left join public.ranking_revisoes r on r.sale_id = s.id
      left join public.ranking_comprovacoes k on k.sale_id = s.id
      left join public.simulations sim on sim.id = s.simulation_id
      left join public.ranking_documentos dc on dc.sale_id = s.id
  ),
  com_conflito as (
    select b.id,
           exists (
             select 1 from base o
              where o.user_id <> b.user_id
                and o.status = 'ativa'
                and coalesce(o.decisao, '') <> 'invalida'
                and o.emp = b.emp
                and ((o.uni = b.uni and o.bloco = b.bloco) or (o.cpf is not null and o.cpf = b.cpf))
           ) as em_disputa,
           row_number() over (
             partition by b.user_id, b.emp, b.bloco, b.uni
             order by b.sale_date, b.created_at, b.id
           ) as ordem_da_unidade
      from base b
     where b.emp is not null and b.uni is not null
  ),
  classificada as (
    select b.*,
           case
             when b.decisao = 'invalida' then 'invalidada'
             when b.status <> 'ativa' then 'distratada'
             when b.sale_date > (select d from hoje) then 'futura'
             when b.emp is null or b.uni is null or not public.cpf_valido(b.cpf)
                  or b.sale_value < 20000 or b.sale_value > 20000000 then 'dados_incompletos'
             when b.comprovante_path is null then 'sem_comprovante'
             when b.conferencia = 'em_analise' and coalesce(b.decisao, '') <> 'valida' then 'comprovante_em_analise'
             when b.conferencia = 'nao_confere' and coalesce(b.decisao, '') <> 'valida' then 'comprovante_nao_confere'
             when b.documento_path is null and coalesce(b.decisao, '') <> 'valida' then 'sem_documento'
             when b.conferencia_doc = 'em_analise' and coalesce(b.decisao, '') <> 'valida' then 'documento_em_analise'
             when b.conferencia_doc = 'nao_confere' and coalesce(b.decisao, '') <> 'valida' then 'documento_nao_confere'
             when c.ordem_da_unidade > 1 then 'duplicada'
             when c.em_disputa and coalesce(b.decisao, '') <> 'valida' then 'em_disputa'
             else 'candidata'
           end as sit
      from base b
      left join com_conflito c on c.id = b.id
     where b.sale_date between p_inicio and p_fim
  ),
  com_teto as (
    select k.*,
           row_number() over (
             partition by k.user_id, date_trunc('month', k.sale_date)
             order by k.sale_date, k.created_at, k.id
           ) as ordem_no_mes
      from classificada k
     where k.sit = 'candidata' and coalesce(k.decisao, '') <> 'valida'
  )
  select k.id, k.user_id, k.sale_value, k.sale_date,
         case
           when k.sit <> 'candidata' then k.sit
           when t.ordem_no_mes > 20 and coalesce(k.decisao, '') <> 'valida' then 'acima_do_teto'
           else 'conta'
         end
    from classificada k
    left join com_teto t on t.id = k.id;
$$;

revoke all on function public.ranking_situacao_das_vendas(date, date) from public, anon, authenticated;
grant execute on function public.ranking_situacao_das_vendas(date, date) to service_role;


-- ---------------------------------------------------------------------------
-- 5. A AUDITORIA VÊ O DOCUMENTO
-- ---------------------------------------------------------------------------
-- Mostra se o CPF do documento confere e quantos CPFs válidos foram achados —
-- nunca o número lido. O tipo de retorno mudou: a função é recriada.

drop function if exists public.ranking_auditoria(text);
create function public.ranking_auditoria(p_periodo text default 'mes')
returns table (
  sale_id uuid,
  corretor uuid,
  corretor_nome text,
  corretor_cidade text,
  corretor_uf text,
  cliente text,
  empreendimento text,
  bloco integer,
  unidade text,
  valor numeric,
  data_venda date,
  situacao text,
  decisao text,
  comprovante_path text,
  denuncias integer,
  motivos text,
  bloqueado boolean,
  sinal numeric,
  lido_datas date[],
  lido_valores numeric[],
  lido_parece_comprovante boolean,
  documento_path text,
  documento_conferencia text,
  documento_parece boolean,
  documento_cpfs_encontrados integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inicio date;
  v_fim date;
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select i.inicio, i.fim into v_inicio, v_fim
    from public.ranking_intervalo(case when p_periodo = 'ano' then 'ano' else 'mes' end) i;

  return query
  with sit as (select * from public.ranking_situacao_das_vendas(v_inicio, v_fim)),
  topo as (
    select t.user_id from (
      select s.user_id, count(*) as n, sum(s.sale_value) as total
        from sit s join public.profiles p on p.id = s.user_id
       where s.situacao = 'conta' and p.ranking_participa
       group by s.user_id
       order by n desc, total desc
       limit 10
    ) t
  ),
  den as (
    select d.alvo, count(*)::integer as n, string_agg(d.motivo, ' | ' order by d.criada_em) as motivos
      from public.ranking_denuncias d
     where d.resolvida_em is null
     group by d.alvo
  )
  select s.sale_id, s.user_id, p.full_name, p.cidade, p.uf,
         v.client_name, v.development_name, v.block, v.unit, v.sale_value, v.sale_date,
         s.situacao, r.decisao, v.comprovante_path,
         coalesce(d.n, 0), d.motivos,
         exists (select 1 from public.ranking_bloqueios b where b.user_id = s.user_id),
         public.ranking_valor_do_campo(sim.state ->> 'ato'),
         case when k.comprovante_path = v.comprovante_path then k.datas end,
         case when k.comprovante_path = v.comprovante_path then k.valores end,
         case when k.comprovante_path = v.comprovante_path then k.parece_comprovante end,
         v.documento_path,
         public.ranking_conferencia_documento(dc, v.documento_path, v.client_cpf_digits),
         case when dc.documento_path = v.documento_path then dc.parece_documento end,
         case when dc.documento_path = v.documento_path then coalesce(array_length(dc.cpfs_hash, 1), 0) end
    from sit s
    join public.sales v on v.id = s.sale_id
    join public.profiles p on p.id = s.user_id
    left join public.ranking_revisoes r on r.sale_id = s.sale_id
    left join den d on d.alvo = s.user_id
    left join public.simulations sim on sim.id = v.simulation_id
    left join public.ranking_comprovacoes k on k.sale_id = s.sale_id
    left join public.ranking_documentos dc on dc.sale_id = s.sale_id
   where p.ranking_participa
     and (s.situacao in ('em_disputa', 'acima_do_teto', 'comprovante_em_analise', 'comprovante_nao_confere',
                            'documento_em_analise', 'documento_nao_confere')
          or d.n > 0
          or (s.situacao = 'conta' and s.user_id in (select user_id from topo)))
   order by coalesce(d.n, 0) desc, (s.situacao = 'em_disputa') desc, p.full_name, v.sale_date;
end;
$$;

revoke all on function public.ranking_auditoria(text) from public, anon;
grant execute on function public.ranking_auditoria(text) to authenticated, service_role;
