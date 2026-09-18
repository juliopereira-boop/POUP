-- Versão alinhada ao registro de aplicação no projeto POUP.
-- A credencial antiga pertence ao APPLE_CLIENT_ID nativo; NULL preserva esse fallback.
alter table public.apple_credentials add column if not exists client_id text;

-- Uma tentativa por usuário; apenas hash do state, validade curta e consumo atômico.
create table public.apple_reauth_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  nonce text not null check (length(nonce) between 32 and 128),
  platform text not null check (platform in ('web', 'android')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index apple_reauth_challenges_expiry on public.apple_reauth_challenges(expires_at);
alter table public.apple_reauth_challenges enable row level security;
revoke all on public.apple_reauth_challenges from public, anon, authenticated;
grant all on public.apple_reauth_challenges to service_role;
comment on table public.apple_reauth_challenges is
  'Confirmação Apple de uso único; sem tokens de sessão e sem acesso pelo cliente.';
