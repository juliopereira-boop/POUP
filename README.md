# POUP

App para **corretores** — simulador de poupança, controle de comissões, relatórios, material de venda e gestão de vendas. Feito para escalar.

**Universal por padrão:** uma única base de código roda em **Web** (deploy na Vercel agora) e está pronta para virar app **iOS/Android** (App Store / Play Store) via Expo, sem reescrever.

---

## 🧱 Stack

| Camada        | Tecnologia                                                        |
| ------------- | ----------------------------------------------------------------- |
| App           | [Expo](https://expo.dev) + Expo Router + React Native + RN Web    |
| Linguagem     | TypeScript (strict)                                               |
| Auth          | Supabase Auth (email/senha + Google OAuth)                        |
| Banco         | Supabase (Postgres) — **isolado atrás de uma camada de dados**    |
| Pagamentos    | Stripe (assinatura mensal) via Supabase Edge Functions            |
| Deploy web    | Vercel (`expo export --platform web` → `dist/`)                   |

### Por que essa arquitetura escala

- **Camada de dados abstrata** (`src/data`): a UI só conhece _interfaces_ de repositório (`AuthRepository`, `ProfileRepository`, `BillingRepository`). Hoje a implementação é Supabase; para migrar a um banco mais robusto no futuro, cria-se uma nova implementação e troca-se **um** arquivo (`src/data/index.ts`). Nenhuma tela muda.
- **Billing no servidor** (Edge Functions): a chave secreta do Stripe nunca toca o client. A tabela `subscriptions` é a fonte da verdade do acesso pago e é atualizada por webhook. Quando formos para as lojas, dá pra plugar o billing nativo (App Store/Play Store) trocando só a `BillingRepository`.
- **Mobile-first e responsivo**: layout se adapta de celular a desktop (`Screen` limita a largura, o menu vira 3 colunas em telas largas).

---

## 📁 Estrutura

```
app/                      # Rotas (Expo Router, file-based)
  _layout.tsx             # Providers globais (Auth, Subscription)
  index.tsx               # Redireciona conforme login/assinatura
  (auth)/                 # login, cadastro, esqueci a senha
  (app)/                  # Área logada (protegida por assinatura)
    index.tsx             # Menu principal
    simulador, relatorios, configuracoes, material-venda, comissao, vendas
  paywall.tsx             # Tela de assinatura (Stripe Checkout)
src/
  components/             # UI compartilhada (Button, Input, Logo, MenuCard...)
  theme/                  # Cores, espaçamentos, tipografia
  providers/              # AuthProvider, SubscriptionProvider
  data/                   # 🔑 Camada de dados (interfaces + impl. Supabase)
  features/registry.ts    # Fonte única do menu/rotas
  features/plans.ts       # Planos Start/Pro (limites de armazenamento)
  lib/                    # Cliente Supabase, env, storage
supabase/
  migrations/0001_init.sql               # Schema (profiles, subscriptions, RLS)
  migrations/0002_plans_and_storage.sql  # Planos + Storage com quota
  functions/                             # Edge Functions do Stripe
docs/STRIPE_PLANOS.md     # Guia para criar os 2 planos no Stripe
```

---

## 🚀 Começando

### 1. Instalar

```bash
npm install
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha o `.env` (veja como obter cada valor nas seções abaixo):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
EXPO_PUBLIC_STRIPE_PRICE_START=...
EXPO_PUBLIC_STRIPE_PRICE_PRO=...
EXPO_PUBLIC_APP_URL=http://localhost:8081
```

### 3. Rodar

```bash
npm run web      # navegador (mobile-first)
npm run ios      # simulador iOS (requer Xcode)
npm run android  # emulador Android
```

---

## 🗄️ Configuração do Supabase (projeto POUP)

O projeto POUP é gerenciado manualmente. Passos:

1. **Rodar o schema**: Dashboard → **SQL Editor** → cole o conteúdo de
   `supabase/migrations/0001_init.sql` → **Run**. Depois rode também
   `supabase/migrations/0002_plans_and_storage.sql` (planos + bucket de
   uploads + quota de armazenamento) e
   `supabase/migrations/0003_cadastros.sql` (empresas e empreendimentos).
2. **Credenciais do client**: Dashboard → **Project Settings → API**:
   - `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
   - `anon public` → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. **Google OAuth**: Dashboard → **Authentication → Providers → Google** →
   habilite e cole o Client ID/Secret (crie no [Google Cloud Console](https://console.cloud.google.com/apis/credentials), OAuth 2.0). Em **Authentication → URL Configuration**, adicione as **Redirect URLs**: `http://localhost:8081` e a URL de produção da Vercel.

---

## 💳 Configuração do Stripe (planos Start e Pro)

**Guia completo e passo a passo (100% pelo navegador, sem terminal):
[`docs/STRIPE_PLANOS.md`](docs/STRIPE_PLANOS.md).**
Resumo:

1. Crie **dois Produtos** no Stripe, cada um com preço **recorrente mensal**:
   `POUP Start` e `POUP Pro`. Copie os `price_...` para
   `EXPO_PUBLIC_STRIPE_PRICE_START` e `EXPO_PUBLIC_STRIPE_PRICE_PRO`.
2. Copie a **publishable key** (`pk_...`) para `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
3. Publique as 3 Edge Functions colando o código de cada uma no editor do
   Supabase Dashboard (**Edge Functions → Deploy a new function**) — cada
   função é um arquivo único, não precisa de CLI.
4. Configure os segredos em **Edge Functions → Secrets**:
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_START`,
   `STRIPE_PRICE_PRO`.
5. No **Stripe Dashboard → Developers → Webhooks**, aponte um endpoint para
   `https://<seu-projeto>.supabase.co/functions/v1/stripe-webhook` e assine os
   eventos `checkout.session.completed` e `customer.subscription.*`. Copie o
   **signing secret** (`whsec_...`) para o segredo acima.

> A tabela `subscriptions` é atualizada **apenas** pelo webhook (service role).
> O app libera o acesso quando o status é `active` ou `trialing`.

---

## ▲ Deploy na Vercel

O projeto já vem com `vercel.json`. Na Vercel:

1. **Import** do repositório.
2. **Environment Variables**: adicione as mesmas `EXPO_PUBLIC_*` do `.env`
   (com `EXPO_PUBLIC_APP_URL` = domínio de produção).
3. Build detectado automaticamente: `npm run build:web` → saída em `dist/`.

---

## 📱 Caminho para App Store / Play Store (depois)

Já está preparado: o app é Expo. Quando quiser publicar nas lojas, usaremos
**EAS Build** (`eas build`) e billing nativo. Nada da UI precisará mudar —
apenas adicionamos uma implementação de `BillingRepository` para as lojas.

---

## 🧭 Roadmap das funcionalidades

O menu já lista as 6 áreas. Serão desenvolvidas uma a uma:

- [ ] Simulador de poupança
- [ ] Relatórios
- [x] Configurações (perfil, assinatura, sair)
- [ ] Material de Venda
- [ ] Controle de Comissão
- [ ] Vendas Realizadas
