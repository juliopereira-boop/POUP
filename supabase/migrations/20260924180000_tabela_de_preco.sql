-- ===========================================================================
-- TABELA DE PREÇO DO EMPREENDIMENTO
-- ===========================================================================
-- A construtora manda, todo mês, um PDF com a tabela de preço. A do Village
-- Connect I (Canopus) é o modelo, e ela NÃO traz um preço por apartamento:
-- traz uma REGRA de 13 linhas — o preço depende do andar, da ventilação
-- (mais / menos ventilado) e da vaga (carro / moto) — e uma LISTA das
-- unidades com vaga de moto.
--
-- Esta migration guarda exatamente isso, e o preço de cada unidade é calculado
-- no aplicativo (`src/features/tabelaPreco/preco.ts`):
--
--   * `development_price_tables`   uma linha por empreendimento: as linhas da
--                                  regra, a lista de vagas e o PDF de origem;
--   * `development_blocks.terminacoes_mais_ventiladas`
--                                  a regra de ventilação de cada bloco
--                                  ("finais 1 e 3 são mais ventilados");
--   * bucket `tabelas-de-preco`    o PDF, guardado junto do empreendimento.
--
-- Por que guardar a LISTA de vagas e não a vaga de cada unidade: o corretor
-- pode enviar a tabela antes de terminar o cadastro de blocos. Com a lista
-- guardada, o de-para é refeito a cada leitura, e o bloco cadastrado depois
-- já nasce com a vaga certa.
--
-- QUEM LÊ E QUEM ESCREVE: as mesmas regras do empreendimento, pelas funções
-- `pode_ler_empreendimento` e `pode_editar_empreendimento` da migration
-- 20260924150000. Catálogo: todos leem, só o admin escreve.
--
-- DEPENDE DE: 20260924150000_blocos_e_unidades.sql (rode aquela antes).
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A REGRA DE VENTILAÇÃO, NO BLOCO
-- ---------------------------------------------------------------------------
-- As terminações (a posição no andar: "301" termina em 1) que são mais
-- ventiladas. As outras são menos ventiladas. Nulo = o bloco ainda não tem
-- regra. Fica no bloco, e não no empreendimento, porque num condomínio os
-- blocos costumam ser espelhados: o final 1 de um é o final 2 do vizinho.

alter table public.development_blocks
  add column if not exists terminacoes_mais_ventiladas smallint[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'development_blocks_ventilacao_valida'
  ) then
    alter table public.development_blocks
      add constraint development_blocks_ventilacao_valida check (
        terminacoes_mais_ventiladas is null or (
          cardinality(terminacoes_mais_ventiladas) <= 99
          and array_position(terminacoes_mais_ventiladas, null) is null
          and 1 <= all (terminacoes_mais_ventiladas)
          and 99 >= all (terminacoes_mais_ventiladas)
        )
      );
  end if;
end $$;

comment on column public.development_blocks.terminacoes_mais_ventiladas is
  'Terminações (posição no andar) mais ventiladas; as demais são menos ventiladas. Nulo = sem regra.';


-- ---------------------------------------------------------------------------
-- 2. A TABELA
-- ---------------------------------------------------------------------------
-- Formatos (validados e normalizados pela função da seção 4 — a tabela só
-- recebe escrita por ela):
--
--   regras: [{ "pavimento": 1 | null, "ventilacao": "mais" | "menos" | null,
--              "vaga": "carro" | "moto" | null, "area_m2": 40.94 | null,
--              "avaliacao": 231900 | null, "venda": 244780 }]
--           (nulo = a linha vale para qualquer valor daquela característica)
--
--   vagas:  { "vaga_da_lista": "moto", "vaga_das_demais": "carro" | null,
--             "unidades": [{ "bloco": "02", "unidade": "301" }] }

create table if not exists public.development_price_tables (
  development_id uuid primary key references public.developments(id) on delete cascade,
  referencia text not null default '' check (char_length(referencia) <= 60),
  regras jsonb not null default '[]'::jsonb check (jsonb_typeof(regras) = 'array'),
  vagas jsonb check (vagas is null or jsonb_typeof(vagas) = 'object'),
  arquivo_path text check (arquivo_path is null or char_length(arquivo_path) <= 400),
  arquivo_nome text check (arquivo_nome is null or char_length(arquivo_nome) <= 200),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

comment on table public.development_price_tables is
  'Tabela de preço por regra (andar × ventilação × vaga) e lista de vagas. Escrita só por salvar_tabela_de_preco.';

alter table public.development_price_tables enable row level security;

-- Só leitura direta. A escrita passa pela função, que valida o formato — um
-- JSON torto gravado direto quebraria o preço de todas as unidades.
revoke all on public.development_price_tables from public, anon, authenticated;
grant select on public.development_price_tables to authenticated;
grant all on public.development_price_tables to service_role;

drop policy if exists "tabela_preco_select" on public.development_price_tables;
create policy "tabela_preco_select" on public.development_price_tables for select to authenticated
  using (public.pode_ler_empreendimento(development_id));


-- ---------------------------------------------------------------------------
-- 3. O PDF, NO STORAGE
-- ---------------------------------------------------------------------------
-- Caminho: `<id do empreendimento>/<data>-<nome do arquivo>.pdf`. A primeira
-- pasta é o empreendimento, e é dela que as policies tiram a permissão.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tabelas-de-preco', 'tabelas-de-preco', false, 15728640, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- O empreendimento dono de um arquivo, pela primeira pasta. Nulo se a pasta
-- não for um uuid — e nulo não passa em nenhuma policy. O `case` garante que o
-- cast só acontece depois do teste (um AND não garante a ordem).
create or replace function public.empreendimento_da_pasta(caminho text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when split_part(caminho, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(caminho, '/', 1)::uuid
  end;
$$;

revoke all on function public.empreendimento_da_pasta(text) from public, anon;
grant execute on function public.empreendimento_da_pasta(text) to authenticated, service_role;

drop policy if exists "tabelas_preco_select" on storage.objects;
create policy "tabelas_preco_select" on storage.objects for select to authenticated
  using (bucket_id = 'tabelas-de-preco'
         and public.pode_ler_empreendimento(public.empreendimento_da_pasta(name)));

drop policy if exists "tabelas_preco_insert" on storage.objects;
create policy "tabelas_preco_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'tabelas-de-preco'
              and public.pode_editar_empreendimento(public.empreendimento_da_pasta(name)));

drop policy if exists "tabelas_preco_update" on storage.objects;
create policy "tabelas_preco_update" on storage.objects for update to authenticated
  using (bucket_id = 'tabelas-de-preco'
         and public.pode_editar_empreendimento(public.empreendimento_da_pasta(name)))
  with check (bucket_id = 'tabelas-de-preco'
              and public.pode_editar_empreendimento(public.empreendimento_da_pasta(name)));

drop policy if exists "tabelas_preco_delete" on storage.objects;
create policy "tabelas_preco_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tabelas-de-preco'
         and public.pode_editar_empreendimento(public.empreendimento_da_pasta(name)));


-- ---------------------------------------------------------------------------
-- 4. SALVAR A TABELA
-- ---------------------------------------------------------------------------
-- `security definer` porque a tabela não tem grant de escrita para ninguém
-- além do service_role. Por isso a permissão é conferida aqui, primeiro, com
-- as mesmas funções das policies — e `auth.uid()` continua sendo quem chama.
--
-- Os erros saem como código (`regra_repetida`) e o aplicativo traduz, como em
-- `salvar_blocos_empreendimento`. `p_tabela` nulo APAGA a tabela.
--
--   p_tabela: { "referencia": "Setembro", "regras": [...], "vagas": {...} | null,
--               "arquivo": { "path": "<dev>/...pdf", "nome": "Tabela.pdf" } | null }

create or replace function public.salvar_tabela_de_preco(p_development uuid, p_tabela jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_referencia text;
  v_regras jsonb;
  v_vagas jsonb := null;
  v_arquivo jsonb;
  v_path text := null;
  v_nome text := null;
  v_qtd integer;
  v_distintas integer;
  v_invalidas integer;
begin
  if p_development is null or not public.pode_editar_empreendimento(p_development) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  if p_tabela is null or jsonb_typeof(p_tabela) = 'null' then
    delete from public.development_price_tables where development_id = p_development;
    return;
  end if;
  if jsonb_typeof(p_tabela) <> 'object' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;

  -- Referência -----------------------------------------------------------
  v_referencia := btrim(coalesce(p_tabela->>'referencia', ''));
  if char_length(v_referencia) > 60 then
    raise exception 'referencia_invalida' using errcode = '22023';
  end if;

  -- Regras -----------------------------------------------------------------
  v_regras := coalesce(p_tabela->'regras', '[]'::jsonb);
  if jsonb_typeof(v_regras) <> 'array' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;
  if jsonb_array_length(v_regras) > 500 then
    raise exception 'regras_demais' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_regras) e where jsonb_typeof(e) <> 'object') then
    raise exception 'regra_invalida' using errcode = '22023';
  end if;

  begin
    select count(*),
           count(distinct (coalesce(r.pavimento, 0), coalesce(r.ventilacao, '*'), coalesce(r.vaga, '*'))),
           count(*) filter (
             where (r.pavimento is not null and r.pavimento not between 1 and 200)
                or (r.ventilacao is not null and r.ventilacao not in ('mais', 'menos'))
                or (r.vaga is not null and r.vaga not in ('carro', 'moto'))
                or r.venda is null or r.venda <= 0 or r.venda >= 1e11
                or (r.avaliacao is not null and (r.avaliacao <= 0 or r.avaliacao >= 1e11))
                or (r.area_m2 is not null and (r.area_m2 <= 0 or r.area_m2 >= 1e6))
           )
      into v_qtd, v_distintas, v_invalidas
      from jsonb_array_elements(v_regras) as x(e),
           jsonb_to_record(x.e) as r(
             pavimento integer, ventilacao text, vaga text,
             area_m2 numeric, avaliacao numeric, venda numeric
           );

    -- Grava só as chaves conhecidas, com os tipos certos, na ordem recebida.
    select coalesce(jsonb_agg(jsonb_build_object(
             'pavimento', r.pavimento,
             'ventilacao', r.ventilacao,
             'vaga', r.vaga,
             'area_m2', round(r.area_m2, 2),
             'avaliacao', round(r.avaliacao, 2),
             'venda', round(r.venda, 2)
           ) order by x.o), '[]'::jsonb)
      into v_regras
      from jsonb_array_elements(v_regras) with ordinality as x(e, o),
           jsonb_to_record(x.e) as r(
             pavimento integer, ventilacao text, vaga text,
             area_m2 numeric, avaliacao numeric, venda numeric
           );
  exception
    when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value
      or datatype_mismatch or invalid_datetime_format then
      raise exception 'regra_invalida' using errcode = '22023';
  end;

  if v_invalidas > 0 then
    raise exception 'regra_invalida' using errcode = '22023';
  end if;
  if v_distintas <> v_qtd then
    raise exception 'regra_repetida' using errcode = '22023';
  end if;

  -- Lista de vagas ---------------------------------------------------------
  if p_tabela ? 'vagas' and jsonb_typeof(p_tabela->'vagas') <> 'null' then
    v_vagas := p_tabela->'vagas';
    if jsonb_typeof(v_vagas) <> 'object'
       or coalesce(v_vagas->>'vaga_da_lista', '') not in ('carro', 'moto')
       or (jsonb_typeof(v_vagas->'vaga_das_demais') is distinct from 'null'
           and v_vagas ? 'vaga_das_demais'
           and coalesce(v_vagas->>'vaga_das_demais', '') not in ('carro', 'moto'))
       or jsonb_typeof(coalesce(v_vagas->'unidades', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(v_vagas->'unidades', '[]'::jsonb)) > 20000
       or exists (
            select 1 from jsonb_array_elements(coalesce(v_vagas->'unidades', '[]'::jsonb)) e
             where jsonb_typeof(e) <> 'object'
                or char_length(btrim(coalesce(e->>'bloco', ''))) not between 1 and 20
                or char_length(btrim(coalesce(e->>'unidade', ''))) not between 1 and 20
          )
    then
      raise exception 'vagas_invalidas' using errcode = '22023';
    end if;

    select jsonb_build_object(
             'vaga_da_lista', v_vagas->>'vaga_da_lista',
             'vaga_das_demais', v_vagas->>'vaga_das_demais',
             'unidades', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'bloco', btrim(e->>'bloco'),
                        'unidade', btrim(e->>'unidade')) order by o)
                 from jsonb_array_elements(coalesce(v_vagas->'unidades', '[]'::jsonb))
                      with ordinality as x(e, o)
             ), '[]'::jsonb))
      into v_vagas;
  end if;

  -- O PDF de origem --------------------------------------------------------
  -- O caminho tem de estar na pasta DESTE empreendimento: sem isso, dava para
  -- apontar a tabela para o PDF de outro corretor.
  v_arquivo := p_tabela->'arquivo';
  if v_arquivo is not null and jsonb_typeof(v_arquivo) <> 'null' then
    v_path := v_arquivo->>'path';
    v_nome := btrim(coalesce(v_arquivo->>'nome', ''));
    if jsonb_typeof(v_arquivo) <> 'object'
       or v_path is null
       or char_length(v_path) > 400
       or split_part(v_path, '/', 1) <> p_development::text
       or v_path !~ '^[^/]+/[^/]+\.pdf$'
       or char_length(v_nome) > 200
    then
      raise exception 'arquivo_invalido' using errcode = '22023';
    end if;
    if v_nome = '' then v_nome := split_part(v_path, '/', 2); end if;
  end if;

  insert into public.development_price_tables as t
    (development_id, referencia, regras, vagas, arquivo_path, arquivo_nome, atualizado_em, atualizado_por)
  values
    (p_development, v_referencia, v_regras, v_vagas, v_path, v_nome, now(), auth.uid())
  on conflict (development_id) do update
    set referencia = excluded.referencia,
        regras = excluded.regras,
        vagas = excluded.vagas,
        arquivo_path = excluded.arquivo_path,
        arquivo_nome = excluded.arquivo_nome,
        atualizado_em = now(),
        atualizado_por = auth.uid();
end;
$$;

comment on function public.salvar_tabela_de_preco(uuid, jsonb) is
  'Grava (ou apaga, com p_tabela nulo) a tabela de preço de um empreendimento, validando o formato.';

revoke all on function public.salvar_tabela_de_preco(uuid, jsonb) from public, anon;
grant execute on function public.salvar_tabela_de_preco(uuid, jsonb) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. SALVAR BLOCOS, AGORA COM A REGRA DE VENTILAÇÃO
-- ---------------------------------------------------------------------------
-- A mesma função da migration anterior, com uma chave a mais por bloco:
--
--   { "id": ..., "nome": "Bloco 1", "ventilacao_mais": [1, 3] | null, "unidades": [...] }
--
-- A chave AUSENTE mantém a regra que o bloco já tem (um aplicativo antigo que
-- não conhece a ventilação não pode apagá-la ao salvar). `null` remove a regra.

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
  v_tem_ventilacao boolean;
  v_ventilacao smallint[];
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

    -- A regra de ventilação ------------------------------------------------
    v_tem_ventilacao := v_bloco ? 'ventilacao_mais';
    v_ventilacao := null;
    if v_tem_ventilacao and jsonb_typeof(v_bloco->'ventilacao_mais') <> 'null' then
      if jsonb_typeof(v_bloco->'ventilacao_mais') <> 'array'
         or jsonb_array_length(v_bloco->'ventilacao_mais') > 99
         or exists (
              select 1 from jsonb_array_elements(v_bloco->'ventilacao_mais') t
               -- `case`, e não OR: só converte para número o que É número.
               where case
                       when jsonb_typeof(t) <> 'number' then true
                       else (t::text)::numeric <> trunc((t::text)::numeric)
                         or (t::text)::numeric not between 1 and 99
                     end
            )
      then
        raise exception 'ventilacao_invalida' using errcode = '22023';
      end if;
      select coalesce(array_agg(distinct (t::text)::smallint order by (t::text)::smallint), '{}')
        into v_ventilacao
        from jsonb_array_elements(v_bloco->'ventilacao_mais') t;
    end if;

    v_id := null;
    if coalesce(v_bloco->>'id', '') ~ '^[0-9a-fA-F-]{36}$' then
      update public.development_blocks
         set nome = v_nome,
             ordem = v_indice,
             terminacoes_mais_ventiladas =
               case when v_tem_ventilacao then v_ventilacao else terminacoes_mais_ventiladas end,
             updated_at = now()
       where id = (v_bloco->>'id')::uuid
         and development_id = p_development
      returning id into v_id;
    end if;
    if v_id is null then
      insert into public.development_blocks (development_id, nome, ordem, terminacoes_mais_ventiladas)
      values (p_development, v_nome, v_indice, v_ventilacao)
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

  delete from public.development_blocks
   where development_id = p_development
     and not (id = any(v_mantidos));
end;
$$;

comment on function public.salvar_blocos_empreendimento(uuid, jsonb) is
  'Sincroniza todos os blocos e unidades de um empreendimento numa transação, com a regra de ventilação de cada bloco. Preserva o valor das unidades que continuam existindo.';

revoke all on function public.salvar_blocos_empreendimento(uuid, jsonb) from public, anon;
grant execute on function public.salvar_blocos_empreendimento(uuid, jsonb) to authenticated, service_role;


-- ===========================================================================
-- CONFERÊNCIA
-- ===========================================================================
--   select d.name, t.referencia, jsonb_array_length(t.regras) as linhas,
--          jsonb_array_length(t.vagas->'unidades') as na_lista_de_vagas,
--          t.arquivo_nome, t.atualizado_em
--     from public.development_price_tables t
--     join public.developments d on d.id = t.development_id;
-- ===========================================================================
