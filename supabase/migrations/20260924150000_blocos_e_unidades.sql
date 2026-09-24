-- ===========================================================================
-- BLOCOS E UNIDADES DO EMPREENDIMENTO
-- ===========================================================================
-- Até aqui a unidade era digitada livre na simulação: o POUP sabia que o
-- empreendimento existia, mas não quantos apartamentos ele tem nem quanto custa
-- cada um. Estas duas tabelas guardam a forma de cada bloco — e abrem espaço
-- para o preço por unidade, que vai chegar pela tabela de preços da construtora.
--
-- QUEM LÊ E QUEM ESCREVE
-- ---------------------------------------------------------------------------
-- Exatamente as mesmas regras do empreendimento (migration 0024), herdadas
-- dele e não repetidas: quem pode ler o empreendimento lê os blocos; quem pode
-- editá-lo edita os blocos. Empreendimento do catálogo continua sendo mantido
-- só pelo admin do POUP — o corretor vê as unidades, não mexe.
--
-- Por isso as tabelas NÃO têm user_id. A autorização mora inteira no
-- empreendimento pai, e isso evita de graça o problema que a 0026 teve de
-- resolver à mão: um catálogo que não pode morrer junto com o dono.
--
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. AS DUAS TABELAS
-- ---------------------------------------------------------------------------

create table if not exists public.development_blocks (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  -- Posição na lista, que é a ordem em que o corretor cadastrou.
  ordem integer not null default 0 check (ordem between 0 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Alvo da chave composta das unidades, logo abaixo.
  unique (id, development_id)
);

create index if not exists development_blocks_por_empreendimento
  on public.development_blocks (development_id, ordem);

comment on table public.development_blocks is
  'Blocos (ou quadras) de um empreendimento. Acesso herdado do empreendimento.';

create table if not exists public.development_units (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null,
  -- Repetido aqui para a RLS e a consulta por empreendimento não precisarem de
  -- junção. A chave composta abaixo impede que ele discorde do bloco.
  development_id uuid not null,
  -- Livre de propósito: hoje o código sai do gerador (001, 101...), mas a tabela
  -- de preços pode trazer "A101" ou "Casa 12".
  codigo text not null check (char_length(btrim(codigo)) between 1 and 20),
  -- 1 = térreo.
  pavimento integer not null check (pavimento between 1 and 200),
  ordem integer not null default 0 check (ordem between 0 and 9999),
  -- Valor de venda da unidade, em reais. Nulo até a tabela de preços chegar.
  valor numeric(14, 2) check (valor is null or valor > 0),
  valor_atualizado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_id, codigo),
  foreign key (block_id, development_id)
    references public.development_blocks (id, development_id) on delete cascade
);

create index if not exists development_units_por_empreendimento
  on public.development_units (development_id);

comment on table public.development_units is
  'Unidades de um bloco. O código casa com a tabela de preços da construtora.';
comment on column public.development_units.valor is
  'Valor de venda da unidade. Preenchido pela atualização da tabela de preços; nulo = sem preço.';


-- ---------------------------------------------------------------------------
-- 2. QUEM PODE O QUÊ, DERIVADO DO EMPREENDIMENTO
-- ---------------------------------------------------------------------------
-- Cópia fiel das policies de `developments` (0024). Security definer porque
-- uma policy consulta outra tabela; sem isso a checagem dependeria da RLS de
-- `developments` do usuário que está chamando.

create or replace function public.pode_ler_empreendimento(did uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.developments d
     where d.id = did
       and (d.user_id = auth.uid() or public.is_catalog_company(d.company_id))
  );
$$;

create or replace function public.pode_editar_empreendimento(did uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.developments d
     where d.id = did
       and (
         (d.user_id = auth.uid() and public.is_own_private_company(d.company_id))
         or (public.is_catalog_company(d.company_id) and public.is_app_admin())
       )
  );
$$;

revoke all on function public.pode_ler_empreendimento(uuid), public.pode_editar_empreendimento(uuid)
  from public, anon;
grant execute on function public.pode_ler_empreendimento(uuid), public.pode_editar_empreendimento(uuid)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.development_blocks enable row level security;
alter table public.development_units enable row level security;

revoke all on public.development_blocks, public.development_units from public, anon;
grant select, insert, update, delete on public.development_blocks, public.development_units
  to authenticated;
grant all on public.development_blocks, public.development_units to service_role;

drop policy if exists "blocos_select" on public.development_blocks;
create policy "blocos_select" on public.development_blocks for select to authenticated
  using (public.pode_ler_empreendimento(development_id));

drop policy if exists "blocos_insert" on public.development_blocks;
create policy "blocos_insert" on public.development_blocks for insert to authenticated
  with check (public.pode_editar_empreendimento(development_id));

drop policy if exists "blocos_update" on public.development_blocks;
create policy "blocos_update" on public.development_blocks for update to authenticated
  using (public.pode_editar_empreendimento(development_id))
  with check (public.pode_editar_empreendimento(development_id));

drop policy if exists "blocos_delete" on public.development_blocks;
create policy "blocos_delete" on public.development_blocks for delete to authenticated
  using (public.pode_editar_empreendimento(development_id));

drop policy if exists "unidades_select" on public.development_units;
create policy "unidades_select" on public.development_units for select to authenticated
  using (public.pode_ler_empreendimento(development_id));

drop policy if exists "unidades_insert" on public.development_units;
create policy "unidades_insert" on public.development_units for insert to authenticated
  with check (public.pode_editar_empreendimento(development_id));

drop policy if exists "unidades_update" on public.development_units;
create policy "unidades_update" on public.development_units for update to authenticated
  using (public.pode_editar_empreendimento(development_id))
  with check (public.pode_editar_empreendimento(development_id));

drop policy if exists "unidades_delete" on public.development_units;
create policy "unidades_delete" on public.development_units for delete to authenticated
  using (public.pode_editar_empreendimento(development_id));


-- ---------------------------------------------------------------------------
-- 4. SALVAR TODOS OS BLOCOS DE UMA VEZ
-- ---------------------------------------------------------------------------
-- O corretor edita a forma do empreendimento inteiro e aperta Salvar uma vez.
-- Fazer isso em várias chamadas deixaria, numa queda de rede no meio, um bloco
-- salvo pela metade. Uma função é uma transação: ou tudo, ou nada.
--
-- O QUE ESTA FUNÇÃO NUNCA FAZ: APAGAR PREÇO
-- ---------------------------------------------------------------------------
-- As unidades são sincronizadas pelo CÓDIGO, não recriadas. Quem continua
-- existindo mantém a linha — e o valor que a tabela de preços gravou nela.
-- Acrescentar um andar não pode zerar o preço dos andares de baixo.
--
-- `security invoker`: roda com as permissões de quem chama, então cada insert,
-- update e delete passa pela RLS acima. A checagem do começo existe só para
-- devolver um erro legível em vez de "violates row-level security policy".
--
-- Formato de p_blocos:
--   [{ "id": "<uuid ou nulo>", "nome": "Bloco 1",
--      "unidades": [{ "codigo": "001", "pavimento": 1, "ordem": 0 }, ...] }]

create or replace function public.salvar_blocos_empreendimento(p_development uuid, p_blocos jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_bloco jsonb;
  v_unidades jsonb;
  v_indice integer := 0;
  v_id uuid;
  v_nome text;
  v_mantidos uuid[] := '{}';
  v_qtd integer;
  v_distintos integer;
  v_invalidos integer;
begin
  if p_development is null or not public.pode_editar_empreendimento(p_development) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if p_blocos is null or jsonb_typeof(p_blocos) <> 'array' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;
  if jsonb_array_length(p_blocos) > 50 then
    raise exception 'blocos_demais' using errcode = '22023';
  end if;

  -- Dois blocos com o mesmo nome tornariam a escolha no simulador ambígua.
  if (select count(*) <> count(distinct lower(btrim(value->>'nome')))
        from jsonb_array_elements(p_blocos)) then
    raise exception 'nome_de_bloco_repetido' using errcode = '22023';
  end if;

  for v_bloco in select value from jsonb_array_elements(p_blocos) loop
    v_nome := btrim(coalesce(v_bloco->>'nome', ''));
    if char_length(v_nome) not between 1 and 60 then
      raise exception 'nome_de_bloco_invalido' using errcode = '22023';
    end if;

    v_unidades := coalesce(v_bloco->'unidades', '[]'::jsonb);
    if jsonb_typeof(v_unidades) <> 'array' then
      raise exception 'formato_invalido' using errcode = '22023';
    end if;
    if jsonb_array_length(v_unidades) = 0 then
      raise exception 'bloco_sem_unidade' using errcode = '22023';
    end if;
    if jsonb_array_length(v_unidades) > 2000 then
      raise exception 'unidades_demais' using errcode = '22023';
    end if;

    select count(*),
           count(distinct btrim(u.codigo)),
           count(*) filter (
             where u.codigo is null
                or char_length(btrim(u.codigo)) not between 1 and 20
                or u.pavimento is null
                or u.pavimento not between 1 and 200
           )
      into v_qtd, v_distintos, v_invalidos
      from jsonb_to_recordset(v_unidades) as u(codigo text, pavimento integer);

    if v_invalidos > 0 then
      raise exception 'unidade_invalida' using errcode = '22023';
    end if;
    if v_distintos <> v_qtd then
      raise exception 'codigo_repetido' using errcode = '22023';
    end if;

    -- Bloco que já existe NESTE empreendimento é atualizado; qualquer outro id
    -- (inclusive um de outro empreendimento) vira bloco novo.
    v_id := null;
    if coalesce(v_bloco->>'id', '') ~ '^[0-9a-fA-F-]{36}$' then
      update public.development_blocks
         set nome = v_nome, ordem = v_indice, updated_at = now()
       where id = (v_bloco->>'id')::uuid
         and development_id = p_development
      returning id into v_id;
    end if;
    if v_id is null then
      insert into public.development_blocks (development_id, nome, ordem)
      values (p_development, v_nome, v_indice)
      returning id into v_id;
    end if;
    v_mantidos := v_mantidos || v_id;

    delete from public.development_units du
     where du.block_id = v_id
       and du.codigo not in (
         select btrim(u.codigo) from jsonb_to_recordset(v_unidades) as u(codigo text)
       );

    insert into public.development_units (block_id, development_id, codigo, pavimento, ordem)
    select v_id, p_development, btrim(u.codigo), u.pavimento,
           greatest(0, least(coalesce(u.ordem, 0), 9999))
      from jsonb_to_recordset(v_unidades) as u(codigo text, pavimento integer, ordem integer)
    on conflict (block_id, codigo) do update
       set pavimento = excluded.pavimento,
           ordem = excluded.ordem,
           updated_at = now();

    v_indice := v_indice + 1;
  end loop;

  -- Blocos que saíram da lista saem do banco, e as unidades vão junto.
  delete from public.development_blocks
   where development_id = p_development
     and not (id = any(v_mantidos));
end;
$$;

comment on function public.salvar_blocos_empreendimento(uuid, jsonb) is
  'Sincroniza todos os blocos e unidades de um empreendimento numa transação. Preserva o valor das unidades que continuam existindo.';

revoke all on function public.salvar_blocos_empreendimento(uuid, jsonb) from public, anon;
grant execute on function public.salvar_blocos_empreendimento(uuid, jsonb) to authenticated, service_role;


-- ===========================================================================
-- CONFERÊNCIA
-- ===========================================================================
--   select d.name, b.nome, count(u.id) as unidades,
--          count(u.valor) as com_preco
--     from public.development_blocks b
--     join public.developments d on d.id = b.development_id
--     left join public.development_units u on u.block_id = b.id
--    group by d.name, b.nome, b.ordem
--    order by d.name, b.ordem;
-- ===========================================================================
