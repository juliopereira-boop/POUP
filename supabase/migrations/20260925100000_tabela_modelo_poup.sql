-- ===========================================================================
-- TABELA DE PREÇO NO MODELO POUP
-- ===========================================================================
-- Cada construtora manda a tabela de um jeito. Em vez de ensinar o aplicativo
-- a ler cada PDF novo, a tabela é passada para UM formato — o modelo POUP, um
-- CSV (ver `src/features/tabelaPreco/modelo.ts`) — e o aplicativo só lê esse.
--
-- O modelo traz uma forma de preço que a tabela ainda não guardava: o preço
-- de CADA apartamento (o "espelho" que muitas construtoras mandam). Esta
-- migration:
--
--   * acrescenta `precos_unidades` à tabela de preço — o preço da unidade vence
--     o preço por regra;
--   * deixa o bucket `tabelas-de-preco` guardar também o CSV do modelo;
--   * refaz `salvar_tabela_de_preco` para validar e gravar o preço por unidade,
--     e aceitar o CSV como arquivo de origem.
--
-- DEPENDE DE: 20260924180000_tabela_de_preco.sql (rode aquela antes).
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. PREÇO POR UNIDADE
-- ---------------------------------------------------------------------------
--   precos_unidades: [{ "bloco": "05", "unidade": "104", "vaga": "carro" | null,
--                       "area_m2": 40.94 | null, "avaliacao": 236900 | null,
--                       "venda": 256280 }]

alter table public.development_price_tables
  add column if not exists precos_unidades jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'development_price_tables_precos_unidades_lista'
  ) then
    alter table public.development_price_tables
      add constraint development_price_tables_precos_unidades_lista
      check (jsonb_typeof(precos_unidades) = 'array');
  end if;
end $$;

comment on column public.development_price_tables.precos_unidades is
  'Preço de apartamentos específicos (o espelho da construtora). Vence o preço por regra.';


-- ---------------------------------------------------------------------------
-- 2. O BUCKET ACEITA O CSV DO MODELO
-- ---------------------------------------------------------------------------

update storage.buckets
   set allowed_mime_types = array['application/pdf', 'text/csv', 'text/plain']
 where id = 'tabelas-de-preco';


-- ---------------------------------------------------------------------------
-- 3. SALVAR A TABELA, AGORA COM O PREÇO POR UNIDADE
-- ---------------------------------------------------------------------------
-- A mesma função da migration anterior, com duas mudanças: valida e grava
-- `precos_unidades` (chave ausente = sem preço por unidade), e o arquivo de
-- origem pode ser `.pdf` ou `.csv`. Códigos novos: `precos_unidades_invalidos`,
-- `precos_unidades_demais`, `unidade_repetida`.
--
--   p_tabela: { "referencia", "regras", "vagas", "precos_unidades", "arquivo" }

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
  v_precos jsonb := '[]'::jsonb;
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

  -- Preço por unidade (o "espelho") ----------------------------------------
  if p_tabela ? 'precos_unidades' and jsonb_typeof(p_tabela->'precos_unidades') <> 'null' then
    v_precos := p_tabela->'precos_unidades';
    if jsonb_typeof(v_precos) <> 'array' then
      raise exception 'precos_unidades_invalidos' using errcode = '22023';
    end if;
    if jsonb_array_length(v_precos) > 20000 then
      raise exception 'precos_unidades_demais' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_precos) e where jsonb_typeof(e) <> 'object') then
      raise exception 'precos_unidades_invalidos' using errcode = '22023';
    end if;

    begin
      select count(*) filter (
               where char_length(btrim(coalesce(p.bloco, ''))) not between 1 and 20
                  or char_length(btrim(coalesce(p.unidade, ''))) not between 1 and 20
                  or p.venda is null or p.venda <= 0 or p.venda >= 1e11
                  or (p.avaliacao is not null and (p.avaliacao <= 0 or p.avaliacao >= 1e11))
                  or (p.area_m2 is not null and (p.area_m2 <= 0 or p.area_m2 >= 1e6))
                  or (p.vaga is not null and p.vaga not in ('carro', 'moto'))
             ),
             count(*) - count(distinct (upper(btrim(p.bloco)), upper(btrim(p.unidade))))
        into v_invalidas, v_qtd
        from jsonb_array_elements(v_precos) as x(e),
             jsonb_to_record(x.e) as p(
               bloco text, unidade text, vaga text, area_m2 numeric, avaliacao numeric, venda numeric
             );

      select coalesce(jsonb_agg(jsonb_build_object(
               'bloco', btrim(p.bloco),
               'unidade', btrim(p.unidade),
               'vaga', p.vaga,
               'area_m2', round(p.area_m2, 2),
               'avaliacao', round(p.avaliacao, 2),
               'venda', round(p.venda, 2)
             ) order by x.o), '[]'::jsonb)
        into v_precos
        from jsonb_array_elements(v_precos) with ordinality as x(e, o),
             jsonb_to_record(x.e) as p(
               bloco text, unidade text, vaga text, area_m2 numeric, avaliacao numeric, venda numeric
             );
    exception
      when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value
        or datatype_mismatch then
        raise exception 'precos_unidades_invalidos' using errcode = '22023';
    end;

    if v_invalidas > 0 then
      raise exception 'precos_unidades_invalidos' using errcode = '22023';
    end if;
    if v_qtd > 0 then
      raise exception 'unidade_repetida' using errcode = '22023';
    end if;
  end if;

  -- O arquivo de origem (PDF ou modelo POUP) ---------------------------------
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
       or v_path !~* '^[^/]+/[^/]+\.(pdf|csv)$'
       or char_length(v_nome) > 200
    then
      raise exception 'arquivo_invalido' using errcode = '22023';
    end if;
    if v_nome = '' then v_nome := split_part(v_path, '/', 2); end if;
  end if;

  insert into public.development_price_tables as t
    (development_id, referencia, regras, vagas, precos_unidades, arquivo_path, arquivo_nome, atualizado_em, atualizado_por)
  values
    (p_development, v_referencia, v_regras, v_vagas, v_precos, v_path, v_nome, now(), auth.uid())
  on conflict (development_id) do update
    set referencia = excluded.referencia,
        regras = excluded.regras,
        vagas = excluded.vagas,
        precos_unidades = excluded.precos_unidades,
        arquivo_path = excluded.arquivo_path,
        arquivo_nome = excluded.arquivo_nome,
        atualizado_em = now(),
        atualizado_por = auth.uid();
end;
$$;


comment on function public.salvar_tabela_de_preco(uuid, jsonb) is
  'Grava (ou apaga, com p_tabela nulo) a tabela de preço de um empreendimento — regra, lista de vagas e preço por unidade —, validando o formato.';

revoke all on function public.salvar_tabela_de_preco(uuid, jsonb) from public, anon;
grant execute on function public.salvar_tabela_de_preco(uuid, jsonb) to authenticated, service_role;
