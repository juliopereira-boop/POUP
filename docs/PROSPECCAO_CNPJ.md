# Prospectar Leads — configuração (Casa dos Dados)

A ferramenta **Prospectar Leads** (aba Prospecção, dentro de Leads) busca leads
locais — pessoas com negócio próprio na cidade escolhida — usando a API da
**Casa dos Dados** sobre a base pública da Receita Federal. É 100% legal (dado
público) e não depende de criar página nem rodar anúncio.

Para funcionar, você cria uma conta na Casa dos Dados, pega a **chave de API** e
cola nos segredos do Supabase. Passo a passo:

## 1. Conta e chave de API na Casa dos Dados

1. Acesse **https://casadosdados.com.br** e crie sua conta.
2. No painel, procure em **Conta / Integrações / API** a sua **API Key**
   (chave de API). Copie o valor.
   - A busca tem uma faixa **gratuita**; consultas adicionais custam poucos
     centavos por lead (crédito pré-pago). Veja os planos em
     https://portal.casadosdados.com.br/precos.

## 2. Colar a chave no Supabase

1. No painel do Supabase do projeto POUP, vá em **Edge Functions → Secrets**
   (ou **Project Settings → Edge Functions → Secrets**).
2. Adicione o segredo:
   - `CASADOSDADOS_API_KEY` = a sua API Key
3. Salve.

## 3. Publicar a Edge Function

Publique/atualize a função **`prospect-leads`** (cole o conteúdo de
`supabase/functions/prospect-leads/index.ts` no editor de Edge Functions do
Supabase). Deixe a verificação de JWT **ligada** (só o corretor logado usa).

## Pronto

Na aba **Prospecção**, o corretor escolhe **estado + cidade** e clica em
**Prospectar**. Aparece a lista de leads locais com nome e telefone; é só
tocar em **Salvar** para jogar na Gestão de Leads, ou no ícone do WhatsApp
para falar na hora. Cada nova busca traz leads diferentes — nunca repete os
já vistos.

## Observações honestas

- Nem todo lead tem telefone cadastrado (os sem telefone são omitidos da
  lista).
- São telefones **comerciais/públicos** do negócio — não o WhatsApp pessoal.
- A faixa gratuita da Casa dos Dados é limitada; uso intenso consome créditos
  (poucos centavos por lead).
- Respeite quem pedir para não ser contatado (boa prática e evita dor de cabeça
  com a LGPD).
