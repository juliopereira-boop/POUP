drop policy if exists "prospect_usage_all_own" on public.prospect_usage;

drop policy if exists "prospect_usage_select_own" on public.prospect_usage;
create policy "prospect_usage_select_own"
  on public.prospect_usage for select
  using (auth.uid() = user_id);

drop policy if exists "prospect_usage_insert_own" on public.prospect_usage;
create policy "prospect_usage_insert_own"
  on public.prospect_usage for insert
  with check (auth.uid() = user_id);

drop policy if exists "prospect_usage_update_own" on public.prospect_usage;
create policy "prospect_usage_update_own"
  on public.prospect_usage for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.prospect_usage_monotonic()
returns trigger
language plpgsql
as $$
begin
  if new.usados < old.usados then
    new.usados := old.usados;
  end if;
  if new.user_id <> old.user_id or new.dia <> old.dia or new.periodo <> old.periodo then
    raise exception 'Chave de uso de prospecção não pode ser alterada.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists prospect_usage_monotonic on public.prospect_usage;
create trigger prospect_usage_monotonic
  before update on public.prospect_usage
  for each row execute function public.prospect_usage_monotonic();

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.companies enable row level security;
alter table public.developments enable row level security;
alter table public.correspondents enable row level security;
alter table public.simulations enable row level security;
alter table public.leads enable row level security;
alter table public.meta_lead_integrations enable row level security;
alter table public.lead_campaigns enable row level security;
alter table public.prospect_usage enable row level security;
alter table public.company_materials enable row level security;
alter table public.appointment_types enable row level security;
alter table public.appointment_statuses enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_history enable row level security;
