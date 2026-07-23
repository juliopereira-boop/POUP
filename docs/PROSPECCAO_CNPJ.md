# Prospectar Leads — configuração (Nuvem Fiscal)

A ferramenta **Prospectar Leads** (aba Prospecção, dentro de Leads) busca donos
de empresas locais a partir dos **dados públicos de CNPJ da Receita Federal**,
usando a API da **Nuvem Fiscal**. Ela é 100% legal (dado público) e não depende
de criar página nem rodar anúncio.

Para funcionar, você precisa criar uma conta na Nuvem Fiscal (tem plano
gratuito) e colar duas credenciais nos segredos do Supabase. Passo a passo:

## 1. Criar conta e credenciais na Nuvem Fiscal

1. Acesse **https://www.nuvemfiscal.com.br/** e crie sua conta (plano gratuito
   já serve para testar).
2. No painel, procure em **Conta → Credenciais de API** (ou "Aplicativos" /
   "API"). Crie uma credencial de API.
3. Marque o **escopo `cnpj`** (permissão de consulta de CNPJ).
4. Você vai receber dois valores:
   - **Client ID**
   - **Client Secret**
   Copie os dois (o secret costuma aparecer só uma vez — guarde bem).

## 2. Colar as credenciais no Supabase

1. No painel do Supabase do projeto POUP, vá em **Edge Functions → Secrets**
   (ou **Project Settings → Edge Functions → Secrets**).
2. Adicione dois segredos:
   - `NUVEMFISCAL_CLIENT_ID` = o Client ID
   - `NUVEMFISCAL_CLIENT_SECRET` = o Client Secret
3. Salve.

## 3. Publicar a Edge Function

Publique a função **`prospect-leads`** (cole o conteúdo de
`supabase/functions/prospect-leads/index.ts` no editor de Edge Functions do
Supabase). Deixe a verificação de JWT **ligada** (só o corretor logado usa).

## Pronto

Na aba **Prospecção**, o corretor escolhe **estado + cidade + segmento** e
clica em **Prospectar**. Aparece a lista de empresas locais com nome do dono e
telefone; é só tocar em **Salvar** para jogar na Gestão de Leads, ou no ícone do
WhatsApp para falar na hora.

## Observações honestas

- Os telefones vêm do cadastro público da Receita: a cobertura fica em torno de
  **40–70%** das empresas (as sem telefone são omitidas da lista).
- São telefones **comerciais/públicos** do negócio — não o WhatsApp pessoal.
- O plano gratuito da Nuvem Fiscal tem **limite de consultas por mês**; se a
  captação virar rotina pesada, vale migrar para um plano pago (deles ou de
  outro provedor de dados de CNPJ).
- Respeite quem pedir para não ser contatado (é uma boa prática e evita dor de
  cabeça com a LGPD).
