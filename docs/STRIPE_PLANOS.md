# Guia — Criar os planos Start e Pro no Stripe

O POUP tem **dois planos** de assinatura mensal. O diferencial principal é o
**limite de armazenamento** (uploads dos corretores):

| Plano  | Armazenamento | Sugestão de preço |
| ------ | ------------- | ----------------- |
| Start  | 5 GB          | R$ 29,90/mês       |
| Pro    | 25 GB         | R$ 59,90/mês       |

> Os limites vivem em `src/features/plans.ts` (app) e em
> `supabase/functions/stripe-webhook/index.ts` (`PLAN_LIMITS`). Se mudar um,
> mude os dois. Os preços exibidos no app estão em `plans.ts` (`priceLabel`) e
> devem bater com o que você configurar no Stripe abaixo.

---

## Passo 1 — Criar o Produto "POUP Start"

1. Stripe Dashboard → **Product catalog** (ou **Products**) → **+ Add product**
2. **Name:** `POUP Start`
3. **Description** (opcional): `Plano inicial — 5 GB de armazenamento`
4. Em **Pricing**:
   - **Pricing model:** Recurring (recorrente)
   - **Amount:** `29,90` — **Currency:** BRL
   - **Billing period:** Monthly (mensal)
5. **Save product**
6. Na página do produto, em **Pricing**, clique no preço criado e **copie o
   `Price ID`** (começa com `price_...`). Esse é o seu `STRIPE_PRICE_START`.

## Passo 2 — Criar o Produto "POUP Pro"

Repita o passo 1 com:
- **Name:** `POUP Pro`
- **Amount:** `59,90` BRL, Monthly
- Copie o `Price ID` → esse é o seu `STRIPE_PRICE_PRO`.

> ⚠️ Copie o **Price ID** (`price_...`), NÃO o Product ID (`prod_...`).

---

## Passo 3 — Colar os Price IDs

### Na Vercel (client) — Settings → Environment Variables

| Nome | Valor |
| ---- | ----- |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` (Developers → API keys) |
| `EXPO_PUBLIC_STRIPE_PRICE_START`     | `price_...` do Start |
| `EXPO_PUBLIC_STRIPE_PRICE_PRO`       | `price_...` do Pro |

### No Supabase (servidor) — via CLI

O webhook precisa saber qual price é qual plano para gravar o `plan_tier` e o
`storage_limit_bytes` corretos:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_START=price_...   # mesmo do Start
supabase secrets set STRIPE_PRICE_PRO=price_...      # mesmo do Pro
```

---

## Passo 4 — Webhook (se ainda não fez)

1. Deploy das funções:
   ```bash
   supabase functions deploy create-checkout-session
   supabase functions deploy create-billing-portal-session
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
2. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
   - **Endpoint URL:** `https://SEU-PROJETO.supabase.co/functions/v1/stripe-webhook`
   - **Events:** `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`
3. Copie o **Signing secret** (`whsec_...`) e rode
   `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`

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
Price IDs e chaves são diferentes (`pk_test_`, `sk_test_`, `price_...` de teste).
