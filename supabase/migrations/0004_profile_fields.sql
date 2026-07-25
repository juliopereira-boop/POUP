alter table public.profiles
  add column if not exists agency text,
  add column if not exists cnpj text;

comment on column public.profiles.agency is 'Imobiliária onde o corretor atua.';
comment on column public.profiles.cnpj is 'CNPJ da imobiliária/corretor.';
