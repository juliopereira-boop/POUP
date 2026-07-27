create table if not exists public.appointment_types (
  id text primary key,
  nome text not null,
  cor text not null,
  icone text,
  ordem integer not null default 0,
  ativo boolean not null default true
);

insert into public.appointment_types (id, nome, cor, icone, ordem) values
  ('ligacao',    'Ligação',              '#2563EB', '📞', 1),
  ('followup',   'Follow-up',            '#7C3AED', '🔁', 2),
  ('reuniao',    'Reunião',              '#0891B2', '👥', 3),
  ('visita',     'Visita',               '#16A34A', '🏠', 4),
  ('documentos', 'Entrega de Documentos','#D97706', '📄', 5),
  ('assinatura', 'Assinatura',           '#DB2777', '✍️', 6),
  ('plantao',    'Plantão',              '#0D9488', '📍', 7),
  ('outro',      'Outro',                '#6B7280', '•',  8)
on conflict (id) do nothing;

create table if not exists public.appointment_statuses (
  id text primary key,
  nome text not null,
  cor text not null,
  ordem integer not null default 0,
  ativo boolean not null default true
);

insert into public.appointment_statuses (id, nome, cor, ordem) values
  ('agendado',      'Agendado',       '#2563EB', 1),
  ('confirmado',    'Confirmado',     '#0891B2', 2),
  ('em_andamento',  'Em andamento',   '#D97706', 3),
  ('concluido',     'Concluído',      '#16A34A', 4),
  ('cancelado',     'Cancelado',      '#6B7280', 5),
  ('nao_compareceu','Não compareceu', '#DC2626', 6)
on conflict (id) do nothing;

alter table public.appointment_types enable row level security;
alter table public.appointment_statuses enable row level security;

create policy "appointment_types_read" on public.appointment_types
  for select using (auth.uid() is not null);
create policy "appointment_statuses_read" on public.appointment_statuses
  for select using (auth.uid() is not null);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  type_id text not null references public.appointment_types (id),
  status_id text not null default 'agendado' references public.appointment_statuses (id),
  lead_id uuid references public.leads (id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  priority text not null default 'normal',
  reminder_minutes integer[] not null default '{60,30}',
  source text not null default 'manual',
  completed_at timestamptz,
  completed_note text,
  cancelled_at timestamptz,
  cancel_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_user_start_idx
  on public.appointments (user_id, start_at);
create index if not exists appointments_lead_idx on public.appointments (lead_id);
create index if not exists appointments_status_idx on public.appointments (status_id);

alter table public.appointments enable row level security;

create policy "appointments_all_own" on public.appointments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create table if not exists public.appointment_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists appointment_history_appt_idx
  on public.appointment_history (appointment_id, created_at desc);

alter table public.appointment_history enable row level security;

create policy "appointment_history_all_own" on public.appointment_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
