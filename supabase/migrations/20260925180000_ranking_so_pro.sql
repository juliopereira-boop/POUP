-- VENDA REALIZADA E RANKING SÃO DO PLANO PRO — agora também no servidor.
--
-- O aplicativo já trava o botão "Registrar venda realizada" e a tela de Vendas
-- com `canUse('vendas')`. Só que trava de tela é sugestão: sem esta migration,
-- uma conta Start que chamasse a API direto gravaria venda — e, com o ranking
-- no ar, venda gravada vira ponto.
--
-- As regras:
--   1. REGISTRAR VENDA: Pro pago, período de teste válido (o teste é do Pro
--      completo, como o aplicativo já oferece) ou admin. Quem já tem vendas e
--      mudou para o Start continua lendo, editando e apagando as suas; só não
--      registra venda nova.
--   2. PARTICIPAR DO RANKING: só Pro PAGO. O teste fica de fora de propósito:
--      conta de teste é grátis, e ranking aberto a conta grátis é convite a
--      criar conta para inventar venda. Qualquer um continua VENDO o ranking.
--   3. Quem deixa de ser Pro some do ranking na hora (sem apagar nada): a
--      escolha de participar fica guardada e volta a valer se ele reassinar.
--
-- Idempotente: pode rodar de novo sem efeito colateral.

-- ---------------------------------------------------------------------------
-- 1. QUEM É PRO
-- ---------------------------------------------------------------------------
-- Uso interno (funções security definer). Não é exposta: com ela, qualquer
-- conta descobriria o plano de outra.
create or replace function public.assinante_pro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null and exists (
    select 1 from public.subscriptions s
     where s.user_id = p_user and s.status = 'active' and s.plan_tier = 'pro'
  );
$$;

revoke all on function public.assinante_pro(uuid) from public, anon, authenticated;
grant execute on function public.assinante_pro(uuid) to service_role;
comment on function public.assinante_pro(uuid) is
  'Assinatura Pro paga e ativa. Teste gratuito não conta. Uso interno.';

-- Sem argumento: responde só sobre quem está logado, então pode ir para a RLS.
create or replace function public.pode_registrar_venda()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.app_admins a where a.user_id = auth.uid())
    or exists (
      select 1 from public.subscriptions s
       where s.user_id = auth.uid()
         and ((s.status = 'active' and s.plan_tier = 'pro')
              or (s.status = 'trialing' and s.current_period_end > now()))
    )
  );
$$;

revoke all on function public.pode_registrar_venda() from public, anon;
grant execute on function public.pode_registrar_venda() to authenticated, service_role;
comment on function public.pode_registrar_venda() is
  'Quem está logado pode registrar venda: Pro pago, teste válido ou admin.';


-- ---------------------------------------------------------------------------
-- 2. REGISTRAR VENDA
-- ---------------------------------------------------------------------------
-- A política única "sales_all_own" (0022) vira quatro: ler, editar e apagar
-- as próprias continua igual; INSERIR passa a exigir o plano.
drop policy if exists "sales_all_own" on public.sales;

drop policy if exists "sales_select_own" on public.sales;
create policy "sales_select_own" on public.sales
  for select using (auth.uid() = user_id);

drop policy if exists "sales_insert_pro" on public.sales;
create policy "sales_insert_pro" on public.sales
  for insert with check (auth.uid() = user_id and public.pode_registrar_venda());

drop policy if exists "sales_update_own" on public.sales;
create policy "sales_update_own" on public.sales
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sales_delete_own" on public.sales;
create policy "sales_delete_own" on public.sales
  for delete using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 3. ENTRAR NO RANKING
-- ---------------------------------------------------------------------------
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
    if not public.assinante_pro(auth.uid()) then
      raise exception 'plano_pro' using errcode = '42501';
    end if;
    if not public.cpf_valido(p.cpf) or coalesce(btrim(p.creci), '') = '' or coalesce(btrim(p.cidade), '') = ''
       or p.uf is null or coalesce(btrim(p.full_name), '') = '' then
      raise exception 'perfil_incompleto' using errcode = '22023';
    end if;
    update public.profiles
       set ranking_participa = true, ranking_desde = coalesce(ranking_desde, now()), updated_at = now()
     where id = auth.uid();
  else
    -- Sair é sempre permitido, com ou sem plano.
    update public.profiles set ranking_participa = false, updated_at = now() where id = auth.uid();
  end if;
end;
$$;

revoke all on function public.participar_do_ranking(boolean) from public, anon;
grant execute on function public.participar_do_ranking(boolean) to authenticated, service_role;


-- O mesmo para quem tentar ligar a participação editando o perfil direto. O
-- plano só é conferido quando a participação LIGA: um Pro que virou Start e
-- edita o telefone não perde a escolha (ele só não aparece enquanto não for
-- Pro — ver o ranking abaixo). Security definer para poder consultar o plano;
-- só mexe na linha que já está sendo gravada.
create or replace function public.ranking_confere_participacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ranking_participa and (
       not public.cpf_valido(new.cpf) or coalesce(btrim(new.creci), '') = ''
       or coalesce(btrim(new.cidade), '') = '' or new.uf is null or coalesce(btrim(new.full_name), '') = ''
     ) then
    new.ranking_participa := false;
  end if;
  if new.ranking_participa
     and (tg_op = 'INSERT' or not coalesce(old.ranking_participa, false))
     and not public.assinante_pro(new.id) then
    new.ranking_participa := false;
  end if;
  if new.ranking_participa and new.ranking_desde is null then
    new.ranking_desde := now();
  end if;
  return new;
end;
$$;

revoke all on function public.ranking_confere_participacao() from public, anon, authenticated;

drop trigger if exists profiles_ranking_confere on public.profiles;
create trigger profiles_ranking_confere
  before insert or update on public.profiles
  for each row execute function public.ranking_confere_participacao();


-- ---------------------------------------------------------------------------
-- 4. O RANKING: SÓ PRO PAGO APARECE
-- ---------------------------------------------------------------------------
-- Igual à versão de 20260925150000, com uma condição a mais em
-- `participantes`. Quem pergunta sem ser Pro vê o ranking normalmente — só
-- não aparece nele.
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
       and exists (select 1 from public.subscriptions sb
                    where sb.user_id = p.id and sb.status = 'active' and sb.plan_tier = 'pro')
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
