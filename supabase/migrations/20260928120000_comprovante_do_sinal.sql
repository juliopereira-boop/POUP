-- ===========================================================================
-- RANKING: A VENDA É COMPROVADA PELO COMPROVANTE DE PAGAMENTO DO SINAL
-- ===========================================================================
-- Antes bastava anexar um arquivo qualquer. Agora o arquivo é o COMPROVANTE
-- DE PAGAMENTO DO SINAL (Pix, TED, boleto pago, recibo), e a venda só está
-- comprovada quando ele fecha com a venda nas duas informações:
--
--   1. DATA DO PAGAMENTO = data da venda informada ao registrar (tolerância de
--      `ranking_tolerancia_dias()` dias para mais ou para menos — o Pix do
--      sinal de ontem, o contrato de hoje);
--   2. VALOR PAGO = o sinal (ato) da simulação que gerou a venda, ao centavo.
--
-- QUEM LÊ: a função `conferir-comprovante` (Edge Function) tira do arquivo as
-- datas e os valores — do PDF, no servidor; da foto, pelo reconhecimento de
-- texto do próprio celular — e grava AQUI, numa tabela que o corretor não lê
-- nem escreve. Quem DECIDE é o banco, nesta função, comparando com a venda e a
-- simulação de agora: mudou a data da venda ou trocou o arquivo, a conferência
-- acompanha. O aplicativo não carrega a regra nem recebe o que foi lido.
--
-- A auditoria (admin) continua podendo validar à mão — foto ilegível,
-- comprovante enviado pelo navegador, sinal parcelado.
--
-- DEPENDE DE: 20260925150000_ranking.sql, 0022 (sales.simulation_id),
-- simulations.state (o ato da simulação).
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. O QUE FOI LIDO DE CADA COMPROVANTE (só a Edge Function escreve)
-- ---------------------------------------------------------------------------

create table if not exists public.ranking_comprovacoes (
  sale_id uuid primary key references public.sales (id) on delete cascade,
  -- O arquivo lido. Trocou o comprovante, esta leitura deixa de valer.
  comprovante_path text not null,
  origem text not null check (origem in ('pdf', 'imagem')),
  -- O texto tem cara de comprovante de pagamento (pix, transferência, pago...).
  parece_comprovante boolean not null default false,
  datas date[] not null default '{}',
  valores numeric[] not null default '{}',
  lido_em timestamptz not null default now()
);

alter table public.ranking_comprovacoes enable row level security;
revoke all on public.ranking_comprovacoes from public, anon, authenticated;
grant all on public.ranking_comprovacoes to service_role;

comment on table public.ranking_comprovacoes is
  'Datas e valores lidos do comprovante de pagamento do sinal. Escrita só pela Edge Function conferir-comprovante (service_role); ninguém lê direto.';


-- ---------------------------------------------------------------------------
-- 2. AS DUAS PEÇAS DA CONFERÊNCIA
-- ---------------------------------------------------------------------------

-- Quantos dias a data do pagamento pode ficar da data da venda.
create or replace function public.ranking_tolerancia_dias()
returns integer
language sql
immutable
as $$ select 3 $$;

-- O sinal (ato) da simulação, a partir do campo mascarado "R$ 4.000,00".
create or replace function public.ranking_valor_do_campo(t text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select nullif(regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g'), '')::numeric / 100;
$$;

-- 'confere' | 'nao_confere' | 'em_analise' (nada lido ainda, ou venda sem sinal).
create or replace function public.ranking_conferencia(
  p_leitura public.ranking_comprovacoes,
  p_comprovante_path text,
  p_sale_date date,
  p_sinal numeric
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_comprovante_path is null then 'em_analise'
    when p_leitura.sale_id is null or p_leitura.comprovante_path is distinct from p_comprovante_path then 'em_analise'
    when p_sinal is null or p_sinal <= 0 then 'em_analise'
    when p_leitura.parece_comprovante
         and exists (select 1 from unnest(p_leitura.datas) d
                      where d between p_sale_date - public.ranking_tolerancia_dias()
                                  and p_sale_date + public.ranking_tolerancia_dias())
         and exists (select 1 from unnest(p_leitura.valores) v where abs(v - p_sinal) < 0.005)
      then 'confere'
    else 'nao_confere'
  end;
$$;

revoke all on function public.ranking_tolerancia_dias(), public.ranking_valor_do_campo(text),
  public.ranking_conferencia(public.ranking_comprovacoes, text, date, numeric) from public, anon;
grant execute on function public.ranking_tolerancia_dias(), public.ranking_valor_do_campo(text)
  to authenticated, service_role;
grant execute on function public.ranking_conferencia(public.ranking_comprovacoes, text, date, numeric) to service_role;


-- ---------------------------------------------------------------------------
-- 3. A SITUAÇÃO DE CADA VENDA — com a conferência do comprovante
-- ---------------------------------------------------------------------------
-- Igual à de 20260925150000, com duas situações novas logo depois de
-- 'sem_comprovante':
--   'comprovante_em_analise'  — anexado, ainda sem conferência;
--   'comprovante_nao_confere' — a data do pagamento ou o valor não fecham.
-- A validação da auditoria ('valida') passa por cima das duas.

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
                                      public.ranking_valor_do_campo(sim.state ->> 'ato')) as conferencia
      from public.sales s
      left join public.ranking_revisoes r on r.sale_id = s.id
      left join public.ranking_comprovacoes k on k.sale_id = s.id
      left join public.simulations sim on sim.id = s.simulation_id
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
-- 4. A AUDITORIA VÊ A CONFERÊNCIA
-- ---------------------------------------------------------------------------
-- As vendas com comprovante em análise ou que não confere entram na lista, com
-- o sinal da simulação e o que foi lido — para o admin decidir olhando o
-- arquivo. O tipo de retorno mudou: a função é recriada.

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
  lido_parece_comprovante boolean
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
         case when k.comprovante_path = v.comprovante_path then k.parece_comprovante end
    from sit s
    join public.sales v on v.id = s.sale_id
    join public.profiles p on p.id = s.user_id
    left join public.ranking_revisoes r on r.sale_id = s.sale_id
    left join den d on d.alvo = s.user_id
    left join public.simulations sim on sim.id = v.simulation_id
    left join public.ranking_comprovacoes k on k.sale_id = s.sale_id
   where p.ranking_participa
     and (s.situacao in ('em_disputa', 'acima_do_teto', 'comprovante_em_analise', 'comprovante_nao_confere')
          or d.n > 0
          or (s.situacao = 'conta' and s.user_id in (select user_id from topo)))
   order by coalesce(d.n, 0) desc, (s.situacao = 'em_disputa') desc, p.full_name, v.sale_date;
end;
$$;

revoke all on function public.ranking_auditoria(text) from public, anon;
grant execute on function public.ranking_auditoria(text) to authenticated, service_role;


-- ===========================================================================
-- CONFERÊNCIA
-- ===========================================================================
--   select * from public.meu_ranking('mes');   -- as situações novas aparecem
--   select * from public.ranking_auditoria('mes');
-- ===========================================================================
