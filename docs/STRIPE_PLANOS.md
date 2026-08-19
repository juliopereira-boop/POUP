# Guia — os três planos no Stripe, no Supabase e na Vercel

O POUP tem **três planos** de assinatura mensal:

| Plano        | Preço        | O que ele tem                                        |
| ------------ | ------------ | ---------------------------------------------------- |
| **Start**    | R$ 29,90/mês | Tudo, menos vendas, comissão e LIA                   |
| **Intermed** | R$ 49,90/mês | Tudo do Start **+** vendas realizadas e comissão     |
| **Pro**      | R$ 89,90/mês | Tudo **+ a LIA**                                     |

A LIA é o único recurso exclusivo do Pro, e é ela que justifica o degrau de
R$ 40 sobre o Intermed.

> A lista completa de funcionalidades e a marcação de incluído/não incluído
> ficam em `PLAN_FEATURES`, em `src/features/plans.ts`. O bloqueio em tela usa a
> mesma lista, pela função `canUse(feature, tier, isTrial)` — quem está em
> **período de teste gratuito vê tudo liberado**, inclusive a LIA, mesmo com
> `plan_tier = start`. É de propósito: é assim que o corretor conhece o topo da
> escada e decide assinar por causa dele.

---

## ⚠️ LEIA ISTO ANTES DE MUDAR UM PREÇO

**No Stripe, preço não se edita. Cria-se outro.**

Um `Price` é imutável depois de criado — o Stripe não deixa alterar o valor,
porque assinaturas ativas apontam para ele e mudar o valor por baixo mudaria a
cobrança de quem já assinou sem que ninguém aprovasse. Então "mudar o preço do
Pro para R$ 89,90" na prática é:

1. criar um **preço novo** no mesmo produto,
2. arquivar o antigo (para ninguém mais assinar por ele),
3. trocar o `price_...` nas variáveis de ambiente,
4. decidir o que fazer com **quem já assina pelo preço velho**.

O passo 4 é o que a maioria esquece. **Quem já assina continua pagando o preço
antigo até que você migre a assinatura dele** — o Stripe não muda ninguém
sozinho. Isso é bom: não se aumenta o preço de um cliente sem avisar. Mas
significa que a base fica com dois preços convivendo, e é você que decide
quando (e se) migrar.

---

## Onde o preço aparece — os SEIS lugares

Mudar em um só deixa o produto inconsistente. A lista completa:

| # | Onde | O que fazer |
| - | ---- | ----------- |
| 1 | **Stripe** — `Price` de cada produto | Criar o preço novo, arquivar o antigo |
| 2 | **Vercel** — `EXPO_PUBLIC_STRIPE_PRICE_*` | Apontar para o `price_...` novo |
| 3 | **Supabase** — secrets `STRIPE_PRICE_*` | Apontar para o mesmo `price_...` |
| 4 | `src/features/plans.ts` — `priceLabel` | **Já está atualizado** neste repositório |
| 5 | `public/comercial/index.html` — cards de preço | **Já está atualizado** |
| 6 | `public/comercial/lia.html` — card do Pro | **Já está atualizado** |

Os itens 4, 5 e 6 são código e já foram feitos. **Os itens 1, 2 e 3 são seus** —
ninguém consegue fazê-los por você, porque exigem a sua conta.

> Os itens 2 e 3 precisam do **mesmo** `price_...`. Se divergirem, o app manda o
> cliente para o Checkout de um preço e o webhook grava o plano de outro: a
> pessoa paga o Pro e recebe o Start. É a falha mais cara possível aqui, e ela
> não dá erro nenhum — só um chamado de suporte confuso.

---

# PARTE 1 — STRIPE

## 1.1 — Se o produto ainda NÃO existe (é o caso do Intermed)

1. Stripe Dashboard → **Product catalog** → **+ Add product**
2. **Name:** `POUP Intermed`
3. **Description** (opcional): `Vendas realizadas e controle de comissão`
4. Em **Pricing**:
   - **Pricing model:** Recurring
   - **Amount:** `49,90` — **Currency:** BRL
   - **Billing period:** Monthly
5. **Save product**
6. Na página do produto, em **Pricing**, clique no preço e **copie o `Price ID`**
   (começa com `price_...`).

> ⚠️ Copie o **Price ID** (`price_...`), NÃO o Product ID (`prod_...`). São
> parecidos e trocá-los faz o Checkout falhar com um erro genérico.

## 1.2 — Se o produto JÁ existe e só o preço mudou (é o caso do Pro e do Start)

1. Stripe Dashboard → **Product catalog** → abra `POUP Pro`
2. Na seção **Pricing**, clique em **+ Add another price**
   - **Amount:** `89,90` — **Currency:** BRL — **Recurring / Monthly**
   - **Save**
3. **Copie o `Price ID` do preço NOVO**
4. No preço **antigo**, no menu `···` → **Archive price**
   - Arquivar não mexe em quem já assina; só impede novas assinaturas por ele.
5. Repita para `POUP Start` com `29,90`

### O que fazer com quem já assina pelo preço antigo

Três caminhos, do mais gentil ao mais direto:

**a) Não fazer nada (recomendado no começo).** Quem entrou antes continua no
preço antigo. É o "grandfathering" clássico: gera boa vontade, e com poucos
assinantes o valor total envolvido é pequeno.

**b) Migrar um por um.** Stripe → **Customers** → a assinatura → **Update
subscription** → trocar o preço. Marque **"Proration: none"** se não quiser
cobrar/creditar a diferença do mês corrente. **Avise a pessoa antes** — mudança
de preço sem aviso é o caminho mais rápido para um estorno.

**c) Migrar em massa.** Stripe → **Product catalog** → o produto → menu `···` →
**Migrate subscriptions** (se disponível na sua conta). Ele agenda a troca para
a próxima renovação de cada assinante.

---

# PARTE 2 — SUPABASE (as Edge Functions)

O servidor precisa saber qual `price_...` corresponde a qual plano. É isso que
faz o webhook gravar `plan_tier = 'pro'` em vez de `'start'`.

## 2.1 — Os secrets

**Supabase Dashboard** → **Edge Functions** → **Secrets** (também aparece em
**Project Settings → Edge Functions**) → **Add new secret**:

| Nome (Key) | Valor | Onde pegar |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_...` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Parte 2.3 abaixo |
| `STRIPE_PRICE_START` | `price_...` | O preço novo do Start |
| `STRIPE_PRICE_INTERMED` | `price_...` | O preço do Intermed |
| `STRIPE_PRICE_PRO` | `price_...` | O preço novo do Pro |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Necessário para a LIA (`lia-extract`) |

> Mudar um secret **não** exige republicar a função: ela lê o valor a cada
> chamada. Mas o valor só passa a valer na próxima invocação.

> **O `STRIPE_PRICE_INTERMED` não é opcional.** Sem ele, `tierForPrice()` em
> `stripe-webhook/index.ts` não reconhece o preço e cai no fallback, que é
> `start`. O assinante do Intermed pagaria R$ 49,90 e ficaria sem vendas e sem
> comissão. O fallback é `start` de propósito — errar para baixo gera um chamado
> de suporte, errar para cima entrega de graça e ninguém avisa —, mas isso não
> substitui configurar a variável.

## 2.2 — Publicar as Edge Functions

**Supabase Dashboard** → **Edge Functions** → **Deploy a new function**. Uma de
cada vez, colando o conteúdo do arquivo correspondente do repositório:

| Função | Arquivo | Verify JWT |
| --- | --- | --- |
| `create-checkout-session` | `supabase/functions/create-checkout-session/index.ts` | ✅ marcado |
| `create-billing-portal-session` | `supabase/functions/create-billing-portal-session/index.ts` | ✅ marcado |
| `stripe-webhook` | `supabase/functions/stripe-webhook/index.ts` | ❌ **desmarcado** |
| `delete-account` | `supabase/functions/delete-account/index.ts` | ✅ marcado |
| `lia-extract` | `supabase/functions/lia-extract/index.ts` | ✅ marcado |
| `get-financing-simulation` | `supabase/functions/get-financing-simulation/index.ts` | ❌ **desmarcado** |

> As duas com **Verify JWT desmarcado** são chamadas por quem **não tem login**:
> o `stripe-webhook` é chamado pelo Stripe, e o `get-financing-simulation` é
> chamado pelo navegador do CLIENTE do corretor, que não tem conta no POUP.
> Deixar o JWT ligado nelas faz o Stripe receber 401 (e a assinatura nunca ser
> gravada) e o link da simulação abrir em branco.
>
> As duas são seguras sem JWT porque validam outra coisa: o `stripe-webhook`
> confere a **assinatura criptográfica** do Stripe, e o `get-financing-simulation`
> confere o **hash do token** e a validade do link.

## 2.3 — O webhook do Stripe

1. A URL da função publicada é:
   `https://SEU-PROJETO-REF.supabase.co/functions/v1/stripe-webhook`
   (o `SEU-PROJETO-REF` é o pedaço antes de `.supabase.co` na `Project URL`, em
   Supabase → Project Settings → API)
2. Stripe → **Developers → Webhooks → Add endpoint**
3. **Endpoint URL:** a URL acima
4. **Events to send:** exatamente estes quatro:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. **Add endpoint**
6. Na página do endpoint → **Signing secret** → **Reveal** → copie o `whsec_...`
7. Volte em 2.1 e grave o `STRIPE_WEBHOOK_SECRET`

**Teste:** na mesma página, **Send test webhook** → `checkout.session.completed`.
Resposta **200 OK** significa que está funcionando.

## 2.4 — As migrations pendentes

**Supabase Dashboard** → **SQL Editor** → cole e execute, **nesta ordem**:

```
supabase/migrations/0023_commissions.sql
supabase/migrations/0024_catalog.sql
supabase/migrations/0025_uf.sql
supabase/migrations/0026_catalogo_sobrevive_ao_dono.sql
supabase/migrations/0027_financiamento.sql
```

A `0027` cria as tabelas do simulador de financiamento e acrescenta
`unit_value_from` aos empreendimentos. Sem ela, o módulo de financiamento abre
mas não salva nada.

---

# PARTE 3 — VERCEL (o aplicativo)

**Vercel** → o projeto → **Settings → Environment Variables**:

| Nome | Valor |
| ---- | ----- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | a anon key do Supabase |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `EXPO_PUBLIC_STRIPE_PRICE_START` | `price_...` do Start |
| `EXPO_PUBLIC_STRIPE_PRICE_INTERMED` | `price_...` do Intermed |
| `EXPO_PUBLIC_STRIPE_PRICE_PRO` | `price_...` do Pro |
| `EXPO_PUBLIC_APP_URL` | `https://SEU-DOMINIO` |

> **Depois de salvar, é OBRIGATÓRIO fazer um Redeploy.**
>
> As variáveis `EXPO_PUBLIC_*` são **embutidas no código no momento do build**,
> e não lidas em tempo de execução. Salvar a variável e não redeployar deixa o
> site publicado com os valores ANTIGOS, sem nenhum aviso — o botão de assinar
> continua mandando para o preço velho. Vercel → **Deployments** → o último →
> `···` → **Redeploy**, com **"Use existing Build Cache" DESMARCADO**.

Marque as variáveis para **Production**, **Preview** e **Development** — senão
os previews quebram com o backend em placeholder.

---

# PARTE 4 — CONFERÊNCIA FINAL

Faça este roteiro em **modo de teste** antes de fazer em produção:

1. Abra o site publicado → **Preços** → confira que os três cards mostram
   **R$ 29,90**, **R$ 49,90** e **R$ 89,90**.
2. Entre no app com uma conta sem assinatura → o **paywall** deve mostrar os
   três planos com os mesmos valores.
3. Clique em **Assinar** no Intermed → o Checkout do Stripe tem que abrir com
   **R$ 49,90**. Se abrir com outro valor, a variável da Vercel está errada ou o
   redeploy não foi feito.
4. Pague com o cartão de teste `4242 4242 4242 4242` (validade futura, qualquer
   CVV).
5. No Supabase → **Table Editor** → `subscriptions` → a linha do usuário precisa
   estar com `plan_tier = 'intermed'`. Se estiver `start`, o secret
   `STRIPE_PRICE_INTERMED` no Supabase está errado ou ausente.
6. No app, **Vendas** e **Comissão** devem estar liberados, e a **LIA** não deve
   aparecer.
7. Repita com o Pro e confira que a **LIA aparece**.

O passo 5 é o mais importante: é ele que separa "o cliente pagou" de "o cliente
recebeu o que pagou".

---

## Testando sem cobrar de verdade

Use o **modo de teste** do Stripe (o toggle no topo do dashboard). Nesse modo,
tudo é separado: as chaves (`pk_test_`, `sk_test_`), os Price IDs e **o
webhook** — que precisa ser criado de novo em modo teste, com outro
`whsec_...`. Não dá para reaproveitar nada do modo live.

---

## Pelo terminal, se preferir

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF

npx supabase functions deploy create-checkout-session
npx supabase functions deploy create-billing-portal-session
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy delete-account
npx supabase functions deploy lia-extract
npx supabase functions deploy get-financing-simulation --no-verify-jwt

npx supabase secrets set STRIPE_SECRET_KEY=sk_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase secrets set STRIPE_PRICE_START=price_...
npx supabase secrets set STRIPE_PRICE_INTERMED=price_...
npx supabase secrets set STRIPE_PRICE_PRO=price_...
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Os dois caminhos publicam exatamente o mesmo código.

---

## Como funciona por dentro

1. O corretor abre o **paywall** e vê os três cards.
2. Ao assinar, o app chama `create-checkout-session` com o `price_...` do plano
   escolhido e redireciona para o Checkout do Stripe.
3. Pago, o Stripe dispara o **webhook** → `tierForPrice()` traduz o `price_...`
   em `start | intermed | pro` e grava em `subscriptions` junto com o
   `storage_limit_bytes`.
4. O app libera as funcionalidades pela mesma lista de `src/features/plans.ts`, e
   o banco passa a recusar upload acima do limite do plano (trigger de quota em
   `storage.objects`).

> Os limites de armazenamento vivem em **dois lugares**: `src/features/plans.ts`
> (app) e `supabase/functions/stripe-webhook/index.ts` (`PLAN_LIMITS`). Mudou um,
> mude o outro. O armazenamento saiu da propaganda — gigabyte não vende CRM de
> corretor —, mas continua valendo como limite técnico.
