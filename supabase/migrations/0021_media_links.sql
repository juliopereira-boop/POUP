-- ===========================================================================
-- 0021: LINKS DE MIDIA PARA ENVIO NO WHATSAPP
-- ===========================================================================
-- Guarda a "vitrine" que o corretor monta para um lead: a mensagem, o
-- empreendimento e os arquivos escolhidos no Material de Venda.
-- A edge function `media-page` le essa linha (com service role) e devolve uma
-- pagina publica com as fotos e a previa (Open Graph) que o WhatsApp mostra.
--
-- Migration idempotente: pode ser executada mais de uma vez.
-- ===========================================================================

create table if not exists public.media_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  development_id uuid references public.developments (id) on delete set null,
  titulo text,
  subtitulo text,
  mensagem text,
  paths text[] not null default '{}',
  views integer not null default 0,
  expires_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.media_links is
  'Vitrine de midia gerada pelo corretor para enviar ao lead pelo WhatsApp.';
comment on column public.media_links.paths is
  'Caminhos dos arquivos no bucket uploads, na ordem em que devem aparecer.';

create index if not exists media_links_user_idx on public.media_links (user_id, created_at desc);
create index if not exists media_links_lead_idx on public.media_links (lead_id);

alter table public.media_links enable row level security;

-- O corretor so enxerga e cria os proprios links. A leitura publica NAO passa
-- por aqui: quem le a pagina e a edge function, com service role.
drop policy if exists "media_links_all_own" on public.media_links;
create policy "media_links_all_own" on public.media_links
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists media_links_set_updated_at on public.media_links;
create trigger media_links_set_updated_at
  before update on public.media_links
  for each row execute function public.set_updated_at();

-- Contador de visualizacoes. Chamado pela edge function (service role) toda vez
-- que o lead abre a pagina. Nao ha policy de update publica: so passa por aqui.
create or replace function public.register_media_link_view(link_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.media_links
  set views = views + 1
  where id = link_id;
$$;

revoke all on function public.register_media_link_view(uuid) from public;
revoke all on function public.register_media_link_view(uuid) from anon;
revoke all on function public.register_media_link_view(uuid) from authenticated;
grant execute on function public.register_media_link_view(uuid) to service_role;
