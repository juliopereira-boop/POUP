alter table public.subscriptions
  alter column storage_limit_bytes set default (5::bigint * 1024 * 1024 * 1024);

update public.subscriptions
set storage_limit_bytes = case
  when plan_tier = 'pro' then 25::bigint * 1024 * 1024 * 1024
  else 5::bigint * 1024 * 1024 * 1024
end
where coalesce(storage_limit_bytes, 0) <= 0;

create or replace function public.enforce_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = storage, public
as $$
declare
  uid uuid := auth.uid();
  incoming bigint := coalesce((new.metadata->>'size')::bigint, 0);
  fallback bigint := 5::bigint * 1024 * 1024 * 1024;
  used bigint;
  lim bigint;
begin
  if new.bucket_id <> 'uploads' then
    return new;
  end if;

  select coalesce(storage_limit_bytes, 0) into lim
  from public.subscriptions
  where user_id = uid;

  if coalesce(lim, 0) <= 0 then
    lim := fallback;
  end if;

  select coalesce(public.user_storage_used(uid), 0) into used;

  if used + incoming > lim then
    raise exception
      'Limite de armazenamento do seu plano foi atingido (% de % bytes). Faça upgrade para o plano Pro.',
      used + incoming, lim
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
