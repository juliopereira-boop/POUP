-- ===========================================================================
-- 0030: REMOVER A PROSPECCAO POR DADOS PUBLICOS
-- ===========================================================================
-- POR QUE
-- ---------------------------------------------------------------------------
-- O POUP tinha uma busca que consultava uma base publica de CNPJ e devolvia
-- nome, telefone e e-mail de pessoas que nunca pediram contato. A regra
-- 5.1.1(viii) da App Store proibe aplicativos que compilam informacao pessoal
-- obtida fora do proprio usuario ou sem consentimento explicito -- e diz, com
-- todas as letras, que vale tambem para dado vindo de banco publico. Ter
-- contratado uma API legitima nao muda nada: a regra e sobre o consentimento
-- de quem esta na lista.
--
-- A funcionalidade saiu do aplicativo (tela, cliente, Edge Function). Esta
-- migration remove o que sobrou no banco.
--
-- ---------------------------------------------------------------------------
-- O QUE FICA
-- ---------------------------------------------------------------------------
-- **Os leads continuam.** `leads.source = 'prospeccao'` segue valendo para os
-- contatos que ja estavam na carteira do corretor -- sao dados dele, e apagar
-- seria destruir o CRM de quem usou o recurso enquanto ele existia. O que
-- acabou foi a captura de contatos novos por esse caminho.
--
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A COTA DA PROSPECCAO NAO TEM MAIS O QUE CONTAR
-- ---------------------------------------------------------------------------
-- `registrar_prospeccao` era chamada pela Edge Function `prospect-leads`, que
-- nao existe mais. Uma funcao `security definer` orfa e superficie de ataque
-- de graca: ninguem a chama, ninguem a audita, e ela continua podendo escrever.

drop function if exists public.registrar_prospeccao(date, text, integer);

drop table if exists public.prospect_usage;

drop function if exists public.prospect_usage_monotonic();


-- ---------------------------------------------------------------------------
-- 2. CONFERENCIA
-- ---------------------------------------------------------------------------
-- Deve devolver zero linhas:
--   select 1 from pg_proc where proname in
--     ('registrar_prospeccao', 'prospect_usage_monotonic');
--   select 1 from pg_tables where tablename = 'prospect_usage';
--
-- Os leads antigos continuam intactos:
--   select count(*) from public.leads where source = 'prospeccao';
--
-- ---------------------------------------------------------------------------
-- 3. FORA DO BANCO, AINDA E PRECISO
-- ---------------------------------------------------------------------------
--   * APAGAR a Edge Function `prospect-leads` no painel do Supabase. Sumir com
--     o arquivo do repositorio nao tira a funcao que ja esta publicada, e uma
--     funcao publicada continua respondendo.
--   * APAGAR o segredo `CASADOSDADOS_API_KEY` (Settings > Edge Functions).
--     Chave de API que ninguem usa e chave que ninguem percebe vazar.
-- ===========================================================================
