alter table public.lead_campaigns
  add column if not exists descricao text not null default '',
  add column if not exists beneficios jsonb not null default '[]'::jsonb;
