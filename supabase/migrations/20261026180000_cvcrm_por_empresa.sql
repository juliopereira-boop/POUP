-- ===========================================================================
-- CV CRM POR EMPRESA: CADA CONSTRUTORA COM A SUA CONTA DO CV
-- ===========================================================================
-- A primeira integração nativa do POUP. Não é só a Canopus que usa o CV:
-- cada construtora tem a SUA conta (url, e-mail e token próprios), e o admin
-- do POUP configura no cadastro da empresa ("Integrar CV").
--
-- O QUE MUDA EM RELAÇÃO À 20261026120000_disponibilidade_cvcrm.sql
--   * nasce `cvcrm_integracoes`: uma por empresa. O token mora no VAULT
--     (criptografado); a tabela guarda só o id do segredo. Nada disso é
--     legível pelo aplicativo: só as Edge Functions (service role) pegam a
--     credencial, por `cvcrm_credencial`.
--   * o id de uma unidade (ou de um empreendimento) do CV só vale DENTRO da
--     conta: o 63 de uma construtora não é o 63 de outra. O espelho, os
--     vínculos e os empreendimentos do CV passam a ter `integracao_id`, e a
--     chave do espelho vira (integracao_id, cv_unidade).
--   * o histórico do CVDW (a leitura leve) tem cursor por conta.
--   * a integração de um empreendimento do POUP é a da empresa DONA dele
--     (`developments.company_id`).
--
-- Os dados que já existem (os 8 empreendimentos da Canopus) ganham a
-- integração da empresa dona, PENDENTE: a credencial entra depois, pela tela
-- (ou, na Canopus, pelos secrets que já estavam nas Edge Functions).
--
-- RESERVA DE UNIDADE: só o esboço (docs/CVCRM_RESERVA.md). A coluna
-- `reserva_habilitada` nasce desligada e nada no código a usa: o CV continua
-- só LIDO.
--
-- DEPENDE DE: 20261026120000_disponibilidade_cvcrm.sql.
-- MIGRATION IDEMPOTENTE, e sem remover nada: a troca da chave do espelho é
-- feita com tabelas novas (as de antes ficam como `_antiga`, sem uso).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A INTEGRAÇÃO DE CADA EMPRESA
-- ---------------------------------------------------------------------------

create table if not exists public.cvcrm_integracoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  -- "https://<conta>.cvcrm.com.br". Nula enquanto a integração está pendente.
  -- O token só vai para o domínio do CV (as Edge Functions conferem de novo).
  url text check (url is null or url ~ '^https://[a-z0-9-]+\.cvcrm\.com\.br$'),
  email text,
  -- O token mora no Vault; aqui só o id do segredo.
  token_secret_id uuid,
  ativo boolean not null default true,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'ok', 'erro')),
  ultimo_teste_em timestamptz,
  ultimo_erro text,
  ultimo_erro_em timestamptz,
  -- A leitura leve desta conta: a última `referencia_data` do CVDW aplicada.
  cvdw_cursor text,
  ultima_leve_em timestamptz,
  -- Reserva de unidade pelo POUP: ESBOÇO (docs/CVCRM_RESERVA.md). Desligada;
  -- nada lê esta coluna ainda.
  reserva_habilitada boolean not null default false,
  configurado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cvcrm_integracoes is
  'A conta do CV CRM de cada empresa (url, e-mail; token no Vault). Escrita só pelas RPCs; só o admin vê, e o token nunca sai do banco a não ser para as Edge Functions.';

alter table public.cvcrm_integracoes enable row level security;
revoke all on public.cvcrm_integracoes from public, anon, authenticated;
grant all on public.cvcrm_integracoes to service_role;


-- ---------------------------------------------------------------------------
-- 2. AS CHAVES DO CV PASSAM A SER POR CONTA
-- ---------------------------------------------------------------------------
-- Trocar a chave de uma tabela pede remover a restrição antiga, e esta
-- migration não remove nada. Em vez disso, as três tabelas do CV são feitas
-- de novo já com a chave por conta, os dados são copiados, e as de antes
-- ficam com o sufixo `_antiga`: sem uso e sem acesso, até a limpeza (que só
-- acontece com a confirmação do dono do POUP). Roda uma vez só: se o espelho
-- já tem `integracao_id`, pula.
--
-- O que já existe (os 8 empreendimentos da Canopus) ganha a integração da
-- empresa dona, PENDENTE. Unidade do espelho que não é de empreendimento
-- vinculado (uma prévia que não virou importação) não é copiada: a próxima
-- prévia lê de novo.

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'cvcrm_unidades' and column_name = 'integracao_id') then
    return;
  end if;

  insert into public.cvcrm_integracoes (company_id)
  select distinct d.company_id
    from public.development_cvcrm_empreendimentos e
    join public.developments d on d.id = e.development_id
  on conflict (company_id) do nothing;

  create table public.development_cvcrm_empreendimentos_nova (
    id uuid primary key default gen_random_uuid(),
    integracao_id uuid not null references public.cvcrm_integracoes(id) on delete cascade,
    development_id uuid not null references public.developments(id) on delete cascade,
    cv_empreendimento integer not null check (cv_empreendimento > 0),
    cv_etapa integer check (cv_etapa is null or cv_etapa > 0),
    nome_no_cv text,
    etapa_no_cv text,
    ativo boolean not null default true,
    ultimo_leve_em timestamptz,
    ultimo_completo_em timestamptz,
    ultimo_erro text,
    ultimo_erro_em timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  insert into public.development_cvcrm_empreendimentos_nova
    (id, integracao_id, development_id, cv_empreendimento, cv_etapa, nome_no_cv, etapa_no_cv, ativo,
     ultimo_leve_em, ultimo_completo_em, ultimo_erro, ultimo_erro_em, created_at, updated_at)
  select e.id, i.id, e.development_id, e.cv_empreendimento, e.cv_etapa, e.nome_no_cv, e.etapa_no_cv, e.ativo,
         e.ultimo_leve_em, e.ultimo_completo_em, e.ultimo_erro, e.ultimo_erro_em, e.created_at, e.updated_at
    from public.development_cvcrm_empreendimentos e
    join public.developments d on d.id = e.development_id
    join public.cvcrm_integracoes i on i.company_id = d.company_id;

  create table public.cvcrm_unidades_nova (
    integracao_id uuid not null references public.cvcrm_integracoes(id) on delete cascade,
    cv_unidade integer not null check (cv_unidade > 0),
    cv_empreendimento integer not null,
    cv_etapa integer,
    cv_bloco integer,
    bloco text,
    unidade text,
    identificador text,
    situacao_chave text,
    situacao_descricao text,
    status_mudou_em timestamptz not null default now(),
    ausente_desde timestamptz,
    atualizado_em timestamptz not null default now(),
    conferido_em timestamptz,
    constraint cvcrm_unidades_por_conta_pkey primary key (integracao_id, cv_unidade)
  );
  insert into public.cvcrm_unidades_nova
    (integracao_id, cv_unidade, cv_empreendimento, cv_etapa, cv_bloco, bloco, unidade, identificador,
     situacao_chave, situacao_descricao, status_mudou_em, ausente_desde, atualizado_em, conferido_em)
  select x.integracao_id, u.cv_unidade, u.cv_empreendimento, u.cv_etapa, u.cv_bloco, u.bloco, u.unidade, u.identificador,
         u.situacao_chave, u.situacao_descricao, u.status_mudou_em, u.ausente_desde, u.atualizado_em, u.conferido_em
    from public.cvcrm_unidades u
    join lateral (
      select e.integracao_id from public.development_cvcrm_empreendimentos_nova e
       where e.cv_empreendimento = u.cv_empreendimento
       order by e.ativo desc
       limit 1) x on true;

  create table public.development_unit_cvcrm_nova (
    unit_id uuid primary key references public.development_units(id) on delete cascade,
    development_id uuid not null references public.developments(id) on delete cascade,
    integracao_id uuid not null references public.cvcrm_integracoes(id) on delete cascade,
    -- Nula = desvinculada (a linha fica, com o histórico).
    cv_unidade integer,
    identificador_no_vinculo text,
    origem text not null check (origem in ('automatico', 'manual', 'criado_do_cv')),
    vinculado_por uuid,
    vinculado_em timestamptz not null default now(),
    constraint development_unit_cvcrm_por_conta_fkey
      foreign key (integracao_id, cv_unidade) references public.cvcrm_unidades_nova (integracao_id, cv_unidade)
  );
  insert into public.development_unit_cvcrm_nova
    (unit_id, development_id, integracao_id, cv_unidade, identificador_no_vinculo, origem, vinculado_por, vinculado_em)
  select l.unit_id, l.development_id, i.id,
         case when exists (select 1 from public.cvcrm_unidades_nova n
                            where n.integracao_id = i.id and n.cv_unidade = l.cv_unidade)
              then l.cv_unidade end,
         l.identificador_no_vinculo, l.origem, l.vinculado_por, l.vinculado_em
    from public.development_unit_cvcrm l
    join public.developments d on d.id = l.development_id
    join public.cvcrm_integracoes i on i.company_id = d.company_id;

  -- A troca de nomes: as funções e as Edge Functions passam a ver as novas.
  alter table public.development_unit_cvcrm rename to development_unit_cvcrm_antiga;
  alter table public.cvcrm_unidades rename to cvcrm_unidades_antiga;
  alter table public.development_cvcrm_empreendimentos rename to development_cvcrm_empreendimentos_antiga;
  alter table public.development_cvcrm_empreendimentos_nova rename to development_cvcrm_empreendimentos;
  alter table public.cvcrm_unidades_nova rename to cvcrm_unidades;
  alter table public.development_unit_cvcrm_nova rename to development_unit_cvcrm;

  -- As de antes: sem acesso, só esperando a limpeza.
  revoke all on public.development_unit_cvcrm_antiga, public.cvcrm_unidades_antiga,
    public.development_cvcrm_empreendimentos_antiga from public, anon, authenticated;
  comment on table public.cvcrm_unidades_antiga is
    'Antes de 20261026180000 (uma conta do CV só). Sem uso; sai na limpeza, com a confirmação do dono do POUP.';
  comment on table public.development_unit_cvcrm_antiga is
    'Antes de 20261026180000 (uma conta do CV só). Sem uso; sai na limpeza, com a confirmação do dono do POUP.';
  comment on table public.development_cvcrm_empreendimentos_antiga is
    'Antes de 20261026180000 (uma conta do CV só). Sem uso; sai na limpeza, com a confirmação do dono do POUP.';
end $$;

comment on table public.development_cvcrm_empreendimentos is
  'Empreendimento (e etapa) do CV CRM de onde vem a disponibilidade de um empreendimento do POUP, na conta do CV da empresa dona. Escrita só pelas RPCs do admin.';
comment on table public.cvcrm_unidades is
  'Espelho das unidades do CV CRM (mapa de disponibilidade). Chave = (conta, idunidade do CV). Escrita só pelas RPCs de leitura (service role). Sem dado de cliente.';

create unique index if not exists development_cvcrm_empreendimentos_unico_por_conta
  on public.development_cvcrm_empreendimentos (integracao_id, cv_empreendimento, (coalesce(cv_etapa, 0)));
create index if not exists development_cvcrm_empreendimentos_por_empreendimento_poup
  on public.development_cvcrm_empreendimentos (development_id);
create index if not exists cvcrm_unidades_por_conta_e_empreendimento
  on public.cvcrm_unidades (integracao_id, cv_empreendimento, cv_etapa);
create unique index if not exists development_unit_cvcrm_unidade_unica_por_conta
  on public.development_unit_cvcrm (integracao_id, cv_unidade) where cv_unidade is not null;
create index if not exists development_unit_cvcrm_por_empreendimento_poup
  on public.development_unit_cvcrm (development_id);

-- RLS das tabelas novas: as mesmas regras de antes.
alter table public.development_cvcrm_empreendimentos enable row level security;
alter table public.cvcrm_unidades enable row level security;
alter table public.development_unit_cvcrm enable row level security;

revoke all on public.development_cvcrm_empreendimentos, public.cvcrm_unidades, public.development_unit_cvcrm
  from public, anon, authenticated;
grant all on public.development_cvcrm_empreendimentos, public.cvcrm_unidades, public.development_unit_cvcrm
  to service_role;
grant select on public.development_cvcrm_empreendimentos, public.cvcrm_unidades, public.development_unit_cvcrm
  to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'development_cvcrm_empreendimentos' and policyname = 'cvcrm_empreendimentos_select') then
    create policy "cvcrm_empreendimentos_select" on public.development_cvcrm_empreendimentos
      for select to authenticated using (public.pode_ler_empreendimento(development_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'cvcrm_unidades' and policyname = 'cvcrm_unidades_select_admin') then
    create policy "cvcrm_unidades_select_admin" on public.cvcrm_unidades
      for select to authenticated using (public.is_app_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'development_unit_cvcrm' and policyname = 'unit_cvcrm_select_admin') then
    create policy "unit_cvcrm_select_admin" on public.development_unit_cvcrm
      for select to authenticated using (public.is_app_admin());
  end if;
end $$;

-- O gatilho do espelho, na tabela nova (a função dele está na seção 4).
create or replace trigger cvcrm_unidades_mudaram
  after update on public.cvcrm_unidades
  referencing old table as antigos new table as novos
  for each statement execute function public.cvcrm_trg_unidades_mudaram();


-- ---------------------------------------------------------------------------
-- 3. A INTEGRAÇÃO: QUEM GRAVA, QUEM LÊ
-- ---------------------------------------------------------------------------

-- A integração da empresa dona do empreendimento (ativa ou não).
create or replace function public.cvcrm_integracao_do_empreendimento(p_development uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select i.id
    from public.developments d
    join public.cvcrm_integracoes i on i.company_id = d.company_id
   where d.id = p_development;
$$;

revoke all on function public.cvcrm_integracao_do_empreendimento(uuid) from public, anon, authenticated;
grant execute on function public.cvcrm_integracao_do_empreendimento(uuid) to service_role;

-- O que a tela da empresa mostra. O token NUNCA: só se existe.
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
             'empreendimentos', (select count(*) from public.development_cvcrm_empreendimentos e
                                  where e.integracao_id = i.id and e.ativo))
      from public.cvcrm_integracoes i
     where i.company_id = p_company);
end;
$$;

revoke all on function public.cvcrm_integracao(uuid) from public, anon;
grant execute on function public.cvcrm_integracao(uuid) to authenticated, service_role;

-- Grava a integração depois que a Edge Function testou a credencial no CV.
-- Só service role: o token passa por aqui e vai direto para o Vault.
-- `p_token` nulo = mantém o token que já está salvo (troca só url/e-mail).
create or replace function public.cvcrm_salvar_integracao(
  p_company uuid, p_url text, p_email text, p_token text, p_por uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text := lower(btrim(coalesce(p_url, '')));
  v_email text := btrim(coalesce(p_email, ''));
  v_nome text := 'cvcrm_token_' || p_company::text;
  v_secret uuid;
  v_id uuid;
begin
  if p_company is null or not exists (select 1 from public.companies where id = p_company) then
    raise exception 'empresa_invalida' using errcode = '22023';
  end if;
  if v_url !~ '^https://[a-z0-9-]+\.cvcrm\.com\.br$' then
    raise exception 'url_invalida' using errcode = '22023';
  end if;
  if v_email = '' or length(v_email) > 200 then
    raise exception 'email_invalido' using errcode = '22023';
  end if;

  select token_secret_id into v_secret from public.cvcrm_integracoes where company_id = p_company;
  if p_token is not null and btrim(p_token) <> '' then
    if v_secret is null then
      select s.id into v_secret from vault.secrets s where s.name = v_nome;
    end if;
    if v_secret is null then
      v_secret := vault.create_secret(btrim(p_token), v_nome, 'Token do CV CRM da empresa ' || p_company::text);
    else
      perform vault.update_secret(v_secret, btrim(p_token));
    end if;
  elsif v_secret is null then
    raise exception 'token_obrigatorio' using errcode = '22023';
  end if;

  insert into public.cvcrm_integracoes as i
    (company_id, url, email, token_secret_id, ativo, situacao, ultimo_teste_em, ultimo_erro, ultimo_erro_em, configurado_por)
  values (p_company, v_url, v_email, v_secret, true, 'ok', now(), null, null, p_por)
  on conflict (company_id) do update
     set url = excluded.url,
         email = excluded.email,
         token_secret_id = excluded.token_secret_id,
         ativo = true,
         situacao = 'ok',
         ultimo_teste_em = now(),
         ultimo_erro = null,
         ultimo_erro_em = null,
         configurado_por = excluded.configurado_por,
         updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.cvcrm_salvar_integracao(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.cvcrm_salvar_integracao(uuid, text, text, text, uuid) to service_role;

-- A credencial, para as Edge Functions. Só service role, só integração ativa.
create or replace function public.cvcrm_credencial(p_integracao uuid)
returns table (url text, email text, token text)
language sql
stable
security definer
set search_path = public
as $$
  select i.url, i.email, s.decrypted_secret
    from public.cvcrm_integracoes i
    join vault.decrypted_secrets s on s.id = i.token_secret_id
   where i.id = p_integracao and i.ativo and i.url is not null and i.situacao <> 'pendente'
     and coalesce(s.decrypted_secret, '') <> '';
$$;

revoke all on function public.cvcrm_credencial(uuid) from public, anon, authenticated;
grant execute on function public.cvcrm_credencial(uuid) to service_role;

-- O resultado de um teste ou de uma leitura (a conta inteira).
create or replace function public.cvcrm_registrar_teste(p_integracao uuid, p_ok boolean, p_erro text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.cvcrm_integracoes
     set situacao = case when p_ok then 'ok' else 'erro' end,
         ultimo_teste_em = now(),
         ultimo_erro = case when p_ok then null else left(p_erro, 1000) end,
         ultimo_erro_em = case when p_ok then null else now() end,
         updated_at = now()
   where id = p_integracao and situacao <> 'pendente';
$$;

revoke all on function public.cvcrm_registrar_teste(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.cvcrm_registrar_teste(uuid, boolean, text) to service_role;

-- O admin desliga a integração: o token é apagado do Vault (sobrescrito), a
-- integração fica pendente e os empreendimentos dela deixam de ter cor. Os
-- vínculos ficam: integrar de novo devolve as cores.
create or replace function public.cvcrm_remover_integracao(p_company uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_secret uuid;
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select token_secret_id into v_secret from public.cvcrm_integracoes where company_id = p_company;
  if v_secret is not null then
    perform vault.update_secret(v_secret, '');
  end if;
  update public.cvcrm_integracoes
     set ativo = false, situacao = 'pendente', ultimo_erro = null, ultimo_erro_em = null,
         configurado_por = auth.uid(), updated_at = now()
   where company_id = p_company;
end;
$$;

revoke all on function public.cvcrm_remover_integracao(uuid) from public, anon;
grant execute on function public.cvcrm_remover_integracao(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. O RECÁLCULO E OS GATILHOS, PELA CHAVE NOVA
-- ---------------------------------------------------------------------------

create or replace function public.disponibilidade_recalcular(p_units uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mudaram integer;
begin
  if p_units is null or cardinality(p_units) = 0 then
    return 0;
  end if;

  with alvo as (
    select du.id as unit_id,
           du.development_id,
           case
             when v.cv_unidade is null or u.cv_unidade is null then 'sem_vinculo'
             -- Renomeada no CV: suspensa até o admin confirmar.
             when not public.disponibilidade_mesmo_identificador(v.identificador_no_vinculo, u.identificador) then 'sem_vinculo'
             when u.ausente_desde is not null then 'indisponivel'
             else coalesce(s.situacao, 'indisponivel')
           end as situacao,
           case
             when v.cv_unidade is null or u.cv_unidade is null then null
             when not public.disponibilidade_mesmo_identificador(v.identificador_no_vinculo, u.identificador) then null
             else coalesce(nullif(s.descricao, ''), u.situacao_descricao)
           end as descricao
      from public.development_units du
      left join public.development_unit_cvcrm v on v.unit_id = du.id
      left join public.cvcrm_unidades u on u.integracao_id = v.integracao_id and u.cv_unidade = v.cv_unidade
      left join public.cvcrm_situacao s on s.chave = u.situacao_chave
     where du.id = any (p_units)
  )
  insert into public.development_unit_disponibilidade as d (unit_id, development_id, situacao, status_descricao, mudou_em)
  select a.unit_id, a.development_id, a.situacao, a.descricao, now()
    from alvo a
   where a.situacao <> 'sem_vinculo'
      or exists (select 1 from public.development_unit_disponibilidade x where x.unit_id = a.unit_id)
  on conflict (unit_id) do update
     set situacao = excluded.situacao,
         status_descricao = excluded.status_descricao,
         development_id = excluded.development_id,
         mudou_em = now()
   where d.situacao is distinct from excluded.situacao
      or d.status_descricao is distinct from excluded.status_descricao;

  get diagnostics v_mudaram = row_count;
  return v_mudaram;
end;
$$;

revoke all on function public.disponibilidade_recalcular(uuid[]) from public, anon, authenticated;
grant execute on function public.disponibilidade_recalcular(uuid[]) to service_role;

create or replace function public.cvcrm_trg_unidades_mudaram()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v uuid[];
begin
  select array_agg(l.unit_id) into v
    from novos n
    join antigos o on o.integracao_id = n.integracao_id and o.cv_unidade = n.cv_unidade
    join public.development_unit_cvcrm l on l.integracao_id = n.integracao_id and l.cv_unidade = n.cv_unidade
   where n.situacao_chave is distinct from o.situacao_chave
      or n.situacao_descricao is distinct from o.situacao_descricao
      or n.ausente_desde is distinct from o.ausente_desde
      or n.identificador is distinct from o.identificador;
  perform public.disponibilidade_recalcular(v);
  return null;
end;
$$;

create or replace function public.cvcrm_trg_situacao_mudou()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.situacao is distinct from old.situacao or new.descricao is distinct from old.descricao then
    perform public.disponibilidade_recalcular(array(
      select l.unit_id
        from public.development_unit_cvcrm l
        join public.cvcrm_unidades u on u.integracao_id = l.integracao_id and u.cv_unidade = l.cv_unidade
       where u.situacao_chave = new.chave
    ));
  end if;
  return null;
end;
$$;

revoke all on function public.cvcrm_trg_unidades_mudaram(), public.cvcrm_trg_situacao_mudou()
  from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. AS LEITURAS ENTRAM PELA CONTA
-- ---------------------------------------------------------------------------

-- As versões de uma conta só (sem a integração) ficam, mas recusam: quem
-- ainda chamar por elas recebe erro, e nada é gravado sem a conta.
create or replace function public.cvcrm_aplicar_leitura(
  p_cv_empreendimento integer, p_cv_etapa integer, p_modo text, p_unidades jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
begin
  raise exception 'obsoleta: use cvcrm_aplicar_leitura(p_integracao, ...)' using errcode = '22023';
end;
$$;

create or replace function public.cvcrm_aplicar_mudancas(p_mudancas jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
begin
  raise exception 'obsoleta: use cvcrm_aplicar_mudancas(p_integracao, ...)' using errcode = '22023';
end;
$$;

create or replace function public.cvcrm_registrar_erro(p_cv_empreendimento integer, p_cv_etapa integer, p_erro text)
returns void
language plpgsql
set search_path = public
as $$
begin
  raise exception 'obsoleta: use cvcrm_registrar_erro(p_integracao, ...)' using errcode = '22023';
end;
$$;

revoke all on function public.cvcrm_aplicar_leitura(integer, integer, text, jsonb),
  public.cvcrm_aplicar_mudancas(jsonb),
  public.cvcrm_registrar_erro(integer, integer, text)
  from public, anon, authenticated;

-- O mapa de disponibilidade de um empreendimento (ou etapa) de UMA conta.
--   'completo' — todas as unidades; quem não veio é marcado ausente.
--   'pontual'  — um bloco (o "conferir agora"); não marca ninguém ausente.
-- A trava contra a leitura quebrada continua: mais de 30% (e mais de 5)
-- sumindo de uma vez = `suspeita`, nada marcado.
create or replace function public.cvcrm_aplicar_leitura(
  p_integracao uuid,
  p_cv_empreendimento integer,
  p_cv_etapa integer,
  p_modo text,
  p_unidades jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids integer[];
  v_lidas integer;
  v_novas integer := 0;
  v_mudaram integer := 0;
  v_sumiram integer := 0;
  v_base integer := 0;
  v_suspeita boolean := false;
begin
  if p_integracao is null or not exists (select 1 from public.cvcrm_integracoes where id = p_integracao) then
    raise exception 'integracao_invalida' using errcode = '22023';
  end if;
  if p_cv_empreendimento is null or p_cv_empreendimento <= 0 or (p_cv_etapa is not null and p_cv_etapa <= 0) then
    raise exception 'empreendimento_invalido' using errcode = '22023';
  end if;
  if p_modo is null or p_modo not in ('completo', 'pontual') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if p_unidades is null or jsonb_typeof(p_unidades) <> 'array' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;

  v_ids := array(select l.cv_unidade from public.cvcrm_ler_unidades(p_unidades) l);
  v_lidas := cardinality(v_ids);

  insert into public.cvcrm_situacao (chave, descricao, situacao, revisar)
  select distinct on (l.chave) l.chave, coalesce(l.descricao, ''), 'indisponivel', true
    from public.cvcrm_ler_unidades(p_unidades) l
   where l.chave is not null and l.chave ~ '^[a-z0-9 ]{1,80}$'
  on conflict (chave) do nothing;

  insert into public.cvcrm_unidades (
    integracao_id, cv_unidade, cv_empreendimento, cv_etapa, cv_bloco, bloco, unidade, identificador,
    situacao_chave, situacao_descricao)
  select p_integracao, l.cv_unidade, p_cv_empreendimento, l.cv_etapa, l.cv_bloco, l.bloco, l.nome, l.identificador,
         l.chave, l.descricao
    from public.cvcrm_ler_unidades(p_unidades) l
  on conflict (integracao_id, cv_unidade) do nothing;
  get diagnostics v_novas = row_count;

  update public.cvcrm_unidades u
     set cv_empreendimento = p_cv_empreendimento,
         cv_etapa = l.cv_etapa,
         cv_bloco = l.cv_bloco,
         bloco = l.bloco,
         unidade = l.nome,
         identificador = l.identificador,
         situacao_chave = l.chave,
         situacao_descricao = l.descricao,
         ausente_desde = null,
         status_mudou_em = case when u.situacao_chave is distinct from l.chave then now() else u.status_mudou_em end,
         atualizado_em = now()
    from public.cvcrm_ler_unidades(p_unidades) l
   where u.integracao_id = p_integracao and u.cv_unidade = l.cv_unidade
     and (u.cv_empreendimento, u.cv_etapa, u.cv_bloco, u.bloco, u.unidade, u.identificador,
          u.situacao_chave, u.situacao_descricao, u.ausente_desde)
         is distinct from
         (p_cv_empreendimento, l.cv_etapa, l.cv_bloco, l.bloco, l.nome, l.identificador,
          l.chave, l.descricao, null::timestamptz);
  get diagnostics v_mudaram = row_count;

  if p_modo = 'pontual' then
    update public.cvcrm_unidades u set conferido_em = now()
     where u.integracao_id = p_integracao and u.cv_unidade = any (v_ids);
  else
    select count(*),
           count(*) filter (where not (u.cv_unidade = any (v_ids)))
      into v_base, v_sumiram
      from public.cvcrm_unidades u
     where u.integracao_id = p_integracao
       and u.cv_empreendimento = p_cv_empreendimento
       and (p_cv_etapa is null or u.cv_etapa = p_cv_etapa)
       and u.ausente_desde is null;

    v_suspeita := v_sumiram > 5 and v_sumiram > v_base * 0.3;

    if v_sumiram > 0 and not v_suspeita then
      update public.cvcrm_unidades u
         set ausente_desde = now(), atualizado_em = now()
       where u.integracao_id = p_integracao
         and u.cv_empreendimento = p_cv_empreendimento
         and (p_cv_etapa is null or u.cv_etapa = p_cv_etapa)
         and u.ausente_desde is null
         and not (u.cv_unidade = any (v_ids));
    end if;

    if not v_suspeita then
      update public.development_cvcrm_empreendimentos e
         set ultimo_completo_em = now(), ultimo_erro = null, ultimo_erro_em = null, updated_at = now()
       where e.integracao_id = p_integracao
         and e.cv_empreendimento = p_cv_empreendimento
         and (p_cv_etapa is null or e.cv_etapa = p_cv_etapa);
    end if;
  end if;

  return jsonb_build_object(
    'lidas', v_lidas, 'novas', v_novas, 'mudaram', v_mudaram,
    'sumiram', case when v_suspeita then 0 else v_sumiram end, 'suspeita', v_suspeita);
end;
$$;

revoke all on function public.cvcrm_aplicar_leitura(uuid, integer, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.cvcrm_aplicar_leitura(uuid, integer, integer, text, jsonb) to service_role;

-- A leitura leve de UMA conta: o histórico de situação do CVDW.
--   p_mudancas: [{ "unidade": 37405, "situacao": "Reservada" }] (a última de cada unidade)
--   p_cursor:   a maior `referencia_data` lida (nula = mantém a de antes)
create or replace function public.cvcrm_aplicar_mudancas(p_integracao uuid, p_mudancas jsonb, p_cursor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lidas integer;
  v_mudaram integer := 0;
begin
  if p_integracao is null or not exists (select 1 from public.cvcrm_integracoes where id = p_integracao) then
    raise exception 'integracao_invalida' using errcode = '22023';
  end if;
  if p_mudancas is null or jsonb_typeof(p_mudancas) <> 'array' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;
  v_lidas := jsonb_array_length(p_mudancas);

  insert into public.cvcrm_situacao (chave, descricao, situacao, revisar)
  select distinct on (k.chave) k.chave, coalesce(k.descricao, ''), 'indisponivel', true
    from (select public.cvcrm_chave_da_situacao(x.situacao) as chave, public.cvcrm_descricao(x.situacao) as descricao
            from jsonb_to_recordset(p_mudancas) as x(unidade integer, situacao text)) k
   where k.chave is not null and k.chave ~ '^[a-z0-9 ]{1,80}$'
  on conflict (chave) do nothing;

  update public.cvcrm_unidades u
     set situacao_chave = l.chave,
         situacao_descricao = l.descricao,
         status_mudou_em = now(),
         atualizado_em = now()
    from (select distinct on (x.unidade) x.unidade,
                 public.cvcrm_chave_da_situacao(x.situacao) as chave,
                 public.cvcrm_descricao(x.situacao) as descricao
            from jsonb_to_recordset(p_mudancas) as x(unidade integer, situacao text)
           where x.unidade is not null and public.cvcrm_chave_da_situacao(x.situacao) is not null) l
   where u.integracao_id = p_integracao and u.cv_unidade = l.unidade
     and (u.situacao_chave, u.situacao_descricao) is distinct from (l.chave, l.descricao);
  get diagnostics v_mudaram = row_count;

  -- A leve cobre a conta inteira: todos os empreendimentos dela ficam frescos.
  update public.development_cvcrm_empreendimentos
     set ultimo_leve_em = now(), updated_at = now()
   where integracao_id = p_integracao and ativo;
  update public.cvcrm_integracoes
     set cvdw_cursor = coalesce(p_cursor, cvdw_cursor), ultima_leve_em = now(), updated_at = now()
   where id = p_integracao;

  return jsonb_build_object('lidas', v_lidas, 'mudaram', v_mudaram);
end;
$$;

revoke all on function public.cvcrm_aplicar_mudancas(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.cvcrm_aplicar_mudancas(uuid, jsonb, text) to service_role;

-- Erro numa leitura: de um empreendimento (p_cv_empreendimento preenchido)
-- ou da conta inteira (nulo — credencial recusada, CV fora do ar).
create or replace function public.cvcrm_registrar_erro(p_integracao uuid, p_cv_empreendimento integer, p_cv_etapa integer, p_erro text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cv_empreendimento is null then
    update public.cvcrm_integracoes
       set situacao = 'erro', ultimo_erro = left(p_erro, 1000), ultimo_erro_em = now(), updated_at = now()
     where id = p_integracao and situacao <> 'pendente';
  else
    update public.development_cvcrm_empreendimentos
       set ultimo_erro = left(p_erro, 1000), ultimo_erro_em = now(), updated_at = now()
     where integracao_id = p_integracao
       and cv_empreendimento = p_cv_empreendimento and cv_etapa is not distinct from p_cv_etapa;
  end if;
end;
$$;

revoke all on function public.cvcrm_registrar_erro(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.cvcrm_registrar_erro(uuid, integer, integer, text) to service_role;


-- ---------------------------------------------------------------------------
-- 6. O ADMIN: EMPREENDIMENTO DO CV, CONFERÊNCIA E VÍNCULOS, PELA CONTA
-- ---------------------------------------------------------------------------

create or replace function public.cvcrm_salvar_empreendimento(
  p_development uuid,
  p_cv_empreendimento integer,
  p_cv_etapa integer default null,
  p_nome text default null,
  p_etapa_nome text default null,
  p_ativo boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_integracao uuid;
  v_id uuid;
  v_outro uuid;
begin
  perform public.disponibilidade_exigir_admin(p_development);
  if p_cv_empreendimento is null or p_cv_empreendimento <= 0 or (p_cv_etapa is not null and p_cv_etapa <= 0) then
    raise exception 'empreendimento_invalido' using errcode = '22023';
  end if;
  -- A conta é a da empresa dona do empreendimento, e precisa estar ligada.
  select i.id into v_integracao
    from public.developments d
    join public.cvcrm_integracoes i on i.company_id = d.company_id
   where d.id = p_development and i.ativo and i.situacao <> 'pendente';
  if v_integracao is null then
    raise exception 'sem_integracao' using errcode = '22023';
  end if;

  select e.development_id into v_outro
    from public.development_cvcrm_empreendimentos e
   where e.integracao_id = v_integracao
     and e.cv_empreendimento = p_cv_empreendimento
     and e.ativo
     and e.development_id <> p_development
     and (e.cv_etapa is null or p_cv_etapa is null or e.cv_etapa = p_cv_etapa)
   limit 1;
  if v_outro is not null then
    raise exception 'empreendimento_de_outro' using errcode = '23505';
  end if;

  insert into public.development_cvcrm_empreendimentos as e
    (integracao_id, development_id, cv_empreendimento, cv_etapa, nome_no_cv, etapa_no_cv, ativo)
  values (v_integracao, p_development, p_cv_empreendimento, p_cv_etapa, nullif(btrim(p_nome), ''),
          nullif(btrim(p_etapa_nome), ''), coalesce(p_ativo, true))
  on conflict (integracao_id, cv_empreendimento, (coalesce(cv_etapa, 0))) do update
     set development_id = excluded.development_id,
         nome_no_cv = coalesce(excluded.nome_no_cv, e.nome_no_cv),
         etapa_no_cv = coalesce(excluded.etapa_no_cv, e.etapa_no_cv),
         ativo = excluded.ativo,
         updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cvcrm_remover_empreendimento(
  p_development uuid, p_cv_empreendimento integer, p_cv_etapa integer default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_integracao uuid;
  v_units uuid[];
begin
  perform public.disponibilidade_exigir_admin(p_development);
  v_integracao := public.cvcrm_integracao_do_empreendimento(p_development);
  select array_agg(l.unit_id) into v_units
    from public.development_unit_cvcrm l
    join public.cvcrm_unidades u on u.integracao_id = l.integracao_id and u.cv_unidade = l.cv_unidade
   where l.development_id = p_development
     and l.integracao_id = v_integracao
     and u.cv_empreendimento = p_cv_empreendimento
     and (p_cv_etapa is null or u.cv_etapa = p_cv_etapa);

  update public.development_unit_cvcrm
     set cv_unidade = null, vinculado_por = auth.uid(), vinculado_em = now()
   where unit_id = any (coalesce(v_units, '{}'));
  update public.development_cvcrm_empreendimentos
     set ativo = false, updated_at = now()
   where development_id = p_development
     and integracao_id = v_integracao
     and cv_empreendimento = p_cv_empreendimento
     and cv_etapa is not distinct from p_cv_etapa;
  perform public.disponibilidade_recalcular(v_units);
  return coalesce(cardinality(v_units), 0);
end;
$$;

create or replace function public.cvcrm_conferencia(p_development uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.disponibilidade_exigir_admin(p_development);
  return jsonb_build_object(
    'empreendimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cvEmpreendimento', e.cv_empreendimento, 'cvEtapa', e.cv_etapa,
               'nomeNoCv', e.nome_no_cv, 'etapaNoCv', e.etapa_no_cv, 'ativo', e.ativo,
               'ultimoLeveEm', e.ultimo_leve_em, 'ultimoCompletoEm', e.ultimo_completo_em,
               'ultimoErro', e.ultimo_erro, 'ultimoErroEm', e.ultimo_erro_em)
               order by e.cv_empreendimento, e.cv_etapa)
        from public.development_cvcrm_empreendimentos e
       where e.development_id = p_development and e.ativo), '[]'::jsonb),
    'poup', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', du.id, 'bloco', b.nome, 'codigo', du.codigo, 'pavimento', du.pavimento)
               order by b.ordem, du.pavimento, du.ordem)
        from public.development_units du
        join public.development_blocks b on b.id = du.block_id
       where du.development_id = p_development), '[]'::jsonb),
    'cv', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cvUnidade', u.cv_unidade, 'empreendimento', u.cv_empreendimento, 'etapa', u.cv_etapa,
               'bloco', u.bloco, 'nome', u.unidade, 'identificador', u.identificador,
               'situacao', u.situacao_descricao, 'ausente', u.ausente_desde is not null)
               order by u.cv_empreendimento, u.cv_etapa, u.cv_bloco, u.cv_unidade)
        from public.cvcrm_unidades u
       where exists (
               select 1 from public.development_cvcrm_empreendimentos e
                where e.development_id = p_development and e.ativo
                  and e.integracao_id = u.integracao_id
                  and e.cv_empreendimento = u.cv_empreendimento
                  and (e.cv_etapa is null or e.cv_etapa = u.cv_etapa))), '[]'::jsonb),
    'vinculos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'unitId', l.unit_id,
               'cvUnidade', l.cv_unidade,
               'identificadorNoVinculo', l.identificador_no_vinculo,
               'identificadorAtual', u.identificador,
               'origem', l.origem, 'vinculadoEm', l.vinculado_em))
        from public.development_unit_cvcrm l
        join public.cvcrm_unidades u on u.integracao_id = l.integracao_id and u.cv_unidade = l.cv_unidade
       where l.development_id = p_development), '[]'::jsonb)
  );
end;
$$;

create or replace function public.cvcrm_salvar_vinculos(p_development uuid, p_vinculos jsonb, p_remover uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_integracao uuid;
  v_qtd integer;
  v_validos integer;
  v_gravados integer := 0;
  v_removidos integer := 0;
  v_novos uuid[];
  v_afetadas uuid[];
begin
  perform public.disponibilidade_exigir_admin(p_development);
  if p_vinculos is null or jsonb_typeof(p_vinculos) <> 'array' or jsonb_array_length(p_vinculos) > 5000 then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;
  v_integracao := public.cvcrm_integracao_do_empreendimento(p_development);

  begin
    v_novos := array(select v.unit_id from public.cvcrm_ler_vinculos(p_vinculos) v);
  exception when invalid_text_representation or datatype_mismatch then
    raise exception 'formato_invalido' using errcode = '22023';
  end;
  v_qtd := cardinality(v_novos);
  if v_qtd > 0 and v_integracao is null then
    raise exception 'sem_integracao' using errcode = '22023';
  end if;

  select count(*) into v_validos
    from public.cvcrm_ler_vinculos(p_vinculos) v
    join public.development_units du on du.id = v.unit_id and du.development_id = p_development
    join public.cvcrm_unidades u on u.integracao_id = v_integracao and u.cv_unidade = v.cv_unidade
   where v.origem in ('automatico', 'manual', 'criado_do_cv')
     and exists (
           select 1 from public.development_cvcrm_empreendimentos e
            where e.development_id = p_development and e.ativo
              and e.integracao_id = v_integracao
              and e.cv_empreendimento = u.cv_empreendimento
              and (e.cv_etapa is null or e.cv_etapa = u.cv_etapa));
  if v_validos <> v_qtd then
    raise exception 'vinculo_invalido' using errcode = '22023';
  end if;
  if (select count(distinct v.unit_id) from public.cvcrm_ler_vinculos(p_vinculos) v) <> v_qtd
     or (select count(distinct v.cv_unidade) from public.cvcrm_ler_vinculos(p_vinculos) v) <> v_qtd then
    raise exception 'vinculo_repetido' using errcode = '22023';
  end if;

  v_afetadas := array(
    select distinct x from unnest(v_novos || coalesce(p_remover, '{}'::uuid[])) as x where x is not null);

  update public.development_unit_cvcrm
     set cv_unidade = null, vinculado_por = auth.uid(), vinculado_em = now()
   where development_id = p_development and cv_unidade is not null
     and unit_id = any (coalesce(p_remover, '{}'::uuid[]))
     and not (unit_id = any (v_novos));
  get diagnostics v_removidos = row_count;
  update public.development_unit_cvcrm
     set cv_unidade = null
   where development_id = p_development and cv_unidade is not null and unit_id = any (v_novos);

  begin
    insert into public.development_unit_cvcrm as l
      (unit_id, development_id, integracao_id, cv_unidade, identificador_no_vinculo, origem, vinculado_por, vinculado_em)
    select v.unit_id, p_development, v_integracao, v.cv_unidade, coalesce(u.identificador, ''), v.origem, auth.uid(), now()
      from public.cvcrm_ler_vinculos(p_vinculos) v
      join public.cvcrm_unidades u on u.integracao_id = v_integracao and u.cv_unidade = v.cv_unidade
    on conflict (unit_id) do update
       set development_id = excluded.development_id,
           integracao_id = excluded.integracao_id,
           cv_unidade = excluded.cv_unidade,
           identificador_no_vinculo = excluded.identificador_no_vinculo,
           origem = excluded.origem,
           vinculado_por = excluded.vinculado_por,
           vinculado_em = now();
    get diagnostics v_gravados = row_count;
  exception when unique_violation then
    raise exception 'unidade_cv_ja_vinculada' using errcode = '23505';
  end;

  perform public.disponibilidade_recalcular(v_afetadas);
  return jsonb_build_object('gravados', v_gravados, 'removidos', v_removidos);
end;
$$;

revoke all on function public.cvcrm_salvar_empreendimento(uuid, integer, integer, text, text, boolean),
  public.cvcrm_remover_empreendimento(uuid, integer, integer),
  public.cvcrm_conferencia(uuid),
  public.cvcrm_salvar_vinculos(uuid, jsonb, uuid[])
  from public, anon;
grant execute on function public.cvcrm_salvar_empreendimento(uuid, integer, integer, text, text, boolean),
  public.cvcrm_remover_empreendimento(uuid, integer, integer),
  public.cvcrm_conferencia(uuid),
  public.cvcrm_salvar_vinculos(uuid, jsonb, uuid[])
  to authenticated, service_role;

-- O painel: as contas do CV (por empresa), os empreendimentos vinculados, as
-- leituras e as situações para classificar.
create or replace function public.cvcrm_painel()
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
  return jsonb_build_object(
    'integracoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'companyId', i.company_id, 'empresa', c.name, 'url', i.url, 'email', i.email,
               'temToken', i.token_secret_id is not null and i.situacao <> 'pendente',
               'ativo', i.ativo, 'situacao', i.situacao,
               'ultimoTesteEm', i.ultimo_teste_em, 'ultimoErro', i.ultimo_erro, 'ultimoErroEm', i.ultimo_erro_em,
               'ultimaLeveEm', i.ultima_leve_em, 'reservaHabilitada', i.reserva_habilitada,
               'empreendimentos', (select count(*) from public.development_cvcrm_empreendimentos e
                                    where e.integracao_id = i.id and e.ativo))
               order by c.name)
        from public.cvcrm_integracoes i
        join public.companies c on c.id = i.company_id), '[]'::jsonb),
    'empreendimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cvEmpreendimento', e.cv_empreendimento, 'cvEtapa', e.cv_etapa,
               'nomeNoCv', e.nome_no_cv, 'etapaNoCv', e.etapa_no_cv, 'ativo', e.ativo,
               'companyId', i.company_id,
               'developmentId', e.development_id, 'empreendimento', d.name,
               'ultimoLeveEm', e.ultimo_leve_em, 'ultimoCompletoEm', e.ultimo_completo_em,
               'ultimoErro', e.ultimo_erro, 'ultimoErroEm', e.ultimo_erro_em,
               'vinculadas', (
                 select count(*) from public.development_unit_cvcrm l
                   join public.cvcrm_unidades u on u.integracao_id = l.integracao_id and u.cv_unidade = l.cv_unidade
                  where l.development_id = e.development_id
                    and l.integracao_id = e.integracao_id
                    and u.cv_empreendimento = e.cv_empreendimento
                    and (e.cv_etapa is null or u.cv_etapa = e.cv_etapa)),
               'noCv', (
                 select count(*) from public.cvcrm_unidades u
                  where u.integracao_id = e.integracao_id
                    and u.cv_empreendimento = e.cv_empreendimento
                    and (e.cv_etapa is null or u.cv_etapa = e.cv_etapa)
                    and u.ausente_desde is null))
               order by d.name)
        from public.development_cvcrm_empreendimentos e
        join public.cvcrm_integracoes i on i.id = e.integracao_id
        join public.developments d on d.id = e.development_id
       where e.ativo), '[]'::jsonb),
    'situacoesRevisar', coalesce((
      select jsonb_agg(jsonb_build_object('chave', s.chave, 'descricao', s.descricao, 'situacao', s.situacao)
               order by s.chave)
        from public.cvcrm_situacao s where s.revisar), '[]'::jsonb),
    'situacoes', coalesce((
      select jsonb_agg(jsonb_build_object('chave', s.chave, 'descricao', s.descricao,
                                          'situacao', s.situacao, 'revisar', s.revisar)
               order by s.chave)
        from public.cvcrm_situacao s), '[]'::jsonb),
    'leituras', coalesce((
      select jsonb_object_agg(x.modo, jsonb_build_object(
               'iniciadoEm', x.iniciado_em, 'terminadoEm', x.terminado_em, 'ok', x.ok,
               'lidas', x.lidas, 'mudaram', x.mudaram, 'erro', x.erro))
        from public.cvcrm_sync_estado x), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.cvcrm_painel() from public, anon;
grant execute on function public.cvcrm_painel() to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. O CORRETOR: SÓ PINTA COM A CONTA LIGADA
-- ---------------------------------------------------------------------------

create or replace function public.disponibilidade_do_empreendimento(p_development uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ativa boolean;
begin
  if p_development is null or not public.pode_ler_empreendimento(p_development) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_ativa := exists (
    select 1 from public.development_cvcrm_empreendimentos e
      join public.cvcrm_integracoes i on i.id = e.integracao_id
     where e.development_id = p_development and e.ativo and i.ativo and i.situacao <> 'pendente');
  return jsonb_build_object(
    'ativa', v_ativa,
    'atualizadoEm', (
      select min(greatest(e.ultimo_leve_em, e.ultimo_completo_em))
        from public.development_cvcrm_empreendimentos e
       where e.development_id = p_development and e.ativo),
    'unidades', case when not v_ativa then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'unitId', d.unit_id, 'situacao', d.situacao,
               'statusDescricao', d.status_descricao, 'mudouEm', d.mudou_em))
        from public.development_unit_disponibilidade d
       where d.development_id = p_development and d.situacao <> 'sem_vinculo'), '[]'::jsonb) end
  );
end;
$$;

revoke all on function public.disponibilidade_do_empreendimento(uuid) from public, anon;
grant execute on function public.disponibilidade_do_empreendimento(uuid) to authenticated, service_role;


-- ===========================================================================
-- CONFERÊNCIA
-- ===========================================================================
--   select c.name, i.url, i.situacao, i.ativo, i.ultima_leve_em, i.ultimo_erro, i.cvdw_cursor
--     from public.cvcrm_integracoes i join public.companies c on c.id = i.company_id;
--   select i.company_id, count(*) from public.cvcrm_unidades u
--     join public.cvcrm_integracoes i on i.id = u.integracao_id group by 1;
-- ===========================================================================
