# Guia — Criar os planos Start e Pro no Stripe

O POUP tem **dois planos** de assinatura mensal. O diferencial principal é o
**limite de armazenamento** (uploads dos corretores):

| Plano  | Armazenamento | Sugestão de preço |
| ------ | ------------- | ----------------- |
| Start  | 5 GB          | R$ 59,90/mês       |
| Pro    | 25 GB         | R$ 99,90/mês       |

> Os limites vivem em `src/features/plans.ts` (app) e em
> `supabase/functions/stripe-webhook/index.ts` (`PLAN_LIMITS`). Se mudar um,
> mude os dois. Os preços exibidos no app estão em `plans.ts` (`priceLabel`) e
> devem bater com o que você configurar no Stripe abaixo.

> 💻 **Este guia usa só o navegador — nenhum passo aqui precisa de terminal.**
> As 3 Edge Functions (`create-checkout-session`, `create-billing-portal-session`,
> `stripe-webhook`) são arquivos únicos e autocontidos: dá pra colar o código
> direto no editor do Supabase Dashboard.

---

## Passo 1 — Criar o Produto "POUP Start"

1. Stripe Dashboard → **Product catalog** (ou **Products**) → **+ Add product**
2. **Name:** `POUP Start`
3. **Description** (opcional): `Plano inicial — 5 GB de armazenamento`
4. Em **Pricing**:
   - **Pricing model:** Recurring (recorrente)
   - **Amount:** `59,90` — **Currency:** BRL
   - **Billing period:** Monthly (mensal)
5. **Save product**
6. Na página do produto, em **Pricing**, clique no preço criado e **copie o
   `Price ID`** (começa com `price_...`). Esse é o seu `STRIPE_PRICE_START`.

## Passo 2 — Criar o Produto "POUP Pro"

Repita o passo 1 com:
- **Name:** `POUP Pro`
- **Amount:** `99,90` BRL, Monthly
- Copie o `Price ID` → esse é o seu `STRIPE_PRICE_PRO`.

> ⚠️ Copie o **Price ID** (`price_...`), NÃO o Product ID (`prod_...`).

---

## Passo 3 — Publicar as 3 Edge Functions (pelo navegador, sem terminal)

No **Supabase Dashboard** → menu lateral **Edge Functions** → botão
**"Deploy a new function"** (ou "Create a new function"). Repita 3 vezes,
uma para cada função:

### 3.1 — `create-checkout-session`
1. Nome da função: `create-checkout-session` (exatamente assim, com hífens)
2. No GitHub, abra
   `supabase/functions/create-checkout-session/index.ts` no repositório do
   POUP → botão de **copiar** (ícone de cópia no canto do arquivo, ou "Raw"
   e selecionar tudo)
3. Cole o conteúdo inteiro no editor do Supabase
4. Clique em **Deploy** / **Save and deploy**

### 3.2 — `create-billing-portal-session`
Mesmos passos, com o arquivo
`supabase/functions/create-billing-portal-session/index.ts`.

### 3.3 — `stripe-webhook`
Mesmos passos, com o arquivo `supabase/functions/stripe-webhook/index.ts`.

> ⚠️ Essa função **não pode exigir login de usuário** (quem vai chamá-la é o
> Stripe, não o app). Ao criar/editar a função no Dashboard, procure uma opção
> chamada **"Enforce JWT verification"** (ou "Verify JWT") e **desmarque/desative**
> ela só para `stripe-webhook`. As outras duas (`create-checkout-session`,
> `create-billing-portal-session`) devem continuar com essa opção **marcada**.

---

## Passo 4 — Configurar os segredos (Secrets)

No **Supabase Dashboard** → **Edge Functions** → aba/botão **Secrets**
(também pode aparecer em **Project Settings → Edge Functions**). Clique em
**"Add new secret"** e adicione um de cada vez:

| Nome (Key) | Valor (Value) | Onde pegar |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_...` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Veja o Passo 5 abaixo (você só terá esse valor depois de criar o webhook) |
| `STRIPE_PRICE_START` | `price_...` | O mesmo Price ID do Passo 1 |
| `STRIPE_PRICE_PRO` | `price_...` | O mesmo Price ID do Passo 2 |

> Você pode voltar aqui depois e adicionar/editar o `STRIPE_WEBHOOK_SECRET`
> assim que tiver o valor — não precisa republicar a função depois de mudar
> um secret.

### E também na Vercel (client) — Settings → Environment Variables

| Nome | Valor |
| ---- | ----- |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` (Stripe → Developers → API keys) |
| `EXPO_PUBLIC_STRIPE_PRICE_START`     | `price_...` do Start |
| `EXPO_PUBLIC_STRIPE_PRICE_PRO`       | `price_...` do Pro |

---

## Passo 5 — Criar o Webhook no Stripe

1. Descubra a URL da sua função: no Supabase, a função `stripe-webhook`
   publicada no Passo 3.3 tem uma URL no formato:
   ```
   https://SEU-PROJETO-REF.supabase.co/functions/v1/stripe-webhook
   ```
   (o `SEU-PROJETO-REF` é o pedaço antes de `.supabase.co` na `Project URL`,
   em Supabase → Project Settings → API)
2. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
3. **Endpoint URL:** cole a URL do passo 1
4. **Events to send:** marque apenas estes 4:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. **Add endpoint** (salvar)
6. Na página do endpoint criado, ache **"Signing secret"** → clique em
   **"Reveal"** → copie o valor (`whsec_...`)
7. Volte ao **Passo 4** e adicione/edite o secret `STRIPE_WEBHOOK_SECRET`
   com esse valor

### Testando o webhook

Na mesma página do endpoint no Stripe, tem um botão **"Send test webhook"**.
Escolha `checkout.session.completed` e envie — se a resposta for **200 OK**,
está funcionando.

---

## Como funciona no app

1. Usuário abre o **paywall** → vê os cards **Start** e **Pro**.
2. Ao clicar em "Assinar", o app chama a Edge Function `create-checkout-session`
   com o `price_...` do plano escolhido → redireciona pro Checkout do Stripe.
3. Pago o Checkout, o Stripe dispara o **webhook** → grava na tabela
   `subscriptions` o `plan_tier` e o `storage_limit_bytes` daquele plano.
4. O banco passa a **bloquear uploads** que ultrapassem o limite (trigger de
   quota em `storage.objects`), protegendo seu custo de infraestrutura.

## Testando sem cobrar de verdade

Use o **modo de teste** do Stripe (toggle no topo do dashboard) e o cartão de
teste `4242 4242 4242 4242`, validade futura e qualquer CVV. Nesse modo os
Price IDs e chaves são diferentes (`pk_test_`, `sk_test_`, `price_...` de teste)
— e o webhook também precisa ser criado separadamente em modo teste.

---

## Se preferir usar terminal/CLI no futuro

Também é possível publicar as funções e definir os segredos via linha de
comando (útil se você configurar um ambiente de desenvolvimento no PC):

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy create-checkout-session
npx supabase functions deploy create-billing-portal-session
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase secrets set STRIPE_SECRET_KEY=sk_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase secrets set STRIPE_PRICE_START=price_...
npx supabase secrets set STRIPE_PRICE_PRO=price_...
```

Os dois caminhos (Dashboard ou CLI) publicam exatamente o mesmo código —
use o que for mais confortável.
