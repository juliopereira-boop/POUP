-- ===========================================================================
-- RANKING DE CORRETORES
-- ===========================================================================
-- Quem vendeu mais — na cidade, no estado e no Brasil —, no mês e no ano.
-- Desempate pelo VGV (a soma dos valores vendidos) e, persistindo, por quem
-- chegou lá primeiro.
--
-- ===========================================================================
-- O DILEMA: QUALQUER UM PODE DIZER QUE VENDEU
-- ===========================================================================
-- A venda é cadastrada pelo próprio corretor. Sem regra, bastaria criar uma
-- simulação, marcar "vendida" e subir no ranking — e um ranking que se ganha
-- assim não vale nada para quem vende de verdade. Não existe regra que torne
-- fraude impossível num dado que o próprio usuário declara; existe regra que
-- torna a fraude CARA, VISÍVEL e REVERSÍVEL. São estas, em camadas:
--
--   1. SÓ VENDA COMPROVADA PONTUA. A venda precisa do comprovante anexado
--      (contrato assinado ou comprovante da comissão). Ele fica guardado em
--      sigilo — só o corretor e a auditoria do POUP abrem.
--
--   2. DADOS QUE SE CONFEREM. CPF do comprador válido (dígitos conferidos),
--      empreendimento e unidade informados, valor dentro de uma faixa real
--      (R$ 20 mil a R$ 20 milhões), data que não está no futuro, venda ativa
--      (distrato sai na hora).
--
--   3. UMA UNIDADE, UM DONO. A mesma unidade (empreendimento + bloco +
--      unidade), ou o mesmo comprador no mesmo empreendimento, cadastrada por
--      dois corretores fica EM DISPUTA: não conta para nenhum dos dois até a
--      auditoria decidir. Inventar venda de unidade real vira conflito com
--      quem vendeu de fato; e a mesma venda cadastrada duas vezes pela mesma
--      conta conta uma vez só.
--
--   4. TETO DE SANIDADE. No máximo 20 vendas por mês contam sozinhas; acima
--      disso, as excedentes esperam a auditoria. Quem vende mais que isso
--      existe — e é justamente quem merece ter a conta conferida.
--
--   5. PARTICIPAR É ESCOLHA, E TEM ROSTO. Aparecer no ranking mostra nome,
--      cidade e resultado aos outros corretores, então é opcional (LGPD) e
--      exige CPF, CRECI e cidade no perfil. Conta de CPF único (a regra já
--      existe no perfil): não dá para multiplicar contas com o mesmo CPF.
--
--   6. DENÚNCIA E AUDITORIA. Qualquer corretor pode contestar uma posição. A
--      auditoria (admin do POUP) vê as disputas, as excedentes, as denúncias e
--      os primeiros colocados, abre o comprovante, valida ou invalida a venda
--      — e pode tirar do ranking quem fraudou.
--
-- Tudo isso é calculado AQUI, no banco, numa função `security definer`: o
-- aplicativo recebe só o resultado (nome, cidade, número de vendas, VGV) e
-- nunca as vendas dos outros corretores. As vendas continuam protegidas pela
-- RLS de sempre (0022).
--
-- DEPENDE DE: 0022_sales.sql, 0018 (is_app_admin), 0021 (CPF do perfil),
-- 0025 (UF do perfil).
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. O PERFIL: CIDADE E PARTICIPAÇÃO
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists cidade text;
alter table public.profiles add column if not exists ranking_participa boolean not null default false;
alter table public.profiles add column if not exists ranking_desde timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_cidade_tamanho') then
    alter table public.profiles
      add constraint profiles_cidade_tamanho check (cidade is null or char_length(btrim(cidade)) between 2 and 80);
  end if;
end $$;

comment on column public.profiles.cidade is
  'Cidade onde o corretor atua (nome do IBGE). Com a UF, define o ranking da cidade.';
comment on column public.profiles.ranking_participa is
  'Aceitou aparecer no ranking (nome, cidade e resultado visíveis aos outros corretores).';


-- ---------------------------------------------------------------------------
-- 2. A VENDA: O COMPROVANTE
-- ---------------------------------------------------------------------------

alter table public.sales add column if not exists comprovante_path text;
alter table public.sales add column if not exists comprovante_nome text;
alter table public.sales add column if not exists comprovante_enviado_em timestamptz;

do $$
begin
  -- O comprovante mora na pasta do DONO da venda: apontar para o arquivo de
  -- outra conta não serve de comprovante.
  if not exists (select 1 from pg_constraint where conname = 'sales_comprovante_na_pasta_do_dono') then
    alter table public.sales
      add constraint sales_comprovante_na_pasta_do_dono check (
        comprovante_path is null
        or (char_length(comprovante_path) <= 400 and split_part(comprovante_path, '/', 1) = user_id::text)
      );
  end if;
end $$;

comment on column public.sales.comprovante_path is
  'Contrato assinado ou comprovante da comissão, no bucket comprovantes-venda. Exigido para a venda pontuar no ranking.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes-venda', 'comprovantes-venda', false, 15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Pasta = id do corretor. Ele lê e escreve a dele; a auditoria lê todas.
drop policy if exists "comprovantes_select" on storage.objects;
create policy "comprovantes_select" on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes-venda'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_app_admin()));

drop policy if exists "comprovantes_insert" on storage.objects;
create policy "comprovantes_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes-venda' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "comprovantes_update" on storage.objects;
create policy "comprovantes_update" on storage.objects for update to authenticated
  using (bucket_id = 'comprovantes-venda' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'comprovantes-venda' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "comprovantes_delete" on storage.objects;
create policy "comprovantes_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes-venda' and (storage.foldername(name))[1] = auth.uid()::text);


-- ---------------------------------------------------------------------------
-- 3. O QUE SÓ A AUDITORIA ESCREVE
-- ---------------------------------------------------------------------------
-- Em tabelas próprias, e não em colunas do perfil ou da venda: o corretor
-- edita o próprio perfil e as próprias vendas, e a decisão da auditoria não
-- pode estar ao alcance dele.

create table if not exists public.ranking_revisoes (
  sale_id uuid primary key references public.sales (id) on delete cascade,
  decisao text not null check (decisao in ('valida', 'invalida')),
  motivo text check (motivo is null or char_length(motivo) <= 500),
  revisado_por uuid not null default auth.uid(),
  revisado_em timestamptz not null default now()
);

create table if not exists public.ranking_bloqueios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  motivo text not null check (char_length(motivo) between 1 and 500),
  bloqueado_por uuid not null default auth.uid(),
  bloqueado_em timestamptz not null default now()
);

create table if not exists public.ranking_denuncias (
  id uuid primary key default gen_random_uuid(),
  denunciante uuid not null default auth.uid() references auth.users (id) on delete cascade,
  alvo uuid not null references auth.users (id) on delete cascade,
  motivo text not null check (char_length(btrim(motivo)) between 5 and 500),
  criada_em timestamptz not null default now(),
  resolvida_em timestamptz,
  resolvida_por uuid
);

create index if not exists ranking_denuncias_abertas on public.ranking_denuncias (alvo) where resolvida_em is null;

alter table public.ranking_revisoes enable row level security;
alter table public.ranking_bloqueios enable row level security;
alter table public.ranking_denuncias enable row level security;

-- Ninguém lê nem escreve direto: só pelas funções abaixo.
revoke all on public.ranking_revisoes, public.ranking_bloqueios, public.ranking_denuncias
  from public, anon, authenticated;
grant all on public.ranking_revisoes, public.ranking_bloqueios, public.ranking_denuncias to service_role;


-- ---------------------------------------------------------------------------
-- 4. FUNÇÕES DE APOIO
-- ---------------------------------------------------------------------------

-- Maiúsculas, sem acento, espaços simples: "São  Luís" = "SAO LUIS".
create or replace function public.ranking_chave(t text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(regexp_replace(upper(btrim(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'))), '\s+', ' ', 'g'), '');
$$;

-- Os dígitos verificadores do CPF, como a Receita calcula.
create or replace function public.cpf_valido(t text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  d text := regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g');
  soma integer;
  resto integer;
  i integer;
begin
  if char_length(d) <> 11 or d ~ '^(\d)\1{10}$' then
    return false;
  end if;
  soma := 0;
  for i in 1..9 loop
    soma := soma + substr(d, i, 1)::integer * (11 - i);
  end loop;
  resto := (soma * 10) % 11;
  if resto = 10 then resto := 0; end if;
  if resto <> substr(d, 10, 1)::integer then
    return false;
  end if;
  soma := 0;
  for i in 1..10 loop
    soma := soma + substr(d, i, 1)::integer * (12 - i);
  end loop;
  resto := (soma * 10) % 11;
  if resto = 10 then resto := 0; end if;
  return resto = substr(d, 11, 1)::integer;
end;
$$;

revoke all on function public.ranking_chave(text), public.cpf_valido(text) from public, anon;
grant execute on function public.ranking_chave(text), public.cpf_valido(text) to authenticated, service_role;

-- "Julio Cesar Sousa Pereira" → "Julio Pereira": primeiro e último nome.
create or replace function public.ranking_nome(t text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(btrim(t), '') = '' then 'Corretor POUP'
    when array_length(regexp_split_to_array(btrim(t), '\s+'), 1) = 1 then btrim(t)
    else (regexp_split_to_array(btrim(t), '\s+'))[1] || ' ' ||
         (regexp_split_to_array(btrim(t), '\s+'))[array_length(regexp_split_to_array(btrim(t), '\s+'), 1)]
  end;
$$;

revoke all on function public.ranking_nome(text) from public, anon;
grant execute on function public.ranking_nome(text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. A SITUAÇÃO DE CADA VENDA NO RANKING
-- ---------------------------------------------------------------------------
-- O coração das regras. Para cada venda: conta ou não conta, e por quê.
-- Interna (sem grant): quem chama são as funções abaixo, que devolvem só o
-- agregado — ou, para o próprio corretor, as vendas DELE.
--
-- Situações: 'conta' | 'distratada' | 'futura' | 'dados_incompletos' |
-- 'sem_comprovante' | 'duplicada' | 'em_disputa' | 'acima_do_teto' | 'invalidada'

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
           r.decisao
      from public.sales s
      left join public.ranking_revisoes r on r.sale_id = s.id
  ),
  -- Disputa: outra CONTA com venda ativa da mesma unidade, ou do mesmo
  -- comprador no mesmo empreendimento. Olha todas as vendas, de qualquer
  -- período: uma unidade vendida em março não pode ser "vendida" de novo em
  -- setembro por outra conta.
  com_conflito as (
    select b.id,
           exists (
             select 1 from base o
              where o.user_id <> b.user_id
                and o.status = 'ativa'
                -- Venda que a auditoria invalidou não disputa mais nada.
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
             when c.ordem_da_unidade > 1 then 'duplicada'
             when c.em_disputa and coalesce(b.decisao, '') <> 'valida' then 'em_disputa'
             else 'candidata'
           end as sit
      from base b
      left join com_conflito c on c.id = b.id
     where b.sale_date between p_inicio and p_fim
  ),
  -- Teto: das candidatas de cada corretor em cada mês, só as 20 primeiras
  -- contam sozinhas. A auditoria libera as demais ("valida"), e a liberada
  -- conta POR FORA das 20 — não tira a vaga de outra venda.
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


-- O intervalo do período, no horário de Brasília.
create or replace function public.ranking_intervalo(p_periodo text, out inicio date, out fim date)
language sql
stable
set search_path = public
as $$
  select case when p_periodo = 'ano'
              then date_trunc('year', (now() at time zone 'America/Sao_Paulo'))::date
              else date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date end,
         (now() at time zone 'America/Sao_Paulo')::date;
$$;

revoke all on function public.ranking_intervalo(text) from public, anon;
grant execute on function public.ranking_intervalo(text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 6. O RANKING
-- ---------------------------------------------------------------------------
-- p_escopo: 'cidade' | 'estado' | 'brasil' (a cidade e o estado são os de quem
-- pergunta). p_periodo: 'mes' | 'ano'.
--
-- Devolve os 100 primeiros e, se quem pergunta participa e está abaixo deles,
-- a linha dele também (`eu = true`). Só dados públicos do ranking: primeiro e
-- último nome, foto, imobiliária, cidade, UF, número de vendas e VGV.

create or replace function public.ranking(p_escopo text, p_periodo text)
returns table (
  posicao integer,
  participante uuid,
  nome text,
  foto_url text,
  imobiliaria text,
  cidade text,
  uf text,
  vendas integer,
  vgv numeric,
  eu boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_eu uuid := auth.uid();
  v_cidade text;
  v_uf text;
  v_inicio date;
  v_fim date;
begin
  if v_eu is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_escopo not in ('cidade', 'estado', 'brasil') or p_periodo not in ('mes', 'ano') then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;

  select public.ranking_chave(p.cidade), p.uf into v_cidade, v_uf from public.profiles p where p.id = v_eu;
  if (p_escopo = 'cidade' and (v_cidade is null or v_uf is null)) or (p_escopo = 'estado' and v_uf is null) then
    return; -- sem cidade/estado no perfil: a tela pede para completar
  end if;

  select i.inicio, i.fim into v_inicio, v_fim from public.ranking_intervalo(p_periodo) i;

  return query
  with pontos as (
    select s.user_id, count(*)::integer as n, sum(s.sale_value) as total, max(s.sale_date) as ultima
      from public.ranking_situacao_das_vendas(v_inicio, v_fim) s
     where s.situacao = 'conta'
     group by s.user_id
  ),
  participantes as (
    select p.id, p.full_name, p.avatar_url, p.agency, p.cidade, p.uf,
           coalesce(pt.n, 0) as n, coalesce(pt.total, 0) as total, pt.ultima
      from public.profiles p
      left join pontos pt on pt.user_id = p.id
     where p.ranking_participa
       and not exists (select 1 from public.ranking_bloqueios b where b.user_id = p.id)
       and (p_escopo = 'brasil'
            or (p_escopo = 'estado' and p.uf = v_uf)
            or (p_escopo = 'cidade' and p.uf = v_uf and public.ranking_chave(p.cidade) = v_cidade))
  ),
  ordenado as (
    select pa.*,
           (row_number() over (order by pa.n desc, pa.total desc, pa.ultima asc nulls last, pa.id))::integer as pos
      from participantes pa
     -- Quem ainda não pontuou só aparece para si mesmo.
     where pa.n > 0 or pa.id = v_eu
  )
  select o.pos, o.id, public.ranking_nome(o.full_name), o.avatar_url, o.agency, o.cidade, o.uf,
         o.n, o.total, o.id = v_eu
    from ordenado o
   where o.pos <= 100 or o.id = v_eu
   order by o.pos;
end;
$$;

revoke all on function public.ranking(text, text) from public, anon;
grant execute on function public.ranking(text, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. A SITUAÇÃO DO PRÓPRIO CORRETOR
-- ---------------------------------------------------------------------------
-- O que falta para cada venda DELE pontuar — é o que transforma o ranking em
-- jogo: "anexe o comprovante de 3 vendas e suba 2 posições".

create or replace function public.meu_ranking(p_periodo text default 'mes')
returns table (
  sale_id uuid,
  situacao text
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
  if auth.uid() is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  select i.inicio, i.fim into v_inicio, v_fim
    from public.ranking_intervalo(case when p_periodo = 'ano' then 'ano' else 'mes' end) i;
  return query
    select s.sale_id, s.situacao
      from public.ranking_situacao_das_vendas(v_inicio, v_fim) s
     where s.user_id = auth.uid();
end;
$$;

revoke all on function public.meu_ranking(text) from public, anon;
grant execute on function public.meu_ranking(text) to authenticated, service_role;


-- Entrar e sair do ranking. Entrar exige o que dá rosto à conta.
create or replace function public.participar_do_ranking(p_participar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  if auth.uid() is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then
    raise exception 'perfil_incompleto' using errcode = '22023';
  end if;
  if p_participar then
    if not public.cpf_valido(p.cpf) or coalesce(btrim(p.creci), '') = '' or coalesce(btrim(p.cidade), '') = ''
       or p.uf is null or coalesce(btrim(p.full_name), '') = '' then
      raise exception 'perfil_incompleto' using errcode = '22023';
    end if;
    update public.profiles
       set ranking_participa = true, ranking_desde = coalesce(ranking_desde, now()), updated_at = now()
     where id = auth.uid();
  else
    update public.profiles set ranking_participa = false, updated_at = now() where id = auth.uid();
  end if;
end;
$$;

revoke all on function public.participar_do_ranking(boolean) from public, anon;
grant execute on function public.participar_do_ranking(boolean) to authenticated, service_role;


-- A mesma exigência vale para quem tentar ligar a participação editando o
-- perfil direto (a RLS deixa o corretor editar o próprio perfil). E se ele
-- apagar o CRECI ou a cidade depois, sai do ranking sozinho.
create or replace function public.ranking_confere_participacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ranking_participa and (
       not public.cpf_valido(new.cpf) or coalesce(btrim(new.creci), '') = ''
       or coalesce(btrim(new.cidade), '') = '' or new.uf is null or coalesce(btrim(new.full_name), '') = ''
     ) then
    new.ranking_participa := false;
  end if;
  if new.ranking_participa and new.ranking_desde is null then
    new.ranking_desde := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_ranking_confere on public.profiles;
create trigger profiles_ranking_confere
  before insert or update on public.profiles
  for each row execute function public.ranking_confere_participacao();


-- Contestar uma posição. No máximo 5 denúncias por dia por corretor, e uma
-- aberta por alvo — denúncia em massa não pode virar arma.
create or replace function public.denunciar_no_ranking(p_alvo uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_alvo is null or p_alvo = auth.uid() then
    raise exception 'alvo_invalido' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 500 then
    raise exception 'motivo_invalido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_alvo and ranking_participa) then
    raise exception 'alvo_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from public.ranking_denuncias
              where denunciante = auth.uid() and alvo = p_alvo and resolvida_em is null) then
    raise exception 'denuncia_repetida' using errcode = '22023';
  end if;
  if (select count(*) from public.ranking_denuncias
       where denunciante = auth.uid() and criada_em > now() - interval '1 day') >= 5 then
    raise exception 'denuncias_demais' using errcode = '22023';
  end if;
  insert into public.ranking_denuncias (denunciante, alvo, motivo) values (auth.uid(), p_alvo, btrim(p_motivo));
end;
$$;

revoke all on function public.denunciar_no_ranking(uuid, text) from public, anon;
grant execute on function public.denunciar_no_ranking(uuid, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 8. A AUDITORIA (SÓ O ADMIN DO POUP)
-- ---------------------------------------------------------------------------

-- O que precisa de olho humano no período: disputas, excedentes do teto,
-- vendas de quem foi denunciado e as dos 10 primeiros do Brasil.
create or replace function public.ranking_auditoria(p_periodo text default 'mes')
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
  bloqueado boolean
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
         exists (select 1 from public.ranking_bloqueios b where b.user_id = s.user_id)
    from sit s
    join public.sales v on v.id = s.sale_id
    join public.profiles p on p.id = s.user_id
    left join public.ranking_revisoes r on r.sale_id = s.sale_id
    left join den d on d.alvo = s.user_id
   where p.ranking_participa
     and (s.situacao in ('em_disputa', 'acima_do_teto')
          or d.n > 0
          or (s.situacao = 'conta' and s.user_id in (select user_id from topo)))
   order by coalesce(d.n, 0) desc, (s.situacao = 'em_disputa') desc, p.full_name, v.sale_date;
end;
$$;

revoke all on function public.ranking_auditoria(text) from public, anon;
grant execute on function public.ranking_auditoria(text) to authenticated, service_role;


-- Validar ou invalidar uma venda. `p_decisao` nulo apaga a decisão.
create or replace function public.ranking_revisar_venda(p_sale uuid, p_decisao text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_decisao is null then
    delete from public.ranking_revisoes where sale_id = p_sale;
    return;
  end if;
  if p_decisao not in ('valida', 'invalida') then
    raise exception 'decisao_invalida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sales where id = p_sale) then
    raise exception 'venda_inexistente' using errcode = '22023';
  end if;
  insert into public.ranking_revisoes (sale_id, decisao, motivo, revisado_por, revisado_em)
  values (p_sale, p_decisao, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid(), now())
  on conflict (sale_id) do update
    set decisao = excluded.decisao, motivo = excluded.motivo,
        revisado_por = excluded.revisado_por, revisado_em = excluded.revisado_em;
end;
$$;

revoke all on function public.ranking_revisar_venda(uuid, text, text) from public, anon;
grant execute on function public.ranking_revisar_venda(uuid, text, text) to authenticated, service_role;


-- Tirar do ranking (fraude comprovada) ou devolver. `p_motivo` nulo devolve.
-- As denúncias abertas contra a conta são dadas por resolvidas.
create or replace function public.ranking_bloquear(p_user uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_motivo is null then
    delete from public.ranking_bloqueios where user_id = p_user;
  else
    insert into public.ranking_bloqueios (user_id, motivo, bloqueado_por, bloqueado_em)
    values (p_user, btrim(p_motivo), auth.uid(), now())
    on conflict (user_id) do update
      set motivo = excluded.motivo, bloqueado_por = excluded.bloqueado_por, bloqueado_em = excluded.bloqueado_em;
  end if;
  update public.ranking_denuncias
     set resolvida_em = now(), resolvida_por = auth.uid()
   where alvo = p_user and resolvida_em is null;
end;
$$;

revoke all on function public.ranking_bloquear(uuid, text) from public, anon;
grant execute on function public.ranking_bloquear(uuid, text) to authenticated, service_role;


-- Encerrar as denúncias de uma conta sem bloquear (a auditoria conferiu e
-- estava tudo certo).
create or replace function public.ranking_arquivar_denuncias(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  update public.ranking_denuncias
     set resolvida_em = now(), resolvida_por = auth.uid()
   where alvo = p_user and resolvida_em is null;
end;
$$;

revoke all on function public.ranking_arquivar_denuncias(uuid) from public, anon;
grant execute on function public.ranking_arquivar_denuncias(uuid) to authenticated, service_role;


-- ===========================================================================
-- CONFERÊNCIA
-- ===========================================================================
--   select * from public.ranking('brasil', 'mes');          -- como corretor
--   select * from public.ranking_auditoria('mes');          -- como admin
-- ===========================================================================
