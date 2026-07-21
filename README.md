# POUP

App para **corretores** de imóveis — simulador de poupança, controle de comissões, relatórios, material de venda e gestão de vendas.

**Universal por padrão:** uma única base de código roda em **Web** (deploy na Vercel) e está pronta para virar app **iOS/Android** via Expo (EAS Build), sem reescrever nada.

Este README é intencionalmente longo e detalhado — além de servir de guia de setup, ele documenta a **lógica de negócio exata** de cada funcionalidade (fórmulas, condicionais, fluxos de navegação, schema do banco) para que qualquer pessoa entrando no projeto — em especial quem for cuidar do backend — consiga entender o sistema por completo sem precisar ler linha a linha o código.

---

## Sumário

1. [Stack e arquitetura](#🧱-stack-e-arquitetura)
2. [Estrutura de pastas](#📁-estrutura-de-pastas)
3. [Começando (instalação e ambiente)](#🚀-começando)
4. [Navegação e guardas de rota](#🧭-navegação-e-guardas-de-rota)
5. [Autenticação](#🔐-autenticação)
6. [Assinatura / Paywall / Stripe](#💳-assinatura--paywall--stripe)
7. [Perfil do corretor e onboarding](#🪪-perfil-do-corretor-e-onboarding)
8. [Cadastros: Empresas, Empreendimentos e Correspondentes](#🏢-cadastros-empresas-empreendimentos-e-correspondentes)
9. [Simulador de poupança (o wizard de 5 etapas)](#🧮-simulador-de-poupança-o-wizard-de-5-etapas)
10. [Geração da Proposta em PDF](#📄-geração-da-proposta-em-pdf)
11. [Scanner de documento (CNH/RG) com Claude](#🪪-scanner-de-documento-cnhrg-com-claude)
12. [Schema do banco (Supabase / Postgres)](#🗄️-schema-do-banco-supabase--postgres)
13. [Menu principal e áreas ainda não implementadas](#🧭-menu-principal-e-áreas-ainda-não-implementadas)
14. [Variáveis de ambiente](#🔑-variáveis-de-ambiente-referência)
15. [Deploy na Vercel](#▲-deploy-na-vercel)
16. [Caminho para App Store / Play Store](#📱-caminho-para-app-store--play-store-depois)
17. [Utilitários (máscaras, storage, tema)](#🛠️-utilitários)

---

## 🧱 Stack e arquitetura

| Camada     | Tecnologia                                                     |
| ---------- | --------------------------------------------------------------- |
| App        | [Expo](https://expo.dev) + Expo Router + React Native + RN Web |
| Linguagem  | TypeScript (strict)                                              |
| Auth       | Supabase Auth (email/senha + Google OAuth)                       |
| Banco      | Supabase (Postgres) — **isolado atrás de uma camada de dados**  |
| Pagamentos | Stripe (assinatura mensal) via Supabase Edge Functions           |
| IA         | Anthropic Claude (scanner de documento, visão)                   |
| Deploy web | Vercel (`expo export --platform web` → `dist/`)                  |

### Por que essa arquitetura escala

- **Camada de dados abstrata** (`src/data/`): a UI só conhece _interfaces_ de repositório (`AuthRepository`, `ProfileRepository`, `BillingRepository`, `CompanyRepository`, `DevelopmentRepository`). Hoje a implementação é Supabase (`src/data/supabase/*`); para migrar a um banco mais robusto no futuro, cria-se uma nova implementação e troca-se **um** arquivo (`src/data/index.ts`). Nenhuma tela muda.
- **Billing no servidor** (Edge Functions): a chave secreta do Stripe nunca toca o client. A tabela `subscriptions` é a fonte da verdade do acesso pago e é atualizada **apenas** pelo webhook do Stripe (service role, ignora RLS). Quando formos para as lojas, dá pra plugar o billing nativo (App Store/Play Store) trocando só a `BillingRepository`.
- **Cota de armazenamento reforçada no próprio banco**: o limite de armazenamento do plano não é só uma checagem de UI — existe um *trigger* Postgres (`enforce_storage_quota`, ver §12) que rejeita o upload no nível do banco se o usuário estourar a cota, então nenhum client (nem um bugado, nem um malicioso) consegue burlar o limite.
- **Mobile-first e responsivo**: layout se adapta de celular a desktop (`Screen` limita a largura via `layout.maxContentWidth`, o menu vira 2 ou 3 colunas em telas largas).
- **Providers em cadeia com dependência explícita**: `AuthProvider` → `ProfileProvider` → `SubscriptionProvider` — cada um só reage quando o `user` do provider anterior muda de fato (ver "shallow-compare" na seção de Autenticação), evitando remounts em cascata da árvore inteira do app.

---

## 📁 Estrutura de pastas

```
app/                                # Rotas (Expo Router, file-based)
  _layout.tsx                       # Providers globais + Stack raiz
  index.tsx                         # Decide para onde redirecionar (login/paywall/app)
  paywall.tsx                       # Tela de assinatura (Stripe Checkout)
  (auth)/                           # Grupo público
    _layout.tsx                     # Bloqueia acesso se já houver sessão
    login.tsx, signup.tsx, forgot-password.tsx
  (app)/                            # Grupo protegido (auth + assinatura ativa)
    _layout.tsx                     # Guarda de rota + OnboardingModal
    index.tsx                       # Menu principal
    perfil.tsx                      # Edição completa do perfil do corretor
    configuracoes.tsx                # Perfil resumido, assinatura, tema, sair
    relatorios.tsx, material-venda.tsx, comissao.tsx, vendas.tsx  # stubs
    cadastros/
      index.tsx                    # Hub (empresas / empreendimentos)
      empresas.tsx                 # CRUD de empresas + regras de negócio + correspondentes
      empreendimentos.tsx          # CRUD de empreendimentos + regras de negócio
    simulador/
      _layout.tsx                  # <SimuladorProvider> + Stack das 5 etapas
      index.tsx                    # Etapa 1 — Empreendimento
      corretor.tsx                 # Etapa 2 — Corretor
      cliente.tsx                  # Etapa 3 — Cliente
      financiamento.tsx            # Etapa 4 — Financiamento
      fluxo.tsx                    # Etapa 5 — Fluxo de pagamento + Gerar proposta
src/
  components/                       # UI compartilhada (Button, Input, Logo, WordMark,
                                     # MonthYearField, NumberPickerField, ScanDocumentButton...)
  theme/                            # Cores (claro/escuro), espaçamentos, tipografia
  providers/                        # AuthProvider, ProfileProvider, SubscriptionProvider, ThemeProvider
  data/                             # 🔑 Camada de dados (interfaces + impl. Supabase)
    types.ts                       # Modelos de domínio (independentes de banco)
    repositories.ts                # Interfaces dos repositórios
    supabase/                      # Implementação concreta (Supabase)
  features/
    registry.ts                    # Fonte única do menu/rotas
    plans.ts                       # Planos Start/Pro (preço + limites de armazenamento)
    simulador/
      SimuladorProvider.tsx        # Estado do wizard (persistido em disco)
      calc.ts                     # Todas as fórmulas do fluxo de pagamento
      proposal.ts                 # Geração do HTML/PDF da proposta
  lib/                              # Cliente Supabase, env, máscaras, storage, scanner
supabase/
  migrations/0001_init.sql                 # Schema base (profiles, subscriptions, RLS)
  migrations/0002_plans_and_storage.sql    # Planos + Storage com quota
  migrations/0003_cadastros.sql            # Empresas e empreendimentos
  migrations/0004_profile_fields.sql       # Imobiliária e CNPJ no perfil
  migrations/0005_regras_negocio.sql       # Regras de negócio + correspondentes + gerente imob
  functions/                               # Edge Functions (Stripe x3, scan-document)
docs/STRIPE_PLANOS.md               # Guia passo a passo para criar os 2 planos no Stripe
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

Preencha o `.env` (veja a [referência completa](#🔑-variáveis-de-ambiente-referência) e as seções de Supabase/Stripe abaixo).

### 3. Rodar

```bash
npm run web      # navegador (mobile-first)
npm run ios      # simulador iOS (requer Xcode)
npm run android  # emulador Android
```

---

## 🧭 Navegação e guardas de rota

Entender a árvore de navegação é essencial para entender **quando** cada verificação de acesso roda.

### Providers globais (`app/_layout.tsx`)

```
GestureHandlerRootView
  → SafeAreaProvider
    → ThemeProvider
      → AuthProvider
        → ProfileProvider
          → SubscriptionProvider
            → Stack raiz (index, (auth), (app), paywall)
```

A ordem importa: `Subscription` depende de `Auth` (precisa saber quem é o usuário para buscar a assinatura), e tudo fica dentro do `ThemeProvider` para que as cores reajam à troca de tema em tempo real.

### `app/index.tsx` — a árvore de decisão da raiz

Toda navegação para `/` (inclusive o "Voltar ao início" da tela 404) passa por aqui. A lógica, em ordem:

1. Se `initializing` (auth ainda carregando) **ou** (`user` existe **e** `loading` da assinatura **e** não é uma confirmação de checkout) → mostra `<LoadingScreen/>`.
2. Se não há `user` → `<Redirect href="/(auth)/login" />`.
3. Se voltou do Stripe Checkout com `?checkout=success` e a assinatura **ainda não está ativa**: fica em modo "confirmando pagamento" — tenta `refresh()` da assinatura a cada 1,5s, até 6 tentativas (~9s), esperando o webhook do Stripe gravar a assinatura no banco. Mostra `<LoadingScreen message="Confirmando seu pagamento..." />` enquanto tenta.
4. Se a assinatura não está ativa:
   - Se as 6 tentativas de confirmação já se esgotaram → `<Redirect href="/paywall?pending=1" />` (o paywall mostra um aviso "ainda confirmando" com botão para verificar de novo).
   - Senão → `<Redirect href="/paywall" />`.
5. Senão (logado + assinatura ativa) → `<Redirect href="/(app)" />`.

### `app/(auth)/_layout.tsx` — grupo público

Bloqueia quem **já está logado**: se `initializing`, mostra loading; se `user` existe, `<Redirect href="/" />` (o `index.tsx` acima decide para onde mandar de fato). Senão, renderiza a pilha de `login`/`signup`/`forgot-password`.

### `app/(app)/_layout.tsx` — a guarda do app protegido

Exige autenticação **e** assinatura ativa:

- Usa `initialLoad` (não `loading`!) para decidir a tela cheia de carregamento. Isso é proposital: `loading` fica `true` toda vez que a assinatura é reconferida em segundo plano (por exemplo, quando o app volta de background e o token do Supabase é renovado). Se a guarda usasse `loading`, o `<Stack>` inteiro — incluindo a árvore do Simulador com o wizard em andamento — seria desmontado e remontado a cada reconferência, **apagando o progresso do usuário no meio de uma simulação**. `initialLoad` só é `true` uma vez, na primeira carga.
- Sem `user` → `/(auth)/login`. Sem assinatura ativa → `/paywall`.
- Senão renderiza o `<Stack>` das telas protegidas **e**, como irmão do Stack (não dentro dele), o `<OnboardingModal />` — por isso o modal de completar cadastro pode aparecer sobre **qualquer** tela do app, não só o menu.

### O Simulador: um wizard com estado compartilhado

`app/(app)/simulador/_layout.tsx` envolve as 5 rotas do wizard em um único `<SimuladorProvider>` e depois um `<Stack>` aninhado com uma tela por etapa. Como esse layout só é montado uma vez (a guarda acima não o desmonta em reconferências de assinatura, graças ao `initialLoad`), o estado do `SimuladorProvider` sobrevive enquanto o usuário navega `index → corretor → cliente → financiamento → fluxo` com `router.push`.

**O que acontece quando o corretor toca no card "Simulador" no menu:** `app/(app)/index.tsx` faz `router.push('/(app)/simulador')`, que resolve para `app/(app)/simulador/index.tsx` — a **Etapa 1 (Empreendimento)**. Como é `push` (não `replace`), o Menu continua embaixo na pilha: o gesto de "voltar" retorna ao Menu. O `SimuladorProvider` monta nesse momento e persiste durante todas as etapas seguintes.

O wizard também é **persistido em disco** (rascunho automático, ver §9) como segunda camada de proteção contra perda de progresso, mesmo que o app inteiro seja recarregado.

---

## 🔐 Autenticação

Métodos suportados: **email/senha** e **Google OAuth**. Toda a lógica de auth fica atrás da interface `AuthRepository` (`src/data/repositories.ts`), implementada por `SupabaseAuthRepository`.

### Cadastro (`signup.tsx`)

Valida nome/email/senha (senha ≥ 6 caracteres) e chama `signUp`. Se o projeto Supabase exigir confirmação de email, `supabase.auth.signUp` retorna um usuário **sem sessão** — nesse caso a tela mostra "Enviamos um email de confirmação..." e manda o usuário para o login. Se a sessão já vier pronta (confirmação desativada no projeto), vai direto para `/` (que redireciona conforme assinatura).

### Login (`login.tsx`)

Email/senha padrão, ou botão Google (`signInWithGoogle`):
- **Web**: redirect completo do navegador via `supabase.auth.signInWithOAuth`.
- **Nativo**: abre uma sessão de navegador in-app (`expo-web-browser`) com `skipBrowserRedirect:true`, extrai `access_token`/`refresh_token` da URL de retorno e chama `supabase.auth.setSession(...)` manualmente.

### Esqueci a senha (`forgot-password.tsx`)

Envia link de redefinição via `supabase.auth.resetPasswordForEmail`, com redirect para `/login`.

### O fix crítico do `AuthProvider`: `sameUser()`

O Supabase dispara `onAuthStateChange` com um **objeto novo** toda vez que o token é renovado automaticamente — inclusive quando o app/aba volta a ficar em primeiro plano. Sem tratamento, isso trocaria a referência de `user` a cada renovação, e qualquer `useEffect`/`useCallback` com `[user]` nas dependências (notadamente o `SubscriptionProvider`) dispararia de novo, causando remounts em cascata na árvore do app. A correção:

```ts
function sameUser(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.email === b.email && a.displayName === b.displayName && a.avatarUrl === b.avatarUrl;
}
// ...
setUser((prev) => (sameUser(prev, u) ? prev : u));
```

Se os dados são os mesmos, mantém a referência antiga do estado — nada re-renderiza desnecessariamente.

`AuthProvider` expõe: `user`, `initializing`, `signIn`, `signUp`, `signInWithGoogle`, `sendPasswordReset`, `signOut`.

---

## 💳 Assinatura / Paywall / Stripe

### Planos (`src/features/plans.ts`)

| Plano | Preço        | Armazenamento | Diferenciais                                   |
| ----- | ------------ | ------------- | ----------------------------------------------- |
| Start | R$ 59,90/mês | 5 GB          | Simulador, comissões/vendas, material de venda   |
| Pro   | R$ 99,90/mês | 25 GB         | Tudo do Start + relatórios avançados + suporte prioritário |

> ⚠️ Os limites de armazenamento estão **duplicados** em dois lugares: `src/features/plans.ts` (para exibição na UI) e `PLAN_LIMITS` dentro do edge function `stripe-webhook/index.ts` (que é o valor realmente gravado no banco). Se mudar um valor, mude os dois.

### O que libera acesso

`isSubscriptionActive(sub)` retorna `true` apenas se `sub.status` for `'active'` ou `'trialing'` (outros valores possíveis: `'past_due'`, `'canceled'`, `'incomplete'`, `'none'` — todos bloqueiam o acesso).

### Fluxo completo Checkout → Webhook → Banco

1. Usuário toca em um plano no `paywall.tsx` → `db.billing.createCheckoutSession(priceId)` invoca a edge function **`create-checkout-session`**.
2. A função autentica o usuário pelo header `Authorization`, reaproveita o `stripe_customer_id` já salvo (ou cria um novo customer no Stripe com `metadata.supabase_user_id`), cria uma `stripe.checkout.sessions` em modo `subscription` e devolve a `url` de checkout. O client redireciona para lá (`window.location.assign` na web, `Linking.openURL` no nativo).
3. Depois do pagamento, o Stripe redireciona de volta para `successUrl` (`/?checkout=success`) — o que dispara o loop de "confirmando pagamento" descrito em `app/index.tsx` acima.
4. Em paralelo, o Stripe dispara eventos de webhook (`checkout.session.completed`, `customer.subscription.created|updated|deleted`) para a edge function **`stripe-webhook`**, que:
   - Verifica a assinatura HTTP do Stripe (`stripe.webhooks.constructEventAsync`) — por isso é publicada com `--no-verify-jwt` (o Stripe não manda um JWT do Supabase).
   - Resolve o objeto `Subscription` completo do Stripe.
   - Determina o tier pelo price ID (`tierForPrice`; qualquer price desconhecido cai em `'start'` como padrão seguro).
   - Calcula `active = status === 'active' || status === 'trialing'` e `storageLimit = active ? PLAN_LIMITS[tier] : 0` — **se a assinatura não está ativa, o limite de armazenamento vai a zero**, o que (via o trigger do banco) bloqueia novos uploads imediatamente.
   - Faz **upsert** na tabela `subscriptions` (usando a **service role**, que ignora RLS — é a única gravação permitida nessa tabela) usando `user_id` extraído de `metadata.supabase_user_id`. Se esse metadata não existir no evento, a função loga um aviso e não faz nada (proteção contra dados incompletos).
5. `app/index.tsx` detecta `isActive === true` e libera o `/(app)`.

### Portal de cobrança

Em Configurações, o botão de gerenciar assinatura chama `create-billing-portal-session` (mesma autenticação, busca o `stripe_customer_id` salvo — 404 se não houver assinatura) e abre a URL retornada pelo `stripe.billingPortal.sessions`.

**Guia completo passo a passo (100% pelo navegador): [`docs/STRIPE_PLANOS.md`](docs/STRIPE_PLANOS.md).**

---

## 🪪 Perfil do corretor e onboarding

### Campos do perfil (`UserProfile`)

`fullName`, `agency` (imobiliária), `agencyManager` (gerente da imobiliária), `cnpj`, `phone`, `avatarUrl`, `creci`.

### Campos obrigatórios

```ts
isProfileComplete(p) = Boolean(p.fullName?.trim() && p.agency?.trim() && p.cnpj?.trim() && p.phone?.trim())
```
`agencyManager` e `creci` **não** são obrigatórios.

### Onboarding pós-login

`ProfileProvider` calcula `needsOnboarding = user existe && !loading && !isProfileComplete(profile)`. Esse valor controla a visibilidade do `<OnboardingModal>`, que é renderizado como irmão do `<Stack>` dentro de `(app)/_layout.tsx` — ou seja, **pode aparecer por cima de qualquer tela logada**, não só do menu. O modal:

- Pede só os 4 campos obrigatórios (nome, imobiliária, CNPJ, telefone — com máscara automática).
- `onRequestClose` é vazio de propósito: no Android, o botão físico de voltar **não** fecha o modal — o corretor precisa completar o cadastro.
- Não tem botão de "fechar": ele desaparece sozinho assim que `save()` grava um perfil completo e `needsOnboarding` recalcula para `false`.

### Tela de edição completa (`perfil.tsx`)

Todos os campos, incluindo os opcionais `agencyManager` ("Gerente imob") e `creci`. Campos opcionais em branco são enviados como `null` explicitamente (não como string vazia).

---

## 🏢 Cadastros: Empresas, Empreendimentos e Correspondentes

Acessado via **Configurações → Cadastros** (não é um card do menu principal).

### Empresa (`Company`)

Campo | Uso
--- | ---
`name` | único campo obrigatório
`risk` (%) | **Risco da poupança** dessa construtora — o teto de "% da poupança sobre o valor da unidade" que o Simulador aceita (ver §9)
`maxInstallments` | teto de parcelas **mensais** no fluxo de pagamento
`maxSemiannual` | teto de parcelas **semestrais**
`maxAnnual` | teto de parcelas **anuais**
`coincideInstallments` | se `true`, os vencimentos semestrais/anuais podem cair no mesmo mês de uma mensal; se `false`, pulam +1 mês (ver fórmula de vencimentos em §9)

Todos os campos de "Regras de Negócio" são **opcionais** — só `name` bloqueia o salvamento. Campos numéricos em branco viram `null` (não `0`).

### Correspondentes

Não têm tela própria: são gerenciados **dentro do formulário de edição da empresa**, e só depois que a empresa já foi salva (`editingId` precisa existir — por isso o cadastro pede para salvar a empresa antes de adicionar correspondentes). Cada correspondente é `{id, companyId, name}`, guardado numa tabela própria (`correspondents`) e listado no Simulador (Etapa 2) filtrado pela empresa escolhida na Etapa 1.

### Empreendimento (`Development`)

Sempre vinculado a uma empresa (`companyId`). Campos de "Regras de Negócio":

- **Data de entrega** — escolhida via `MonthYearField` (seletor **só de mês/ano**; internamente é guardada como uma data ISO no dia 1º do mês, ex.: `2028-03-01`, porque a coluna do banco é `date`). No PDF da proposta, essa data aparece só como `Mar/2028`, nunca com o dia.
- **Gerente responsável** (opcional, texto livre) — este é o "Gerente" (do empreendimento/construtora) que aparece na Etapa 2 do Simulador e no PDF, distinto do "Gerente Imob." (que vem do perfil do corretor, é o gerente da imobiliária).

---

## 🧮 Simulador de poupança (o wizard de 5 etapas)

Rotas em `app/(app)/simulador/`, estado compartilhado em `src/features/simulador/SimuladorProvider.tsx`, fórmulas centralizadas em `src/features/simulador/calc.ts`.

### Persistência do rascunho

Toda mudança de estado é salva (com debounce de 300ms) em `AsyncStorage` sob a chave `poup.simulador.draft`, e restaurada automaticamente se o wizard for remontado (ex.: o app foi encerrado pelo sistema operacional em segundo plano). O rascunho só é apagado quando a proposta é gerada com sucesso (`sim.reset()`) — **nunca** ao trocar de tela ou perder foco, para não apagar o trabalho do corretor no meio de um atendimento.

### Etapa 1 — Empreendimento (`index.tsx`)

- Seleciona **Empresa** → carrega as regras de negócio dela para dentro do estado (`companyRisk`, `companyMaxInstallments`, `companyMaxSemiannual`, `companyMaxAnnual`, `companyCoincide`) — trocar de empresa **reseta** o empreendimento escolhido.
- Seleciona **Empreendimento** (filtrado pela empresa escolhida).
- **Bloco/Quadra**: seletor numérico nativo, 0 a 100.
- **Unidade**: texto livre.
- **Valor da unidade**: campo monetário (R$).
- Validação para avançar: empresa, empreendimento, unidade e valor da unidade preenchidos.

### Etapa 2 — Corretor (`corretor.tsx`)

- Mostra (somente leitura) nome, imobiliária, telefone, CNPJ e "Gerente imob." vindos do **perfil** do corretor logado, com atalho para editar o perfil.
- Mostra (somente leitura) o "Gerente" **responsável pelo empreendimento** escolhido na Etapa 1 (vem do cadastro do empreendimento, não é editável aqui).
- Seleciona o **Correspondente** dentre os cadastrados para a empresa escolhida (obrigatório **apenas se a empresa tiver algum correspondente cadastrado**).

### Etapa 3 — Cliente (`cliente.tsx`)

- **1º Proponente** obrigatório: nome, CPF, renda bruta, email, contato.
- **2º Proponente** opcional (+ botão "2º proponente"): exige selecionar um **Tipo de associação** (Cônjuge/Parente/Fiador/Sócio) e os mesmos 5 campos.
- Botão de **escanear documento** (ícone discreto 🪪) em cada proponente — ver §11. Preenche automaticamente **apenas** nome e CPF; os demais campos continuam manuais.

### Etapa 4 — Financiamento (`financiamento.tsx`)

Campos: **Financiamento aprovado**, **Subsídio aprovado**, **FGTS** (todos R$). Mostra (somente leitura) o **Risco da poupança** cadastrado na empresa.

**Cupom** (desconto opcional): botão "+" que, na primeira vez, mostra um aviso ("o cupom será validado pela construtora antes da confirmação da venda") — só depois de fechar esse aviso uma vez (`couponWarningSeen`) é que o seletor de tipo abre diretamente nas próximas vezes. Tipo `R$` (valor fixo) ou `%` (percentual sobre o valor da unidade); pode ser removido com swipe.

**Taxa CEF**: toggle "cliente paga" (`cefClientPays`, padrão `true`). Se ativo, mostra toggle "Parcelar?" (+ quantidade de parcelas, se sim) e o campo "Parcela CEF". Esses valores são só informativos/negociação — aparecem na tabela "NEGOCIAÇÃO" do PDF, mas **não entram** no cálculo da poupança.

**Cálculo de risco em tempo real** (recalculado a cada tecla):

```
cupom = couponType === 'R$' ? couponValue
      : couponType === '%' ? unitValue * pct / 100
      : 0
financiamentoTotal = financiamento + subsídio + FGTS + cupom
poupança            = valorDaUnidade − financiamentoTotal
poupançaPct         = poupança / valorDaUnidade × 100
dentroDoRisco       = poupançaPct <= riscoDaEmpresa
```

O card de status muda de cor (neutro se a empresa não tem risco cadastrado; verde "✓ Dentro do risco"; vermelho "⚠ Ultrapassou o risco") e mostra a poupança e o financiamento total calculados.

### Etapa 5 — Fluxo de pagamento (`fluxo.tsx`)

Esta é a etapa que decide **como a poupança será parcelada** entre ato, mensais e (opcionalmente) semestrais/anuais, e onde a proposta em PDF é gerada.

Todas as fórmulas vivem em `src/features/simulador/calc.ts`:

```
poupança (computePoupanca) = max(0, valorDaUnidade − financiamento − subsídio − FGTS − cupom)
financiamentoSoma (computeFinancingSum) = financiamento + subsídio + FGTS
```

Campos da etapa:
- **Ato do cliente** (R$) + **vencimento** (data).
- **Parcelas mensais**: quantidade (limitada ao `companyMaxInstallments`, se houver) — o **valor de cada parcela mensal é calculado, não digitado**, e aparece com uma animação de "caça-níquel" (`SlotNumber`):
  ```
  restante     = poupança − ato − semestralTotal − anualTotal
  valorMensal  = restante / quantidadeMensais
  ```
- **Semestrais** (opcional, "+ Semestrais"): quantidade (≤ `companyMaxSemiannual`) × valor de cada uma → `semestralTotal`.
- **Anuais** (opcional, "+ Anuais"): quantidade (≤ `companyMaxAnnual`) × valor de cada uma → `anualTotal`.

**Vencimentos** — a cadeia de datas:
```
1º vencimento mensal   = vencimentoDoAto + 1 mês
offset                 = empresa.coincideInstallments ? 0 : 1   (mês extra se não pode coincidir)
1º vencimento semestral[i] = 1ºVencimentoMensal + 6×(i+1) + offset  meses
1º vencimento anual[i]     = 1ºVencimentoMensal + 12×(i+1) + offset meses
```

**Saldo a distribuir** (checagem de fechamento — deve ser ~R$ 0,00):
```
distribuído = ato + valorMensal×quantidadeMensais + semestralTotal + anualTotal
saldo       = poupança − distribuído
```
O card fica verde quando `|saldo| < 1` (arredondamento de centavos) e vermelho caso contrário — sinal visual de que os valores digitados não fecham com a poupança calculada.

**Botão "Gerar proposta"**: exige vencimento do ato e ao menos 1 parcela mensal. Ao concluir a geração/impressão do PDF com sucesso, a simulação inteira é **resetada** (`sim.reset()`, apagando também o rascunho salvo) e o corretor é redirecionado ao menu (`router.replace('/(app)')`) — para não deixar dados de um cliente "vazando" para a próxima simulação.

---

## 📄 Geração da Proposta em PDF

Template HTML gerado em `src/features/simulador/proposal.ts` (função `generateProposalHtml`), estilizado para imprimir em A4, no modelo "Proposta de Compra e Venda" usado pelo mercado imobiliário.

### Por que HTML customizado (e não `expo-print` puro) na web

O `expo-print` do Expo, na web, [só chama `window.print()`](https://github.com/expo/expo) — ele **ignora** o HTML passado e imprime a tela do app inteira. Para gerar o documento de verdade, `printHtmlWeb()` renderiza o HTML dentro de um `<iframe>` isolado e chama `print()` **desse iframe**, resolvendo a Promise apenas quando o evento `onafterprint` dispara (ou depois de um fallback de 60s) — assim o app sabe exatamente quando é seguro limpar a simulação. No nativo (iOS/Android), usa `expo-print` normalmente (`printToFileAsync`) + `expo-sharing`.

### Estrutura do documento

1. **Cabeçalho**: a marca do POUP com o nome por extenso (símbolo + "POUP" — ver [`WordMark`](#🛠️-utilitários)) e a data de hoje. *(Dentro do app, a marca oficial é só o símbolo — este lockup com o nome é usado especificamente em documentos externos como este PDF.)*
2. **Dados gerais**: empreendimento/bloco/unidade, corretor/contato, imobiliária/CNPJ.
3. **Dados do(s) proponente(s)**: 1º (e 2º, se houver).
4. **Negociação**: valor de venda, parcela CEF, renda bruta e "comprometimento" (`valorMensal / rendaBruta × 100`, arredondado).
5. **Tabela de série** (SÉRIE / QTD / VALOR / TOTAL / VENCIMENTOS): Sinal, Financiamento, FGTS, Subsídio (estas 3 só aparecem se > 0), Mensais, Intercalada Semestral e Intercalada Anual (só se houver).
6. **Totais**:
   - `TOTAL A SER PAGO = valorDoContrato − subsídio − FGTS` — ou seja, tudo que o cliente efetivamente paga (incluindo o financiamento, que ele paga via banco), **menos** subsídio e FGTS, que não saem do bolso dele.
   - `SALDO A DISTRIBUIR = valorDoContrato − (ato + financiamentoSoma + valorMensal×qtdMensais + semestralTotal + anualTotal)` — uma checagem interna de que tudo fecha com o valor do contrato; fica verde/"PARCELAMENTO ACEITÁVEL!" quando `|saldo| < 1`.
7. **Quadro Resumo** — em duas colunas:
   - **Tabela principal**: Sinal, Financiamento (financiamento + subsídio + FGTS), Poupança (com destaque verde/vermelho conforme o risco da empresa) e Comprometimento Semestral / Anual (se houver) — cada linha mostra o valor e **quanto ele representa, em %, do valor total do contrato**.
   - **Painel lateral** (menor): Gerente (do empreendimento), Gerente Imob. (do perfil do corretor), Correspondente, Taxa CEF (cliente paga ou não), Entrega (mês/ano) e **Meses para entrega**, calculado automaticamente:
     ```
     mesesParaEntrega = (anoEntrega − anoHoje)×12 + (mêsEntrega − mêsHoje)
     ```
     mostra "Entregue" se ≤ 0.

---

## 🪪 Scanner de documento (CNH/RG) com Claude

O botão de escanear (ícone discreto 🪪, na Etapa 3 do Simulador, um por proponente) usa a **API da Anthropic** (modelo `claude-haiku-4-5-20251001`, com visão) para ler nome e CPF de documentos e preencher os campos automaticamente — **sempre editáveis**, nunca salvos sem revisão do corretor.

- Aceita: CNH modelo antigo, CNH modelo novo (Mercosul), RG modelo antigo e a nova Carteira de Identidade Nacional (CIN).
- Fluxo: pede permissão de câmera (`expo-image-picker`) → se negada, cai para a galeria → converte a imagem em base64 → chama a edge function `scan-document`.
- A edge function exige um usuário logado (401 caso contrário, para evitar abuso — cada chamada tem custo), usa **tool-use forçado** (`tool_choice: {type:'tool', name:'extract_document_data'}`) para obter uma extração estruturada (`fullName`, `cpf`, `documentType`, `confidence`), chamando a API da Anthropic diretamente via `fetch` (sem SDK).
- Se `confidence === 'baixa'`, os dados **ainda assim** preenchem os campos, mas com um aviso: "Não consegui ler com certeza. Confira os dados preenchidos." — nunca bloqueia, só avisa.
- Custo: uma chamada ao Claude Haiku por leitura — poucos centavos por imagem.

Deploy: cole `supabase/functions/scan-document/index.ts` no Supabase Dashboard (mantendo verificação de JWT **ativada**) e configure o segredo `ANTHROPIC_API_KEY`.

---

## 🗄️ Schema do banco (Supabase / Postgres)

Rode as 5 migrations **em ordem** no SQL Editor do Supabase: `0001_init.sql` → `0002_plans_and_storage.sql` → `0003_cadastros.sql` → `0004_profile_fields.sql` → `0005_regras_negocio.sql`.

### Tabelas

**`profiles`** — espelha `auth.users`, 1 linha por usuário (criada automaticamente, ver trigger abaixo).
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | = `auth.users.id`, `on delete cascade` |
| `full_name`, `phone`, `avatar_url`, `creci` | text | |
| `agency` | text | imobiliária (0004) |
| `cnpj` | text | (0004) |
| `agency_manager` | text | gerente da imobiliária (0005) |
| `created_at`, `updated_at` | timestamptz | default `now()` |

**`subscriptions`** — 1 linha por usuário, **única tabela escrita pelo webhook do Stripe** (service role).
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | unique, `references auth.users` |
| `status` | text | default `'none'` — string bruta do Stripe |
| `plan` | text | price ID do Stripe |
| `plan_tier` | text | `'start' \| 'pro'` (0002) |
| `storage_limit_bytes` | bigint | default `0`; `0` = sem plano ativo (0002) |
| `stripe_customer_id`, `stripe_subscription_id` | text | |
| `current_period_end` | timestamptz | |
| `cancel_at_period_end` | boolean | default `false` |

**`companies`** — construtoras cadastradas pelo corretor.
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | dono do cadastro |
| `name` | text | not null |
| `risk` | numeric | % de risco da poupança |
| `max_installments`, `max_semiannual`, `max_annual` | integer | tetos de parcelas (0005) |
| `coincide_installments` | boolean | default `true` (0005) |

**`developments`** — empreendimentos, sempre de uma empresa.
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `user_id`, `company_id` | uuid | `company_id` → `companies.id on delete cascade` |
| `name` | text | not null |
| `delivery_date` | date | data de entrega (0005; UI só expõe mês/ano) |
| `manager_name` | text | gerente responsável, opcional (0005) |

**`correspondents`** — correspondentes bancários de uma empresa (0005, tabela nova).
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `user_id`, `company_id` | uuid | |
| `name` | text | not null |
| `created_at` | timestamptz | **sem** `updated_at`/trigger |

**`storage.buckets`**: bucket privado `uploads` (0002).

### RLS (Row Level Security) — resumo

- `profiles`, `companies`, `developments`, `correspondents`: cada usuário só lê/escreve **suas próprias** linhas (`auth.uid() = user_id`, ou `= id` no caso de `profiles`).
- `subscriptions`: só existe policy de **leitura** própria — não há policy de escrita para usuários comuns; a única gravação é a service role no webhook (que ignora RLS).
- `storage.objects` (bucket `uploads`): 4 policies (select/insert/update/delete), todas exigindo que o primeiro segmento do caminho do arquivo seja o próprio `auth.uid()` — ou seja, a convenção `<user_id>/...` é o que isola os arquivos de cada usuário.

### Funções e triggers

- **`handle_new_user()`** — trigger `after insert on auth.users`: cria automaticamente a linha em `profiles` (nome/avatar vindos do metadata do provedor OAuth, se houver) e a linha em `subscriptions` (`status:'none'`). É por isso que o app pode sempre assumir que essas duas linhas existem para qualquer usuário logado.
- **`set_updated_at()`** — trigger genérica (`before update`) que atualiza `updated_at = now()`; aplicada em `profiles`, `subscriptions`, `companies`, `developments` (não em `correspondents`, que não tem essa coluna).
- **`user_storage_used(uid)`** — função SQL que soma o tamanho (`metadata->>'size'`) de todos os objetos do usuário no bucket `uploads`. Chamada pelo client via RPC para mostrar "X de Y GB usados".
- **`enforce_storage_quota()`** — trigger `before insert on storage.objects`: compara `usado + tamanhoDoNovoArquivo` contra `subscriptions.storage_limit_bytes` do usuário e **rejeita o insert no banco** (não só na UI) se estourar a cota, com uma mensagem de erro pedindo upgrade para o Pro.

---

## 🧭 Menu principal e áreas ainda não implementadas

`src/features/registry.ts` é a fonte única das 6 áreas do menu principal:

| Área | Rota | Status |
|---|---|---|
| Simulador de poupança | `/(app)/simulador` | ✅ Implementado |
| Relatórios | `/(app)/relatorios` | 🚧 Placeholder |
| Configurações | `/(app)/configuracoes` | ✅ Implementado |
| Material de Venda | `/(app)/material-venda` | 🚧 Placeholder |
| Controle de Comissão | `/(app)/comissao` | 🚧 Placeholder |
| Vendas Realizadas | `/(app)/vendas` | 🚧 Placeholder |

As 4 áreas ainda não implementadas renderizam apenas `<FeaturePlaceholder>` (emoji + título + descrição + selo "Em desenvolvimento") — nenhuma lógica própria ainda.

**Cadastros** (Empresas/Empreendimentos) está **totalmente implementado**, mas não é um card do menu — só é acessível via **Configurações → Cadastros**.

---

## 🔑 Variáveis de ambiente (referência)

Só variáveis com prefixo `EXPO_PUBLIC_` ficam no bundle do client — segredos de servidor (service role do Supabase, chave secreta do Stripe, webhook secret, `ANTHROPIC_API_KEY`) **nunca** entram aqui; eles vivem exclusivamente nos segredos das Edge Functions.

```
EXPO_PUBLIC_SUPABASE_URL=            # Supabase Dashboard > Project Settings > API
EXPO_PUBLIC_SUPABASE_ANON_KEY=       # idem (chave anon/public)
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=  # Stripe Dashboard > Developers > API keys
EXPO_PUBLIC_STRIPE_PRICE_START=      # price_... do produto "POUP Start"
EXPO_PUBLIC_STRIPE_PRICE_PRO=        # price_... do produto "POUP Pro"
EXPO_PUBLIC_APP_URL=                 # http://localhost:8081 (local) ou o domínio de produção
```

Se `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` estiverem ausentes, o app ainda builda (usa placeholders para o prerender não quebrar), mas nenhuma chamada ao backend funciona em runtime.

### Configuração do Supabase (projeto POUP)

O projeto é gerenciado manualmente (sem CLI conectada a este repositório):

1. Rode as 5 migrations, em ordem, no **SQL Editor** do Supabase (ver §12).
2. Copie `Project URL`/`anon public` de **Project Settings → API** para o `.env`.
3. **Google OAuth**: em **Authentication → Providers → Google**, habilite e cole o Client ID/Secret (criado no [Google Cloud Console](https://console.cloud.google.com/apis/credentials)). Em **Authentication → URL Configuration**, adicione as Redirect URLs (`http://localhost:8081` e o domínio de produção).

### Configuração do Stripe (planos Start e Pro)

**Guia completo passo a passo (100% pelo navegador): [`docs/STRIPE_PLANOS.md`](docs/STRIPE_PLANOS.md).** Resumo:

1. Crie dois Produtos (`POUP Start`, `POUP Pro`) com preço recorrente mensal; copie os `price_...` para o `.env`.
2. Copie a publishable key (`pk_...`).
3. Publique as 3 Edge Functions (`create-checkout-session`, `create-billing-portal-session`, `stripe-webhook`) colando o código de cada uma no Supabase Dashboard.
4. Configure os segredos: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_START`, `STRIPE_PRICE_PRO`.
5. No Stripe Dashboard, aponte um webhook para `https://<projeto>.supabase.co/functions/v1/stripe-webhook`, assinando `checkout.session.completed` e `customer.subscription.*`; copie o `whsec_...` para o segredo acima.

---

## ▲ Deploy na Vercel

O projeto já vem com `vercel.json`. Na Vercel:

1. **Import** do repositório.
2. **Environment Variables**: as mesmas `EXPO_PUBLIC_*` do `.env` (com `EXPO_PUBLIC_APP_URL` = domínio de produção).
3. Build detectado automaticamente: `npm run build:web` → saída em `dist/`.

---

## 📱 Caminho para App Store / Play Store (depois)

Já está preparado: o app é Expo. Quando quiser publicar nas lojas, usaremos **EAS Build** (`eas build`) e billing nativo. Nada da UI precisará mudar — apenas adicionamos uma implementação de `BillingRepository` para as lojas.

---

## 🛠️ Utilitários

- **`src/lib/masks.ts`** — `formatPhone`, `formatCNPJ`, `formatCPF`, `formatCurrencyBRL` (formata dígitos digitados como centavos → `R$ 350.000,00`) e `currencyToNumber` (inverso).
- **`src/lib/storage.ts`** — `sessionStorage` (`getItem`/`setItem`/`removeItem`): usa `AsyncStorage` no nativo e na web, com fallback em memória fora do browser (SSR/build). Usado tanto para a sessão do Supabase quanto para o rascunho do Simulador.
- **`src/theme/`** — paletas clara/escura (`AppColors`), `spacing` (escala de 4pt), `radius`, `typography`, `shadow`, `layout.maxContentWidth` (640, usado para não esticar o conteúdo em telas largas).
- **`Logo`/`Mark`** — a marca oficial do POUP dentro do app: **só o símbolo**, sem o nome por extenso.
- **`WordMark`** — segunda variante da marca (símbolo + "POUP" por extenso), usada especificamente em documentos externos (hoje, o cabeçalho do PDF da proposta).
