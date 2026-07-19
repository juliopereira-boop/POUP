-- =============================================================================
-- POUP — Planos (Start/Pro) + Armazenamento com quota
--
-- Rode DEPOIS do 0001_init.sql. (SQL Editor > cole > Run)
--
-- Estratégia de custo: uploads dos corretores vão para o Supabase STORAGE
-- (objeto, barato ~US$0,021/GB), NUNCA para dentro do Postgres (caro). O banco
-- guarda só metadados. O limite por plano protege armazenamento e egress.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Colunas de plano na tabela subscriptions
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists plan_tier text,
  add column if not exists storage_limit_bytes bigint not null default 0;

comment on column public.subscriptions.plan_tier is 'start | pro';
comment on column public.subscriptions.storage_limit_bytes is
  'Limite de armazenamento do plano, em bytes. 0 = sem plano ativo. Gravado pelo webhook do Stripe.';

-- ---------------------------------------------------------------------------
-- 2) Bucket privado de uploads
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) RLS no storage: cada usuário só acessa a PRÓPRIA pasta (prefixo = uid).
--    Convenção de caminho dos arquivos: "<user_id>/<...>"
-- ---------------------------------------------------------------------------
drop policy if exists "uploads_select_own" on storage.objects;
create policy "uploads_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "uploads_insert_own" on storage.objects;
create policy "uploads_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "uploads_update_own" on storage.objects;
create policy "uploads_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "uploads_delete_own" on storage.objects;
create policy "uploads_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 4) Uso de armazenamento por usuário (bytes)
--    Usado pelo app (RPC) para exibir "X de Y GB".
-- ---------------------------------------------------------------------------
create or replace function public.user_storage_used(uid uuid)
returns bigint
language sql
security definer
set search_path = storage, public
stable
as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)::bigint
  from storage.objects
  where bucket_id = 'uploads'
    and (storage.foldername(name))[1] = uid::text;
$$;

grant execute on function public.user_storage_used(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Trigger de QUOTA: bloqueia upload que estoura o limite do plano.
--    Roda no banco → à prova de burla pelo client.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = storage, public
as $$
declare
  uid uuid := auth.uid();
  incoming bigint := coalesce((new.metadata->>'size')::bigint, 0);
  used bigint;
  lim bigint;
begin
  if new.bucket_id <> 'uploads' then
    return new;
  end if;

  select coalesce(storage_limit_bytes, 0) into lim
  from public.subscriptions
  where user_id = uid;

  lim := coalesce(lim, 0);

  select public.user_storage_used(uid) into used;

  if used + incoming > lim then
    raise exception
      'Limite de armazenamento do seu plano foi atingido (% de % bytes). Faça upgrade para o plano Pro.',
      used + incoming, lim
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_storage_quota on storage.objects;
create trigger enforce_storage_quota
  before insert on storage.objects
  for each row execute function public.enforce_storage_quota();
