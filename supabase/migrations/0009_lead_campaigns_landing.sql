-- Amplia a campanha de captação com os campos de uma landing page completa:
-- uma descrição (parágrafo) e uma lista de benefícios/destaques.
--
-- Rode DEPOIS da migration 0008.

alter table public.lead_campaigns
  add column if not exists descricao text not null default '',
  add column if not exists beneficios jsonb not null default '[]'::jsonb;
