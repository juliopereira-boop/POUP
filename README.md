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
9. [Catálogo do sistema (empresas pré-cadastradas pelo admin)](#🗂️-catálogo-do-sistema-empresas-pré-cadastradas-pelo-admin)
10. [Simulador de financiamento habitacional](#🏦-simulador-de-financiamento-habitacional)
11. [Simulador de poupança (o wizard de 5 etapas)](#🧮-simulador-de-poupança-o-wizard-de-5-etapas)
12. [LIA — a assistente que ouve a negociação](#🎧-lia--a-assistente-que-ouve-a-negociação)
13. [Geração da Proposta em PDF](#📄-geração-da-proposta-em-pdf)
14. [Scanner de documento (CNH/RG) com Claude](#🪪-scanner-de-documento-cnhrg-com-claude)
15. [Schema do banco (Supabase / Postgres)](#🗄️-schema-do-banco-supabase--postgres)
16. [Menu principal e áreas ainda não implementadas](#🧭-menu-principal-e-áreas-ainda-não-implementadas)
17. [Variáveis de ambiente](#🔑-variáveis-de-ambiente-referência)
18. [Deploy na Vercel](#▲-deploy-na-vercel)
19. [Instalar na tela de início (PWA)](#📲-instalar-na-tela-de-início-pwa)
20. [Arquivos: escolher, salvar e visualizar](#📎-arquivos-escolher-salvar-e-visualizar)
21. [Caminho para App Store / Play Store](#📱-caminho-para-app-store--play-store)
22. [Conformidade com a App Review da Apple](#🍏-conformidade-com-a-app-review-da-apple)
23. [Utilitários (máscaras, storage, tema)](#🛠️-utilitários)

---

## 🧱 Stack e arquitetura

| Camada     | Tecnologia                                                     |
| ---------- | --------------------------------------------------------------- |
| App        | [Expo](https://expo.dev) + Expo Router + React Native + RN Web |
| Linguagem  | TypeScript (strict)                                              |
| Auth       | Supabase Auth (email/senha + Google e Apple OAuth)               |
| Banco      | Supabase (Postgres) — **isolado atrás de uma camada de dados**  |
| Pagamentos | Stripe (assinatura mensal) via Supabase Edge Functions           |
| IA         | Anthropic Claude (scanner de documento, visão)                   |
| Deploy web | Vercel (`expo export --platform web` → `dist/`)                  |

### Por que essa arquitetura escala

- **Camada de dados abstrata** (`src/data/`): a UI só conhece _interfaces_ de repositório (`AuthRepository`, `ProfileRepository`, `BillingRepository`, `CompanyRepository`, `DevelopmentRepository`). Hoje a implementação é Supabase (`src/data/supabase/*`); para migrar a um banco mais robusto no futuro, cria-se uma nova implementação e troca-se **um** arquivo (`src/data/index.ts`). Nenhuma tela muda.
- **Billing no servidor** (Edge Functions): a chave secreta do Stripe nunca toca o client. A tabela `subscriptions` é a fonte da verdade do acesso pago e é atualizada **apenas** pelo webhook do Stripe (service role, ignora RLS). Quando formos para as lojas, dá pra plugar o billing nativo (App Store/Play Store) trocando só a `BillingRepository`.
- **Cota de armazenamento reforçada no próprio banco**: o limite do plano não é uma checagem de UI (a UI nem o mostra) — existe um *trigger* Postgres (`enforce_storage_quota`, ver §12) que rejeita o upload no nível do banco se o usuário estourar a cota, então nenhum client (nem um bugado, nem um malicioso) consegue burlar o limite.
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
    plans.ts                       # Planos Start/Intermed/Pro (preço, recursos, limites)
    simulador/
      SimuladorProvider.tsx        # Estado do wizard (persistido em disco)
      calc.ts                     # Todas as fórmulas do fluxo de pagamento
      proposal.ts                 # Geração do HTML/PDF da proposta
    financiamento/                # O motor de financiamento — sem React, sem Supabase
      dinheiro.ts                 # Centavos inteiros, precisão interna, nominal x efetiva
      amortizacao.ts              # As fórmulas fechadas de SAC e PRICE, e os reversos
      cronograma.ts               # O laço mensal na ordem oficial (indexador -> juros -> ...)
      indexador.ts                # TR, IPCA, prefixado — e cenário x índice observado
      seguros.ts                  # MIP por faixa etária e pactuação, DFI, tarifa
      proponentes.ts              # Composição de renda e a idade que manda
      regras.ts / regrasPadrao.ts # Produtos e parâmetros versionados, com procedência
      elegibilidade.ts            # Enquadramento estimado, quatro situações
      motor.ts                    # simular(entrada, regras) -> resultado + trace
      reverso.ts                  # Poder de compra por busca binária
      cenarios.ts                 # Comparador de SAC x PRICE e prazos
      ponte.ts                    # A tradução para o simulador de poupança
      relatorio.ts                # PDF e resumo para WhatsApp
    pdf/imprimir.ts               # Impressão na web, compartilhada pelos dois relatórios
  lib/                              # Cliente Supabase, env, máscaras, storage, scanner
supabase/
  migrations/0001_init.sql                 # Schema base (profiles, subscriptions, RLS)
  migrations/0002_plans_and_storage.sql    # Planos + Storage com quota
  migrations/0003_cadastros.sql            # Empresas e empreendimentos
  migrations/0004_profile_fields.sql       # Imobiliária e CNPJ no perfil
  migrations/0005_regras_negocio.sql       # Regras de negócio + correspondentes + gerente imob
  functions/                               # Edge Functions (Stripe x3, scan-document, delete-account)
docs/STRIPE_PLANOS.md               # Os 3 planos no Stripe, Supabase e Vercel — e como mudar um preço
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

Métodos suportados: **email/senha**, **Google OAuth** e **Apple OAuth**. Toda a lógica de auth fica atrás da interface `AuthRepository` (`src/data/repositories.ts`), implementada por `SupabaseAuthRepository`.

### Cadastro (`signup.tsx`)

Valida nome/email/senha (senha ≥ 6 caracteres) e chama `signUp`. Se o projeto Supabase exigir confirmação de email, `supabase.auth.signUp` retorna um usuário **sem sessão** — nesse caso a tela mostra "Enviamos um email de confirmação..." e manda o usuário para o login. Se a sessão já vier pronta (confirmação desativada no projeto), vai direto para `/` (que redireciona conforme assinatura).

### Login (`login.tsx`)

Email/senha padrão, ou botão Google (`signInWithGoogle`):
- **Web**: redirect completo do navegador via `supabase.auth.signInWithOAuth`.
- **Nativo**: abre uma sessão de navegador in-app (`expo-web-browser`) com `skipBrowserRedirect:true`, extrai `access_token`/`refresh_token` da URL de retorno e chama `supabase.auth.setSession(...)` manualmente.

### Login com a Apple

A Apple **exige** este login em todo app que ofereça login social de terceiros (regra 4.8) — ou
seja, ter o Google já obriga a ter o da Apple. Ele usa exatamente o mesmo caminho do Google:
`signInWithProvider('apple', ...)`, com o mesmo tratamento de retorno de token. Duplicar o fluxo
significaria manter duas cópias do trecho mais delicado do login (o retorno pelo navegador do
sistema, no celular).

Fica disponível também na web, para o corretor entrar do mesmo jeito nos dois lugares. O
`AppleButton` é o único botão do app que **ignora o tema de propósito**: a Apple publica regras de
aparência para ele (fundo preto sólido, a maçã junto do texto, sem cor de marca própria) e a
revisão confere.

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

`AuthProvider` expõe: `user`, `initializing`, `signIn`, `signUp`, `signInWithGoogle`, `sendPasswordReset`, `signOut` e `deleteAccount`.

### Excluir a conta pelo app (Ajustes → Excluir conta)

A App Store **rejeita automaticamente** app que deixa criar conta lá dentro mas não deixa excluir lá dentro — mandar o corretor escrever para o suporte não conta. Loja à parte, é o que a LGPD espera.

O app não consegue apagar o próprio usuário de `auth.users` (isso é operação de administrador, e a chave que permite isso jamais pode estar no celular). Por isso a exclusão mora no Edge Function **`delete-account`**, atrás de um login válido, e a ordem das etapas importa:

1. **Cancela a assinatura no Stripe.** Se o usuário sumisse primeiro, o cartão continuaria sendo cobrado por uma conta que não existe mais — e sem ninguém para reclamar, porque o login já teria sumido.
2. **Apaga os arquivos do Storage** (`uploads/<user_id>/...`, percorrendo as subpastas). Eles **não** somem junto com o usuário: ficariam ocupando espaço e custo para sempre.
3. **Apaga o usuário.** Todas as tabelas do app têm `on delete cascade` em `auth.users`, então leads, simulações, vendas e comissões vão junto.

Dois detalhes que parecem miudeza e não são:

- O function cria **dois clientes**: um com o token do corretor, só para descobrir _quem_ está pedindo (o `user_id` nunca vem do corpo da requisição — senão qualquer pessoa logada mandaria apagar a conta de outra), e um **service role puro**, sem `Authorization` por cima. Se o token do corretor ficasse sobre a credencial de administrador, a API de exclusão recusaria o pedido.
- A palavra **`EXCLUIR`** digitada na tela é conferida também no servidor. A tela usa isso para obrigar o corretor a parar e ler (é irreversível); o servidor usa para não apagar nada por uma chamada solta.

> Ao publicar, o `delete-account` precisa dos mesmos segredos das funções de billing (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`).

---

## 💳 Assinatura / Paywall / Stripe

### Planos (`src/features/plans.ts`)

| Plano | Preço | O que acrescenta |
| --- | --- | --- |
| **Start** | R$ 29,90/mês | Simulador, proposta em PDF, leads, prospecção, calendário, material de venda, cadastros, captação |
| **Intermed** | R$ 49,90/mês | Tudo do Start **+ vendas realizadas + controle de comissão** |
| **Pro** | R$ 89,90/mês | Tudo do Intermed **+ a LIA** |

**A LIA é o que justifica o topo da escada** — é o único recurso exclusivo do Pro, e o degrau de
Intermed para Pro custa R$ 40.

> **Armazenamento não é atributo de plano e não aparece em lugar nenhum do produto.** Nem no
> paywall, nem na landing, nem em Ajustes, nem no material de venda. `storageLimitBytes` continua
> existindo *no código* porque é ele que o trigger `enforce_storage_quota` usa no banco para
> recusar upload acima do limite — é uma **trava de custo interna**, não uma linha de propaganda.
> Anunciar gigabyte convida o corretor a usar o POUP como nuvem de arquivos, que é exatamente o uso
> que dá prejuízo. O que ele vê na tela de material é o teto **por arquivo**; se a cota da conta
> for estourada, a mensagem vem do banco no momento do erro.

> ⚠️ Os limites de armazenamento estão **duplicados** em dois lugares: `src/features/plans.ts` e `PLAN_LIMITS` dentro do edge function `stripe-webhook/index.ts` (que é o valor realmente gravado no banco). Se mudar um valor, mude os dois.

#### O bloqueio aponta o plano mais barato que resolve

Com dois planos, "assine o Pro" era sempre a resposta certa. Com três, virou a resposta errada na
maioria das vezes: quem está no Start e esbarrou em **Vendas** precisa do *Intermed* — mandá-lo para
o Pro é pedir R$ 30 a mais do que o problema dele custa.

`planoMinimoPara(feature)` deriva o plano a partir da funcionalidade (`PLAN_ORDER` está em ordem de
preço justamente para essa busca), e o `ProFeatureLock` recebe a `feature` que o corretor tentou
usar. A lista mostrada é **o que aquele plano acrescenta ao que ele já tem** — não a lista inteira,
que repetiria o que ele usa hoje. Nada é escrito à mão, então acrescentar um plano no meio não deixa
a tela mentindo.

#### A LIA some inteira fora do Pro

`src/components/lia/Lia.tsx` devolve `null` quando `canUse('lia')` é falso — o botão flutuante nem
chega a existir. É a diferença entre vender e importunar: quem está no Start ou no Intermed já vê a
LIA na tela de planos, com preço e descrição; repetir isso num botão que acompanha o corretor por
todas as telas seria propaganda perseguindo quem já disse não.

Durante o **teste gratuito** `canUse` devolve `true` para tudo, inclusive a LIA. É de propósito: é
assim que o corretor conhece o topo da escada e decide assinar por causa dele.

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

## 🗂️ Catálogo do sistema (empresas pré-cadastradas pelo admin)

O admin do POUP pré-configura construtoras — regra de comissão, campanhas, empreendimentos, material de venda e foto redonda — e o corretor **adota** com um toque, em vez de cadastrar tudo do zero. Fica em **Cadastros → Empresas → aba "Catálogo do sistema"**; o painel do admin fica em **Configurações → Administração → Catálogo do sistema**.

### A decisão que sustenta tudo: vínculo, não cópia

Adotar **não duplica dados** na conta do corretor. Cria uma linha em `company_adoptions` e a leitura dele passa a alcançar a **mesma** linha da empresa do admin.

É isso — e só isso — que faz toda atualização do admin refletir automaticamente em quem já adotou: regra de comissão corrigida, empreendimento novo, material atualizado. Se fosse cópia, cada correção exigiria reimportar em N contas, e as contas divergiriam com o tempo.

O que é do corretor continua dele: **simulações, vendas e comissões já lançadas guardam os valores em snapshot** e não são reescritas quando a regra muda depois. Mudar a regra afeta o que vier a partir dali, nunca o histórico.

### Modelo

| Coisa | Onde |
| --- | --- |
| A empresa é do catálogo | `companies.is_catalog = true`, `user_id` = o admin que criou |
| Foto redonda | `companies.photo_url` / `developments.photo_url` → bucket **público** `catalog` |
| O vínculo | `company_adoptions (user_id, company_id)`, único no par |
| "É do catálogo?" nas tabelas filhas | derivado da empresa pelas funções `is_catalog_company()` / `is_own_private_company()` — não há coluna repetida |

`Company.isCatalog` e `Development.isCatalog` chegam à UI para ela tratar o registro como **somente leitura** (sem editar/excluir, com "remover da minha lista" no lugar).

### Como as listas ficam

`db.companies.list()` e `db.developments.list()` devolvem a **união**: o que o corretor cadastrou + o que ele adotou. São duas consultas de propósito — as condições vivem em tabelas diferentes e, no PostgREST, **filtro em tabela embutida não restringe a linha pai** (viria o catálogo inteiro).

Empresa do catálogo **não** entra na lista de ninguém só por ser do admin: mesmo o admin precisa adotar para usar no Simulador. Sem isso o catálogo invadiria a conta dele sem consentimento e apareceria duplicado depois de adotar.

### Segurança (RLS, migration `0024_catalog.sql`)

- **Vitrine navegável**: qualquer autenticado *lê* as empresas do catálogo antes de adotar; escrever nelas exige `is_app_admin()`.
- **Trava anti-escalação**: um corretor comum não pode marcar `is_catalog = true` na empresa dele e publicá-la para toda a base. Duas coisas garantem isso: a policy antiga `companies_all_own` foi **removida** (policies permissivas se somam com `OR` — enquanto ela existisse, a trava seria decoração), e o `UPDATE` repete a condição em `using` **e** `with check`, para o estado final da linha também ser barrado.
- **Brecha antiga fechada de carona**: as tabelas filhas exigiam apenas que a *linha* fosse sua, não que a *empresa* fosse — dava para pendurar empreendimento ou regra de comissão na empresa privada de outro corretor. Agora a escrita exige `is_own_private_company(company_id)`.

### O catálogo sobrevive à exclusão de quem o cadastrou (migration `0026`)

Isto nasceu de um acidente real: o dono do app excluiu a própria conta pelo botão "Excluir conta" e **o catálogo inteiro foi junto** — construtoras, empreendimentos, correspondentes, regras de comissão e as adoções de todos os outros corretores.

A causa é o desenho original dos cadastros. O catálogo mora nas **mesmas tabelas** dos cadastros privados, com `is_catalog = true` e `user_id` apontando para o admin que cadastrou. E todas elas nasceram com `user_id ... references auth.users (id) on delete cascade`. Um `delete` em `auth.users` levou o acervo do produto.

**Trocar o `cascade` por `on delete set null` não resolve**, e é importante entender por quê: a chave estrangeira é cega — não sabe distinguir linha de catálogo de linha privada. Com `set null` na tabela inteira, o corretor comum que excluísse a conta deixaria para trás as empresas privadas dele como linhas órfãs, invisíveis e eternas. Isso é lixo de dados e contraria o que a exclusão de conta promete (e o que a LGPD e a App Store cobram).

A regra que se quer é **condicional** — linha do catálogo se solta, linha privada vai embora — e chave estrangeira não expressa condição. Gatilho expressa:

1. `user_id` passa a **aceitar** nulo nessas tabelas (só aceitar; o app continua sempre gravando o dono).
2. Um gatilho `BEFORE DELETE` em `auth.users` (`detach_catalog_from_user`) põe `user_id = null` **só** nas linhas de empresa do catálogo.
3. O cascade roda em seguida e não encontra mais nada do catálogo — nulo não casa com o id excluído. As linhas privadas, que o gatilho não tocou, somem normalmente.

**Nada no aplicativo precisou mudar**, e a razão é a RLS da `0024`: o caminho do catálogo nunca dependeu de `user_id`. Leitura é `is_catalog` / `is_catalog_company()`, escrita é `is_app_admin()`. Com `user_id` nulo o primeiro lado do `OR` dá falso e o segundo — o do catálogo — continua valendo igual.

Dois detalhes que a migration precisou resolver:

- **`company_materials` trocou de chave primária.** `user_id` fazia parte da PK composta, e coluna de PK é obrigatoriamente `NOT NULL` — o link do material do catálogo continuaria morrendo com o admin. Agora a PK é um `id` próprio e `(user_id, company_id)` virou **índice único**. O `onConflict: 'user_id,company_id'` do `SupabaseMaterialRepository` infere por índice único, não por PK, então o upsert continua igual.
- **`companies` ganhou o check `companies_owner_required`** (`is_catalog or user_id is not null`): o passo 1 abriu a porta para nulo na tabela inteira, e este check a fecha de novo para tudo que não é catálogo.

Em **defesa em profundidade**, a Edge Function `delete-account` passou a **recusar** a exclusão de uma conta que esteja em `app_admins`. Mesmo com o catálogo salvo, apagar a conta apagaria a linha de admin e deixaria o app sem ninguém capaz de editar o catálogo. Não é porta trancada, é ordem: tire o admin primeiro (`delete from public.app_admins where user_id = '...'`), exclua depois. Corretor nenhum é afetado — `app_admins` só tem o dono do app.

> `supabase/admin_recuperar_acesso.sql` é o utilitário para promover uma conta a admin de novo. Ele **não recupera dado nenhum**: dado já apagado só volta por **Supabase → Database → Backups**, e backup tem janela de retenção.

### Material de venda e cota

Material do catálogo mora no bucket `uploads` sob a raiz **`catalog/`** (em vez de `<userId>/`): admin escreve, qualquer autenticado lê. A raiz é escolhida por `materialRoot()` (`src/features/catalog/material.ts`) — nunca monte esse caminho na tela.

O trigger `enforce_storage_quota()` **não cobra** upload em `catalog/` de ninguém: cobrar do admin faria o catálogo crescer às custas do plano de uma pessoa e travaria a publicação quando ele estourasse.

### Foto no PDF

A foto da construtora sai no topo da proposta, ao lado da logo do POUP. O bucket é público porque o PDF é montado **no cliente**: a imagem é buscada e convertida em data URI antes de imprimir. Com timeout curto e `try/catch` — proposta sem foto é aceitável, proposta que não gera não é.

---

## 🏦 Simulador de financiamento habitacional

Rotas em `app/(app)/financiamento/`, motor em `src/features/financiamento/`,
banco na migration `0027_financiamento.sql`.

O atalho **Simulador** abre um garfo (`/(app)/simuladores`) com dois caminhos,
porque são duas perguntas de momentos diferentes da venda:

| | pergunta | quando |
|---|---|---|
| **Financiamento** | quanto o BANCO empresta, qual a parcela, se enquadra | antes, quando o cliente ainda decide se consegue comprar |
| **Poupança** | como o saldo é pago à CONSTRUTORA | depois, quando ele já decidiu |

### A primeira pergunta é o BANCO — e é a única decisão de produto

Dentro do simulador de financiamento a tela não pergunta "qual linha?", nem
"SAC ou PRICE?", nem "qual o regime da taxa?". Ela pergunta **em qual banco você
vai levar essa proposta**, com a Caixa em primeiro e um selo de identificação
para cada instituição (`src/components/BancoMarca.tsx`).

Escolhido o banco, `escolherBanco()` aplica a linha dele — e com a linha vêm
taxa, quota máxima, prazo máximo, teto de renda, comprometimento, indexador e
sistema de amortização. **Nada disso aparece na tela.** Sobram seis campos, que
são os que o cadastro não tem como saber:

> valor do imóvel · entrada · FGTS · renda familiar · idade · prazo

Todo o resto (cliente, empreendimento, unidade, subsídio, 2º proponente,
avaliação, carência, cenário de indexador) continua existindo atrás de **"Mais
detalhes"**.

O vínculo entre banco e regra é o campo `bancoId` do produto, em `regras.ts`.
`bancoId: null` significa "serve a qualquer instituição" — é o caso de
**Condições informadas**, em que quem fornece os números é o correspondente
bancário.

> **Por que só a Caixa chega com tabela.** Não temos as tabelas do BB, do Itaú,
> do Bradesco e do Santander, e a §74 do manual proíbe inventar taxa, quota ou
> prazo. Eles aparecem na lista porque o corretor trabalha com eles de verdade;
> ao escolhê-los, o simulador vai direto para "informe a condição aprovada". O
> motor é o mesmo — muda só de onde vêm os números. No dia em que a tabela de
> qualquer um for cadastrada em `VersaoRegras` com o `bancoId` apontando para
> ele, passa a ter linha própria **sem uma linha de código nova**.

> **E até lá, eles só aparecem para o administrador.** Um banco listado mas
> sem tabela cadastrada é uma porta que ainda não leva a lugar nenhum — mostrar
> isso a todo o time seria confuso sem necessidade. `bancosLiberados`, um campo
> a mais na versão de regras, guarda quais bancos além da Caixa já foram
> liberados; `bancoVisivelParaCorretor(bancoId, liberados, admin)` decide, e o
> administrador liga isso com um botão por banco na tela de Regras de
> financiamento — sem passar pelo formulário pesado de publicação (fonte, URL,
> confirmação de oficialidade), porque visibilidade não é uma condição
> financeira. A Caixa e "Outro banco" nunca precisam ser liberados: são sempre
> visíveis, por motivos diferentes — a Caixa por ter tabela pronta, "Outro
> banco" por ser o escape genérico de condição informada.

> **Sobre as logomarcas.** `BancoMarca` tenta três caminhos, nesta ordem: o
> **arquivo oficial** (mapa `LOGOS`), a **marca desenhada em SVG** e, por
> último, um **ladrilho com o nome** na cor institucional. Só a Caixa tem marca
> desenhada — o símbolo dela é geometria exata (quatro paralelogramos formando
> um X) e sai fiel em qualquer tamanho. As do Bradesco e do Santander têm traço
> orgânico e a do Banco do Brasil é um entrelaçado complexo: reproduzi-las à mão
> sairia parecido e errado, o que identifica pior que o ladrilho. Para elas o
> caminho é o arquivo — instruções em `assets/bancos/LEIA-ME.md`. O mapa `LOGOS`
> nasce vazio porque `require` de arquivo inexistente derruba o build inteiro.

### A entrada não é pergunta — é resposta

O simulador de financiamento existe para responder **quanto o banco empresta**.
O que sobra — valor do imóvel menos financiamento, menos FGTS, menos subsídio —
**é** a entrada, e numa venda de construtora ela é exatamente a **poupança** que
será parcelada em ato, mensais, semestrais e anuais. Pedir a entrada ao corretor
era pedir a resposta junto com a pergunta.

Então o campo nasce **vazio**, e vazio significa "calcule para mim":

```
financiado  = MIN(quota · valor, teto do produto, capacidade de pagamento)
poupança    = valor base − financiado − FGTS − subsídio
```

O corretor só digita quando o cliente **quer dar mais** que o mínimo — e aí o
financiamento encolhe na mesma medida, ao vivo. Digitar menos que o mínimo
continua reprovando, com o valor que falta.

> **Zero digitado não é o mesmo que vazio.** `R$ 0,00` é o corretor afirmando que
> não há entrada nenhuma, e o motor obedece. Vazio é ele perguntando.

A capacidade de pagamento entra como teto **apenas no modo automático**, e a
diferença não é de gosto. Com entrada informada, o financiamento é o que falta
para fechar o negócio: não cabendo na renda, isso é uma **reprovação**, e a tela
precisa dizer. No automático a pergunta é "até quanto o banco empresta?" — a
renda é um teto ao lado da quota, e nunca há excesso, porque a entrada se ajusta.
`restricaoQueMandou` diz qual dos tetos decidiu.

A busca de "quanto cabe na renda" mora em `capacidade.ts`, usada pelas **duas**
telas que fazem essa pergunta (poder de compra e entrada automática). Ela precisa
ser busca binária e não fórmula: a prestação inclui o MIP, que é taxa sobre o
saldo devedor — a incógnita aparece dos dois lados da equação.

### A ponte leva tudo que já se sabe

"Levar para o simulador de poupança" atravessa imóvel, unidade, valor, o que o
banco cobre (financiado + subsídio + **FGTS usado**), a **parcela da CEF** e os
**proponentes com renda**. Cada campo que não atravessa é um campo que o corretor
digita de novo com o cliente esperando.

O saldo a parcelar **não** atravessa, e é de propósito: `computePoupanca` do
outro lado faz `unidade − financiado − subsídio − FGTS`, que é exatamente a
`entradaCalculada` daqui. Mandando as quatro parcelas certas, a conta bate
sozinha — mandar o total junto criaria uma quinta fonte de verdade para o mesmo
número.

O que continua **não** atravessando: a distribuição do fluxo (quanto no ato,
quantas mensais), o vínculo do segundo proponente (cônjuge, parente, fiador) e o
parcelamento da taxa da CEF. Nenhum dos três é conhecido pelo financiamento, e
chutá-los daria ao corretor campos a desfazer — o retrabalho que a ponte existe
para eliminar.

> **Salvar é tentativa; atravessar não é.** `aoLevarParaPoupanca` monta o
> prefill do `form` e do resultado que já estão na tela — nunca do que foi
> gravado no banco. `salvar()` continua sendo chamado, porque é ele que liga a
> simulação ao histórico do cliente, mas uma falha ali (rede fora, uma
> migração ainda não aplicada) vira só um aviso. Antes, o método dependia do
> salvamento ter sucesso para montar o prefill: qualquer erro do lado do banco
> jogava fora tudo o que o corretor tinha acabado de preencher — exatamente o
> retrabalho que a ponte existe para eliminar.

### A faixa acompanha a renda

Digitada a renda familiar, o simulador mostra na hora a faixa em que ela se
enquadra — e **troca a linha sozinho** para ela. É o que o corretor faria à mão,
e é o que impede apresentar a condição da Faixa 3 a quem tem direito à Faixa 1.

Havendo mais de uma faixa compatível, ganha a **mais estreita**: entre uma faixa
"até R$ 4.700" e uma sem teto, quem ganha R$ 4.000 está na primeira, que é a que
traz o subsídio e a taxa menor. E uma faixa **sem parâmetro cadastrado nunca é
apontada** — mandar o corretor para uma linha que o motor não calcula seria uma
tela vazia sem explicação.

### Quem configura é o administrador. O corretor, só em "Outro banco"

Taxa, quota, comprometimento, carência e cenário de indexador **não são campos
de formulário**: são cadastro versionado, com fonte, data de verificação e
auditoria. Deixá-los editáveis na simulação permitiria apresentar como condição
do banco um número que o próprio corretor digitou — que é exatamente o que a
versão de regras existe para impedir.

Então eles aparecem para duas pessoas: o **administrador**, em qualquer banco, e
o corretor quando escolhe **"Outro banco"** — onde não há tabela para contrariar
e informar a condição do correspondente é o comportamento previsto. Um banco
listado mas ainda sem cadastro diz isso na cara, e aponta o caminho.

### O que entrou nesta prestação, e o que não entrou

Um resultado não é só um número: é o número mais a lista honesta do que ele
contém. Quando a tábua do MIP não está cadastrada, a prestação sai **menor que a
real** — e o corretor precisa saber disso antes de mandar o PDF, não depois de o
banco apresentar a proposta. Daí `componentes.incluidos` e
`componentes.naoIncluidos`, em português, na tela e no PDF.

Linha indexada calculada sem o índice ganha status próprio (`SEM_CORRECAO`):
não é "falta um parâmetro", é a tabela inteira saindo abaixo do real, mês a mês,
com o erro crescendo junto com o prazo.

### "Oficial" é conquistado, não digitado

Uma versão de regras só se apresenta como condição oficial com os **quatro**:
fonte, URL, data de verificação e a confirmação explícita de quem publicou.
Faltando qualquer um, ela é `estimativa` — e `confiabilidadeDaVersao()` reconfere
isso na leitura, então nem um registro gravado com o rótulo errado consegue
passar. Digitar números não torna nada oficial.

### As três decisões que não são número

Além dos valores, cada linha cadastra:

| decisão | por que não pode ser implícita |
|---|---|
| **Regime da taxa** (nominal/efetiva) | 10% nominais = 0,8333% a.m.; 10% efetivos = 0,7974% a.m. Em 35 anos, mais de R$ 18 mil |
| **Base do comprometimento** | "até 30% da renda" não diz **de qual prestação** — com ou sem seguros, a mesma operação passa ou não passa |
| **Tratamento da carência** | capitalizar os juros faz o saldo **subir**; pagá-los mês a mês o mantém parado |

A entrada mínima também é resolvida, e não lida crua: vale sempre o **maior**
entre a cadastrada e a que a quota impõe. Entrada mínima de 10% com quota de 80%
é, na prática, entrada de 20% — usar o campo isolado aprovaria um negócio que a
própria quota reprova.

### O motor segue o pipeline do manual, não uma fórmula única

O módulo foi construído sobre um **manual técnico** que especifica o motor de
simulação: entradas, ordem do cálculo, fórmulas, o que parametrizar e — a parte
mais importante — **o que não inventar**. A arquitetura é a que ele exige:

```
DADOS → REGRAS → ENQUADRAMENTO → CÁLCULO → VALIDAÇÃO → RESULTADO
```

e nunca `DADOS → FÓRMULA ÚNICA → PARCELA`. Daí os módulos com uma
responsabilidade cada: `indexador.ts`, `seguros.ts`, `proponentes.ts`,
`cronograma.ts`, `elegibilidade.ts`. Trocar a apólice do MIP não obriga ninguém
a mexer no laço de amortização.

`simular(entrada, regras)` é **função pura** — sem React, sem Supabase, sem
navegador. Três consequências práticas:

1. **360 testes rodam em Node puro** (`npm run testar:financiamento`), seguindo
   a lista de cenários que o próprio manual especifica (§76 a §93).
2. **A LIA pode chamá-lo.** Ela interpreta o número; nunca o produz. É a
   diferença entre um assistente e um chute bem escrito.
3. **Outro banco entra sem tela mudar** — `FinancingProvider` é a porta.

### A ordem do cálculo mensal é a especificação, literalmente

```
saldo inicial → aplica indexador → saldo atualizado → juros →
amortização → novo saldo → MIP → DFI → tarifa → prestação total
```

**A ordem muda o resultado.** Os juros incidem sobre o saldo JÁ CORRIGIDO; a
inversão subestima o total pago de um contrato de 420 meses em dezenas de
milhares de reais. Há teste garantindo que os juros do mês batem com
`saldoAtualizado × taxa` e **não** com `saldoInicial × taxa`.

> **Com indexador, o encargo é recalculado todo mês.** Numa PRICE clássica a
> prestação é fixada uma vez. Com TR ou IPCA o saldo sobe, e uma prestação
> nominal congelada deixa de amortizar — o contrato terminaria com saldo enorme.
> O contrato indexado brasileiro recalcula sobre o saldo atualizado e o prazo
> remanescente. É por isso que a parcela de um financiamento com TR **sobe** ao
> longo do tempo, e é o que o corretor precisa saber explicar.

### Nominal e efetiva não são a mesma coisa

10% **nominais** ao ano viram 0,8333% ao mês e 10,47% efetivos. 10% **efetivos**
viram 0,7974% ao mês. Em 420 meses num financiamento de R$ 240 mil, a diferença
passa de **R$ 18 mil** — medida por teste.

Por isso a taxa entra no motor com o REGIME declarado (`regimeTaxa` no produto,
escolhido pelo corretor em "Condições informadas"), e a conversão é feita por
ele. Nunca por convenção implícita do código. O MCMV Classe Média está
cadastrado como **nominal**, que é como o material oficial o apresenta.

### Encargo principal ≠ prestação total

```
encargoPrincipal = amortização + juros
prestacaoTotal   = encargoPrincipal + MIP + DFI + tarifa
```

E **PRICE não significa prestação total fixa**: no prefixado o encargo principal
é constante e o MIP cai junto com o saldo, então a prestação total **diminui**;
com TR, o encargo é recalculado sobre o saldo corrigido e a prestação
**aumenta**. Os dois casos têm teste, porque os dois surpreendem o cliente.

### Precisão: centavos inteiros, e a política é do contrato

`number` é exato para inteiros até 2^53 — noventa trilhões de reais. O
cronograma trabalha internamente em centavos **com fração** (`Preciso`) e fecha
em centavos inteiros conforme a `politicaArredondamento` da versão de regras:

- **`mensal`** — fecha cada mês em centavos, e é o saldo arredondado que segue.
  É o que o boleto faz. Padrão.
- **`final`** — carrega a fração até o fim e arredonda na exibição.

Nos dois regimes o cronograma **fecha em zero**, verificado em 12, 120, 360 e
420 meses, nos dois sistemas, com e sem correção, com e sem carência.

### Seguros: a fórmula inteira, sem nenhum número

```
MIP = saldo devedor × taxa(faixa etária) × pactuação de renda   ← por proponente
DFI = valor de AVALIAÇÃO × taxa                                  ← constante
```

A tábua do MIP e a taxa do DFI vêm da **apólice da seguradora**, não da CAIXA.
Nascem pendentes, e o motor **não as inventa**: sai `null`, a prestação é
marcada como parcial, e o resultado diz o que faltou. Um MIP cobrindo só um dos
dois proponentes também vira `null` — meio-seguro parece completo e não é.

> É o §74 do manual na prática: *"NÃO: MIP = financing × 0.01 sem fonte"*.

### Múltiplos proponentes, e a idade que manda é a maior

A composição de renda é parte do produto: até quatro proponentes, cada um com
renda, idade e percentual de pactuação (que por padrão sai da proporção das
rendas, e é normalizado para 100% se o corretor digitar outra soma).

**A idade que vale para o limite de idade + prazo é a do MAIS VELHO.** Usar a
média, ou só a do titular, aprovaria na tela um caso que o banco recusa — e o
corretor só descobriria depois de o cliente escolher o apartamento.

### O valor financiado é o MENOR de várias restrições

```
valorBase  = MIN(preço de venda, avaliação)
financiado = MIN(necessário após a entrada, quota, teto do produto)
```

E o motor guarda **qual delas mandou**, porque é isso que o corretor usa: travou
na quota, ele negocia mais entrada; travou no teto, ele muda de linha.

> A quota **não reprova — ela capa.** O banco financia até o limite e o cliente
> cobre o resto. Então o que reprova é a ENTRADA, e a mensagem é *"faltam
> R$ 18.400 de entrada"*, que é acionável, em vez de *"percentual acima do
> limite"*, que não é.

### Cálculo reverso por busca binária

O MIP depende do saldo devedor, que depende do valor financiado — que é
justamente o que o poder de compra procura. É circular, e o manual (§44) manda
resolver por busca binária: chuta, monta a prestação COMPLETA, compara com o
teto, refina. Converge ao centavo em ~40 passos, e continua funcionando quando
um encargo novo entrar — o que a fórmula fechada não faz.

### Cinco classificações, e o resultado carrega a sua

`OFICIAL` · `ESTIMADO` · `INFORMADO` · `PROJEÇÃO` · `REQUER VALIDAÇÃO`.

A precedência é do mais frágil para o mais forte: escolher um cenário de TR
marca o resultado inteiro como **projeção**, porque o índice hipotético
contamina todos os números derivados dele. E faltando qualquer parâmetro, o
status é **requer validação** — mesmo com a taxa informada pelo corretor, porque
a prestação continua incompleta sem o seguro.

> **O CET tem campo e não é calculado** (§64). Ele exige todos os componentes
> contratuais — tarifas de contratação, avaliação, registro, apólices efetivas.
> Um CET incompleto é pior que nenhum: é com ele que o cliente compara bancos.

### O trace: "como o sistema chegou a este valor?"

Cada simulação carrega um `trace` — proponentes, valor base e o MIN que o
produziu, enquadramento, entrada, taxa e a conversão dela, indexador,
composição da primeira prestação, renda mínima. É o §69, e é o que permite
auditar um número seis meses depois sem ninguém precisar lembrar.

### Carência: o saldo sobe, e a tabela mostra

Durante a carência não há amortização. Pagam-se os encargos acessórios, e os
juros e a correção são **incorporados ao saldo devedor** — que por isso cresce.
A amortização começa depois, sobre um saldo maior, e a parcela sai mais alta.

A coluna de juros mostra os juros do mês **sempre**, mesmo quando não são pagos:
zerá-la esconderia justamente o custo que a carência tem. O que o cliente paga
naquele mês é o encargo principal, que na carência é zero.

### O que está cadastrado, e o que continua pendente

Semeado como **versão 2026.08**, a partir do que o manual registra das páginas
oficiais (com fonte, data de verificação e a ressalva de reconferir):

| | |
|---|---|
| MCMV Classe Média | renda até R$ 13.000 · imóvel até R$ 600.000 · entrada mínima 20% · **10% a.a. nominal** · até 35 anos |
| Comprometimento de renda | até 30% em determinadas operações |
| Prazo | até 35 anos (420 meses) |
| Limite SFH/SFI | R$ 2,25 milhões de avaliação |
| FGTS | pode compor a entrada, conforme as regras do Fundo |

Continuam **pendentes**, e o motor se recusa a inventá-los: a tábua do MIP e a
taxa do DFI (vêm da apólice), a tarifa de administração (varia por contrato), a
TR e o IPCA (Banco Central e IBGE, e projetá-los é previsão econômica), e as
taxas por faixa do MCMV 1, 2 e 3. A quota do SBPE também: o material diz que ela
*"pode chegar a 90%"* — isso é um teto, não a quota da operação, e cadastrar 90%
daria ao corretor um número que o banco não confirma.

### O cliente é o eixo — e é o que liga os dois simuladores

A simulação salva fica ligada ao **lead**. Daí o botão **"Usar no simulador de
poupança"**, que atravessa com empreendimento, valor da unidade, financiamento
aprovado, subsídio, FGTS, nome e renda já preenchidos.

A tradução mora em `financiamento/ponte.ts`, pura e testada, porque é onde as
unidades divergem: o financiamento guarda **centavos**, a poupança guarda **texto
mascarado**, e `financedValue` está em **reais**. Errar uma dessas por um fator
de cem produz uma proposta com o valor errado que ninguém percebe até o cliente
ler.

O **fluxo de pagamento não viaja** — ato, mensais, semestrais são negociação com
a construtora, e é o que o corretor vai montar na tela seguinte. Preenchê-lo com
chute o faria apagar campo por campo.

### O snapshot: a proposta de ontem não muda porque a regra de hoje mudou

`financing_simulations.rules_snapshot` guarda a **versão de regras inteira**, em
JSON, do momento da simulação. É redundante de propósito.

Guardar só o número da versão não resolveria: alguém pode editar a versão em vez
de criar outra. O snapshot é o único jeito de uma simulação de agosto continuar
sendo, para sempre, uma simulação de agosto.

### Compartilhar com o cliente

Três saídas, e cada uma tem seu momento:

- **PDF** (`relatorio.ts`) — o documento que vai para o correspondente. Sai
  recortado: primeiro ano, marcos de cinco em cinco anos e as três últimas
  parcelas. 420 linhas seriam nove páginas que ninguém lê e que fazem o corretor
  desistir de mandar pelo WhatsApp.
- **Resumo em texto** — quatro linhas para colar no chat, quando o anexo é
  atrito demais.
- **Link público** (`/simulacao/[token]`) — expira em 30 dias, pode ser revogado,
  e o token é guardado como **hash SHA-256**: vazou o banco, os links já emitidos
  continuam inúteis. A leitura é feita por Edge Function com service role, que
  devolve **só o resumo daquela simulação** — nada do painel do corretor, nada de
  renda.

> A rota mora na **raiz**, fora de `(app)`, e é obrigatório: o `(app)/_layout`
> redireciona quem não tem login para o login e quem não tem assinatura para o
> paywall. O cliente não tem nem um nem outro.

### A impressão na web é código compartilhado, e por um motivo específico

`features/pdf/imprimir.ts` saiu de `simulador/proposal.ts` quando o segundo
relatório precisou dela. Aquele arquivo é **cicatriz**: a proposta já saiu em
branco duas vezes, e cada correção está numa linha específica — `opacity: 1` no
iframe, a conferência de altura antes de imprimir, a reescrita via
`document.write`, a aba nova como último recurso. Copiar seria assinar embaixo
de repetir os mesmos dois bugs.

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

## 🎧 LIA — a assistente que ouve a negociação

> **Estado:** primeira funcionalidade entregue (*Simulação de poupança*), funcionando **na web**.
> A escuta ao vivo depende de transcrição de voz, que o app nativo ainda não traz — ver
> "Onde funciona hoje" abaixo.

A LIA é uma assistente de corretagem que **só escuta**. Ela não fala, não interrompe e não
sugere: durante a negociação ela ouve o corretor e o cliente, entende o que foi dito e vai
preenchendo a simulação. No fim, o simulador abre pronto.

O botão fica flutuando no canto inferior direito, em qualquer tela de `(app)`. Um toque abre o
leque de funcionalidades — hoje **três**: *Simulação de poupança*, *Material de venda* e *Agendar compromisso*.
Cada nova entra acrescentando uma linha a `FUNCIONALIDADES`, sem redesenhar nada.

### O ciclo

```
ouve  →  junta o que foi dito  →  na pausa de 3 s, entende  →  mostra o que falta  →  volta a ouvir
```

**O silêncio é o gatilho, e ele serve a dois propósitos ao mesmo tempo.** Chamar o modelo a cada
palavra seria caro, lento e pior: metade das frases chega pela metade, e uma frase pela metade
vira um valor errado que depois pisca na tela ao ser desfeito. A pausa é o momento natural — numa
negociação ela significa "acabei de dizer uma coisa". E é exatamente o instante em que o corretor
tem atenção sobrando para olhar a tela e ver o que ainda falta perguntar. Voltou a falar, a
cobrança some sozinha.

### As três decisões que sustentam o resto

**1. A conversa inteira vai ao modelo, toda vez — e a resposta é o estado FINAL, não um delta.**

Existe uma frase que aparece em toda negociação de verdade:

> *"Na verdade não são dois e oitocentos, são três e meio."*

Com um "patch" incremental, seria preciso inventar regras de retratação: como saber que "três e
meio" está substituindo a renda, e não sendo o valor da parcela? Com a conversa inteira em mãos,
a pergunta desaparece — o modelo lê a correção no contexto dela. O último valor dito ganha porque
o modelo *vê* que ele veio depois. Reenviar a conversa custa alguns milhares de tokens; errar a
renda do cliente custa a venda.

**2. Cada campo mostra o trecho da conversa que o produziu.**

Não é enfeite. Ninguém confia numa caixa-preta que escreve `R$ 2.800,00` sem dizer de onde tirou.
Vendo *"ela ganha dois e oitocentos"* embaixo do valor, o corretor confere num piscar de olhos —
e, quando estiver errado, sabe na hora **por que** errou. É a diferença entre uma ferramenta que
ele usa de olho fechado numa reunião e uma que ele abandona na segunda vez que ela erra sem
explicação.

**3. A empresa não é perguntada: ela é deduzida.**

O catálogo do corretor (empreendimentos + correspondentes) vai junto em cada chamada. Ouvir
*"no Vila Nova"* preenche empreendimento **e construtora**, sem ninguém ter dito o nome da
construtora. É o truque mais barato do projeto e o que mais faz a LIA parecer que já sabe das
coisas. O gerente vem de carona: sai do cadastro do empreendimento.

**4. O modelo devolve NOME; quem acha o cadastro é o aplicativo.**

A primeira versão mandava a lista com os UUIDs e pedia o ID de volta. Errado por dois motivos:
copiar 36 caracteres é a tarefa que um modelo faz *pior* (um dígito trocado vira campo fantasma:
a tela diz "capturado" e o simulador não acha nada), e cada linha `id — nome — construtora` custa
~25 tokens contra ~4 só do nome — em **toda** chamada.

Hoje o modelo devolve o nome e `src/features/lia/catalogo.ts` casa com o cadastro **localmente**,
com a mesma `casarPorVoz` do material de vendas: igualdade → contido → palavra em comum →
distância de edição contra o nome inteiro *e cada palavra dele*. É isso que faz *"connect"* achar
**"Village Connect I"**. Nome que não casa com ninguém — ou que casa com dois — **não vira campo**:
o corretor recebe uma frase dizendo o que foi ouvido. Um empreendimento errado arrasta empresa,
gerente, comissão e prazo máximo junto; chutar ali é caro demais.

### `src/features/lia/campos.ts` é a fonte única da verdade

A lista de campos é lida por três lugares que, em quase todo projeto, divergem com o tempo: o
**prompt** enviado ao modelo, a **tela** e o **preenchimento do simulador**. Aqui a Edge Function
**não tem lista própria** — ela recebe a lista pronta no corpo da requisição e monta o prompt a
partir dela.

Consequência prática: para a LIA passar a ouvir um campo novo, acrescente **uma linha** nesse
arquivo. Sem mexer no prompt, sem republicar Edge Function, sem tocar na tela.

Cada campo carrega um `comoAparece` — que não é a definição do campo, e sim **como ele aparece
numa conversa de verdade**. É o que separa "extrair renda" de entender que *"ela ganha três e
meio"* são R$ 3.500,00 e *"um salário"* são R$ 1.518,00.

### O que o modelo devolve nunca é gravado direto

Tudo volta como texto — é o formato que ele acerta. A conversão para o que cada campo do
simulador espera é local, determinística e **descarta em silêncio o que não converte**: um ID de
empreendimento que não existe no catálogo, um CPF com menos de 11 dígitos, um dia de vencimento
45. Preencher o simulador com lixo é pior que deixar o campo vazio, porque o corretor confia no
que já está preenchido e não confere.

### Concorrência: uma chamada por vez, e a última ganha

A pessoa volta a falar enquanto a rodada anterior ainda está no ar. Se as respostas voltassem
fora de ordem, uma análise velha sobrescreveria uma nova — e o corretor veria o valor corrigido
virar de novo o valor antigo, sozinho, na frente do cliente. Cada rodada leva um número; resposta
com número menor que a última aplicada é descartada.

### A meta é o PDF, não a simulação

O objetivo declarado é o corretor falar e, no fim, cair **direto no botão de gerar a proposta**.
Isso mudou o que conta como "essencial": não é mais o que o simulador precisa para abrir, é o que o
**PDF** precisa para sair correto. São 14 campos.

O que faltava e entrou:

| campo | por que |
|---|---|
| **Data do ato** | o campo mais subestimado da proposta — `buildFlow` ancora **todo** o cronograma nele. Sem ele, o primeiro vencimento das mensais é nulo, e com ele caem as datas das semestrais e das anuais: o PDF sai inteiro com "—" na coluna de vencimento. Uma proposta que parece pronta e não serve. |
| **Ato, qtd. de mensais, dia do vencimento** | são o fluxo de pagamento. Sem eles não há parcela nem cronograma. |
| **Financiamento aprovado** | entra na conta da poupança; sem ele o saldo a parcelar sai errado. |
| **CPF e telefone do cliente** | vão impressos na proposta. |
| **Taxa CEF e parcela CEF** | também vão impressos (opcionais: têm padrão). |

E o destino passou a depender do resultado: **completo → `/simulador/fluxo`**, que é a tela do botão
"Gerar proposta"; **incompleto → `/simulador`**, a primeira etapa. A assimetria é de propósito —
faltando dado, o corretor *precisa* passar pelo formulário, e cair no fim o obrigaria a voltar
procurando o buraco.

### Datas faladas, e o fuso que estraga tudo

`atoDataVencimento` sai do modelo em `AAAA-MM-DD`, resolvido contra a data de **hoje**. E essa data
vai do aparelho para a Edge Function, em vez de ser lida no servidor: a função roda em UTC e, no
Brasil, das 21h à meia-noite, o servidor já virou o dia. "Dia 10" viraria um mês inteiro de
diferença no vencimento da entrada — num documento que o cliente assina.

Na volta, a conversão para exibição também não passa por `Date`: `new Date('2026-03-10')` é
meia-noite **UTC** e, no fuso do Brasil, volta um dia atrás.

### Duas pausas, porque são duas coisas diferentes

| | quando | o que faz |
|---|---|---|
| **1,2 s** | a frase acabou | **interpreta** |
| **3 s** | a conversa parou | **cobra** o que falta |

Interpretar é o que faz a LIA parecer rápida, e esperar três segundos para *começar a pensar*
significa ainda estar processando a frase anterior quando a próxima chegar. Com 1,2 s ela trabalha
no vão entre as frases — tempo que já existia e estava sendo desperdiçado. Cobrar continua nos três
segundos: a lista piscando a cada respiração, no canto do olho de quem negocia, seria pior que não
cobrar.

O que segura o custo é um **piso de 3,5 s entre chamadas**. Sem ele, uma conversa em frases curtas
("sim" · "certo" · "isso") dispararia uma análise por segundo. E quando a vez ainda não chegou, a
rodada **não é descartada** — fica agendada para o instante em que o intervalo fecha. Descartar
faria a LIA perder uma frase inteira até a próxima pausa. "Reler agora" fura a fila, porque aí é o
corretor pedindo, e ele não deve esperar por uma regra de custo.

### Ruído: o que ela precisa ignorar

O microfone está aberto numa sala, e capta o café, o trânsito, a TV, o telefone tocando, o corretor
atendendo uma ligação sobre **outro** cliente, e pedaços de frase que o reconhecimento inventou.

A regra no prompt é uma só: **um número só vira campo quando a frase em volta mostra de que campo
ele é.** "Duzentos e dez" solto não é o valor do imóvel. E na dúvida entre registrar com contexto
fraco e não registrar, não registra — um campo vazio o corretor preenche em cinco segundos; um campo
errado ele manda para o cliente sem perceber.

Uma limitação honesta: a Web Speech API **não separa quem fala**. Não há como distinguir o cliente
do rádio ligado ao fundo por voz — só por contexto, que é o que o prompt faz.

### Material de venda por voz — o mini-chat

A segunda habilidade da LIA:

```
LIA:      Qual empreendimento você quer?
corretor: "quero o connect"
LIA:      Connect. E o que você deseja?   [Book] [Posts] [Plantas]
corretor: "posts"
LIA:      Posts. Aqui está:   ▢ ▢ ▢
```

**Isto não usa o modelo.** Não há nada para interpretar: existe uma lista fechada de nomes na tela e
o corretor falou um deles. Mandar isso para um modelo custaria dinheiro e — o que importa mais — um
segundo de espera num fluxo cujo valor inteiro é ser mais rápido que tocar em três botões. O
casamento é local e instantâneo (`materialPorVoz.ts`), e o problema é fácil: comparar uma fala curta
com cinco nomes conhecidos não é entender uma negociação.

O casamento aguenta o que a transcrição faz com nome próprio, em cinco passos, do mais seguro ao
mais tolerante: igualdade → um contém o outro → palavra significativa em comum → distância de edição
contra o nome **e contra cada palavra dele**. Esse último detalhe é o que faz "conect" achar
"Residencial Connect": contra o nome inteiro a distância é enorme, contra a palavra "connect" é 1.

A ordem importa. Se a distância de edição viesse antes da palavra em comum, "parque sul" acharia
"Parque Norte" por estar a poucas letras de distância.

E **empate não escolhe**: "parque", com "Parque Sul" e "Parque Norte" cadastrados, devolve os dois e
a LIA pergunta. Chutar é como um assistente perde a confiança de quem usa.

Duas decisões de produto:

- **A LIA escreve, não fala.** Voz sintetizada no meio de um atendimento é constrangedora — o
  cliente está do lado, e o corretor não quer que o celular comece a falar sozinho.
- **Toda etapa tem o toque como saída.** Cada opção listada é também um botão. Uma interface só por
  voz é uma interface que trava quando a voz falha, e numa reunião com cliente na frente isso não é
  aceitável.

A visualização reaproveita o `FilePreviewModal` da tela de Material de Venda em vez de ter uma
segunda cópia: PDF e vídeo abrem fora do app no celular, imagem tem fallback quando a URL assinada
falha, e o botão de baixar precisa do nome original — duas implementações divergiriam na primeira
correção que só uma recebesse.

> O material **não** pede o consentimento da escuta, e isso é deliberado. São coisas diferentes: a
> simulação abre o microfone numa conversa com o *cliente* e manda o texto para um serviço de IA; o
> material é o corretor falando sozinho uma palavra para navegar na própria pasta, sem nada saindo
> do aparelho. Pedir o mesmo aviso nos dois treinaria o corretor a aceitar sem ler — e é justamente
> na simulação que ele precisa ler.

**Empresa antes de empreendimento, quando há mais de uma.** Um corretor com uma construtora só
entra direto em "Qual empreendimento?" — é a mesma conversa de sempre. Com mais de uma, a primeira
pergunta vira "Qual empresa?": sem isso, a lista de empreendimentos mistura obras de construtoras
diferentes e o corretor precisa ler o nome inteiro para saber de qual é cada um. A etapa nasce
vazia e só se decide depois que as empresas chegam do banco (`iniciarConversa` em
`LiaMaterialChat.tsx`), porque a decisão depende de quantas existem.

### Agendamento por voz — a terceira habilidade

```
corretor: "agenda pro dia 25 às 10 horas, apresentar o Connect pra Fulana"
LIA:      [cria o compromisso no calendário e confirma]
```

Ela tem **dois caminhos de entrada**, e os dois chamam a mesma `agendarPorVoz`:

1. **O item "Agendar compromisso" do leque** — o caminho normal. O corretor abre a LIA só para isso, aperta o
   microfone e fala. É o que acontece nove em cada dez vezes: no carro, entre um atendimento e
   outro, sozinho.
2. **A escuta ambiente** — o comando dito no meio da negociação, com a LIA já ligada capturando os
   campos da simulação. Sai de graça, mas exige a sessão inteira aberta.

O segundo, sozinho, era um recurso invisível: ninguém descobre uma capacidade que só existe dentro
de outra. Daí o item próprio.

**Por que isto não mora na extração de campos.** A captura contínua (`campos.ts`, `extrair.ts`)
acumula ESTADO ao longo da reunião inteira — dezenas de chamadas, cada uma vendo o que já foi
capturado. Agendar não acumula nada: é uma frase, um compromisso, criado na hora. E, ao contrário
dos catorze campos da simulação, a lista de clientes só interessa para isto — colocá-la na captura
contínua faria toda sessão pagar pelo catálogo de leads, mesmo as que nunca agendam nada.

Por isso o agendamento é um **caminho isolado** (`agendamento.ts`), com seu próprio gatilho local e
sua própria chamada:

1. **`pareceAgendamento`** — o mesmo princípio de `gatilho.ts`: um filtro grosso que roda no
   aparelho, de graça. "agend" (agenda/agendar/agendado) sozinho já dispara — ninguém diz essa raiz
   por acaso. "marc"/"marqu" (marca/marque/marcar) é comum demais para disparar sozinho ("é a marca
   do carro dela"), então só passa acompanhado de uma pista de data ou hora.
2. Disparado o gatilho, uma chamada **isolada e barata** (sempre Haiku) manda só a frase, a data de
   hoje, os nomes dos empreendimentos e dos clientes — sem o prompt de catorze campos, sem
   ANTES/AGORA, sem cache compartilhada, porque é raro o bastante para não precisar de nenhum dos
   dois.
3. **Nunca chuta data nem hora.** Faltando qualquer um dos dois com segurança, o modelo devolve
   `null` e um motivo, e a LIA pede para o corretor repetir — a mesma regra que rege todo o resto do
   aplicativo: um compromisso na data errada é pior que nenhum compromisso.
4. Nome de empreendimento e de cliente casam com o cadastro pelo mesmo `resolverDoCatalogo` que já
   resolve empreendimento e correspondente na captura principal — é o mesmo problema (nome falado
   contra uma lista curta), então é a mesma solução testada.
5. O compromisso nasce como tipo **Visita**, com a fonte `lia` (`AppointmentSource`), e a descrição
   registra o cliente e o empreendimento identificados — para quem olha o calendário depois saber
   que aquele evento foi criado por voz, e a partir de quê. Nome que não casa com o cadastro **não
   impede** o agendamento: o compromisso é criado sem o vínculo, porque perder a visita inteira
   por causa de um nome mal transcrito seria desproporcional.

Duas diferenças do item de menu para a escuta ambiente, e as duas são de propósito:

- **O gatilho `pareceAgendamento` não roda no item de menu.** Quem abriu a tela de agenda e apertou
  o microfone já disse o que queria fazer; exigir que ele fale a palavra "agendar" de novo seria
  pedir senha para entrar numa porta que ele acabou de abrir. O gatilho existe para o caminho
  ambiente, onde a LIA precisa distinguir um comando do resto da negociação.
- **A pausa é mais longa** (1,4 s contra os 700 ms do material). Ali a resposta é uma palavra
  ("posts"); aqui é uma frase inteira com dia, hora, empreendimento e cliente — cortar cedo demais
  mandaria metade do comando para o modelo.

> **Consentimento: só a simulação pede.** O modal de consentimento existe porque a simulação grava
> uma conversa com o **cliente**, cujos dados não são do corretor. Material e Agenda são o corretor
> falando sozinho sobre o próprio trabalho. A Agenda **envia a frase** para a IA (é ela que resolve
> "dia 25 às 10" em data e hora) e diz isso em letras na própria tela — mas sem o peso de um modal
> sobre dado de terceiro, porque não há terceiro. Repetir o mesmo aviso nas três treinaria o
> corretor a aceitar sem ler, e é na negociação que ele precisa ler.

`pareceAgendamento` e o casamento de nome (`resolverDoCatalogo`/`casarPorVoz`) são testados em
Node puro, sem servidor e sem modelo — `npm run testar:lia`.

> **Isto muda o contrato com a Edge Function.** `VERSAO_CONTRATO` foi de 2 para 3 — o modo
> `agendamento` é atendido por um branch inteiramente à parte dentro de `lia-extract`, com
> ferramenta e prompt próprios. **A função precisa ser republicada** antes de qualquer uma das duas
> capacidades (captura de campos ou agendamento) voltar a funcionar: sem o eco de versão bater, o
> aplicativo mostra "A LIA no servidor está desatualizada" em vez de fingir que ouviu — ver a seção
> de Edge Functions abaixo.

### O custo, e o redesenho que o cortou 17×

A primeira versão da LIA **custava US$ 2,13 por simulação** — mais que a mensalidade do corretor.
O produto não fechava. Medindo (`npm run custo:lia`), a conta era: prompt fixo de ~3.400 tokens
reenviado ~107 vezes por reunião (72% do total), mais a conversa inteira a cada rodada (custo
**quadrático** na duração), tudo em Sonnet.

Cinco mudanças, em ordem de tamanho:

**1. Cache em dois blocos, e a ordem é o truque.** O prompt foi partido em *global* (instruções +
lista de campos — idêntico byte a byte para **todos** os corretores) e *do corretor* (catálogo +
data). Ambos com `cache_control`. Cache é casamento de **prefixo**, então o global vem **primeiro**:
assim ele é o mesmo prefixo para a conta inteira — uma escrita, e leituras a 0,1× para todo mundo.
Invertido, o catálogo de cada corretor quebraria o prefixo no começo e ninguém compartilharia nada.

> Consequência para quem editar: mexer no bloco global **invalida a cache de todos de uma vez**. É
> barato (uma escrita até reaquecer), mas evite ajustes cosméticos ali.

**2. Estado + contexto curto + trecho novo, em vez da conversa inteira.** As rodadas parciais
mandam o que já foi capturado (chave → valor, **sem** os trechos — só a tela os usa), uma janela de
1.200 caracteres do que foi dito antes (bloco **ANTES**, só para entender) e o pedaço novo (bloco
**AGORA**, de onde se extrai). A correção continua funcionando *por causa* do estado: o modelo vê
`clienteRenda: 2800`, ouve "na verdade são três e meio", e corrige. Não é preciso reler a conversa
inteira para isso. O custo virou **linear**.

> **A janela ANTES entrou depois, consertando um erro meu.** A primeira versão econômica mandava
> *só* o pedaço novo — 3,5 segundos de fala, sozinhos. Junto com a regra (correta) de não registrar
> número solto sem saber de que campo ele é, o resultado em uso real foi a LIA **não capturar quase
> nada**: ela recebia "duzentos e dez mil" sem nada em volta e devolvia lista vazia, obedecendo. O
> contexto custa ~1 centavo de dólar por simulação. Economia que quebra a funcionalidade não é
> economia.

**3. Gatilho local (`gatilho.ts`), o filtro mais barato que existe.** Roda no aparelho e decide se
o trecho novo tem chance de conter um dado: dígito, número por extenso, palavra do vocabulário do
negócio, **nome do catálogo deste corretor**, verbo de retratação, ou trecho longo demais para
ignorar. "Pois é", "com certeza", "o trânsito tava horrível" não chamam o modelo. Numa conversa de
exemplo, **corta mais da metade das janelas**.

> **Os nomes do catálogo entraram depois, e eram um buraco sério.** *"É o connect mesmo"* não tem
> dígito nem palavra do vocabulário fixo — a janela era descartada **no aparelho** e o modelo nunca
> via o nome do empreendimento, justamente o campo que puxa empresa, gerente, comissão e prazo. A
> lista fixa não tem como saber que "connect" importa: ela é a mesma para todo mundo. A do corretor
> sabe.

A regra é errar para o lado de chamar: um falso positivo custa uma fração de centavo; um falso
negativo perde um dado e o corretor descobre quando a proposta sai errada. Dois detalhes que os
testes forçaram: **"um" e "uma" ficaram fora** da lista de números (em português são artigos antes
de numerais, e aprovavam justamente o ruído — "deixa eu ver *um* instante"); e existe uma lista de
**retratação** (`esquece`, `desistiu`, `mudou`, `proponente`), porque "esquece o segundo proponente"
não tem número nenhum e ainda assim apaga um campo já capturado.

**4. Haiku nas parciais, Sonnet no fecho.** As rodadas intermediárias existem para a tela
acompanhar. A que decide a proposta é a última — e ela relê a **conversa inteira, sem filtro**, no
modelo bom. É a rede que segura os atalhos: um trecho descartado pelo gatilho ou um campo que o
modelo barato deixou passar reaparecem ali, antes de virar PDF. Nenhuma rodada parcial tem
autoridade sobre o que o cliente assina.

**5. Saída só do que mudou** — os campos parados de rodada para rodada não voltam na resposta,
poupando tokens de saída sem custar nada em qualidade.

> **O intervalo entre chamadas ficou em 3,5 s — o mesmo de sempre.** Numa primeira passada eu tinha
> subido para 12 s achando que precisava, sem recalcular depois que cache + gatilho + Haiku já
> tinham feito o trabalho pesado. Refeita a conta: manter 3,5 s custa **R$ 0,21 a mais por
> simulação** que 12 s — e a sensação de "ao vivo" (os cards aparecendo quase na hora) é parte do
> que torna a LIA impressionante. Não valia a troca por uma economia irrelevante perto da margem.

#### O resultado

| | por simulação |
|---|---|
| antes (3,5 s, sem cache/gatilho/Haiku) | **$2,134** |
| agora, com cache/gatilho/Haiku, ainda a 3,5 s | **$0,122** |

**17× mais barato, com o mesmo ritmo de resposta de antes.** A conta é feita contra os **R$ 89,90
do Pro**, e não contra a média dos planos: a LIA é exclusiva do Pro, e quem paga Start ou Intermed
não gera custo de LLM nenhum — o botão nem existe para eles. Com 30 simulações por corretor:

| usuários | custo total R$ | **lucro R$** | margem |
|---|---|---|---|
| 10 | 48,08 | 41,82 | 47% |
| 30 | 31,88 | 58,02 | 65% |
| 80 | 26,82 | 63,08 | 70% |
| 200 | 24,99 | 64,91 | 72% |
| 400 | 24,39 | **65,51** | **73%** |

Em 10 usuários quem domina não é mais a LIA (R$ 19,80) — é a infra fixa do Supabase e da Vercel
(R$ 24,30 divididos por dez). Isso se dilui sozinho com a escala. Com 15 simulações/mês em vez de
30, a margem sobe mais ainda (58% a 84% — ver `npm run custo:lia`).

> A simulação subiu de $0,091 para $0,122 quando a janela ANTES e os nomes do catálogo no gatilho
> entraram. **É o custo de a LIA funcionar**: sem os dois, ela custava menos e não capturava nada.
> R$ 0,17 a mais por simulação, contra uma margem de 73%.

A Edge Function passou a devolver o **`uso` real** de cada chamada (incluindo quanto veio da cache).
`scripts/custo-lia.mjs` ainda estima tokens por caracteres; quando houver uso de verdade, troque a
estimativa pelo medido — é o mesmo cálculo com números melhores. E `cacheLeitura` alto é o sinal de
que a cache está pegando: se vier zero, alguma coisa está invalidando o prefixo.

### O orbe — a logo viva (`src/components/lia/LiaOrbe.tsx`)

Quatro camadas empilhadas, e nenhuma delas é bonita sozinha:

1. **Fumaça** — sete manchas laranjas translúcidas, em dois tons, cada uma numa órbita própria.
   As durações são **números primos** (7 s, 11 s, 13 s, 17 s, 19 s, 23 s, 29 s) de propósito: com
   valores múltiplos, a nuvem reencontraria a mesma posição a cada poucos segundos e o olho pega o
   ciclo — que é exatamente o que faz uma animação parecer barata. Os dois tons dão profundidade,
   porque a borda de uma mancha aparece por dentro da outra em vez de somar numa mancha chapada.
2. **Ondas** — quatro anéis que nascem no centro, abrem e se dissolvem, com a **borda afinando**
   enquanto crescem, como a crista de uma onda. Sem isso, o anel vira um aro de desenho animado.
3. **Núcleo** — o disco que segura a logo e a separa da fumaça.
4. **Logo** — respirando devagar, **sempre**. Mesmo parada, a LIA está viva.

**O pulso segue a voz, não o relógio.** `nivelDeVoz.ts` mede o volume real do microfone
(`AnalyserNode`, RMS do sinal) e escreve num `Animated.Value` que multiplica a escala das ondas, a
densidade da fumaça e o tamanho do núcleo. Uma animação em laço fixo é bonita por dez segundos e
vira papel de parede no décimo primeiro; reagindo ao volume, o movimento **vira informação** — dá
para ver, sem ler nada, que a LIA está captando *aquela* frase.

Detalhe de custo: a medição roda a ~60 Hz. Levar isso ao estado do React seriam 60 renderizações
do app por segundo de conversa. Escrevendo direto no `Animated.Value`, a árvore de estilos consome
sem re-renderizar nada.

**"Pensando" é o mesmo desenho invertido**: os anéis contraem em vez de expandir e a nuvem acelera.
Em vez de emitir, ela recolhe — e o corretor entende a diferença sem legenda.

Duas coisas que o orbe **não** faz, por decisão:

- **Não derruba a LIA se falhar.** Sem permissão de microfone ou sem Web Audio, `medirVoz` devolve
  `null` em silêncio e sobra a animação por ritmo. Enfeite nunca leva funcionalidade junto.
- **Não vaza da tela.** No botão flutuante ele roda em modo `compacto`: a nuvem orbita de perto e a
  onda para em 1,55x. O orbe cheio se espalha ~60 px além do botão, que vive a 16 px da borda — na
  web isso empurra a largura da página e **faz o app rolar para o lado**. Uma tela de celular que
  desliza na horizontal parece app quebrado, e o preço não valia o enfeite. O espetáculo mora no
  painel; no botão o orbe é sinalização.

E o microfone é devolvido: `parar()` fecha o laço, o analisador, o contexto de áudio **e as faixas
do fluxo** — é o que apaga a luz do microfone no aparelho.

### A captura surgindo do orbe

Assim que a LIA entende alguma coisa, a informação **sai de dentro do orbe**: uma etiqueta sobe do
centro da nuvem com o campo, o valor e um ✓ verde — `Empreendimento  Residencial Vila Nova ✓` —
fica um instante e se dissolve para cima.

A lista de campos capturados já existia e continua sendo a fonte da verdade. A diferença é que ela
é **estado**, e a etiqueta é **acontecimento**. Quem está numa negociação olhando o cliente não
varre uma lista para descobrir o que mudou; a etiqueta responde num olhar de meio segundo, sem
tirar o corretor da conversa, à única pergunta que importa naquele instante: *"ela pegou?"*. E
responde no lugar certo — saindo do orbe, que é para onde ele já está olhando enquanto a LIA
processa.

Quatro decisões pequenas que fazem isso funcionar:

- **A comparação é pelo valor, não pela presença.** Um campo corrigido ("na verdade são três e
  meio") surge de novo, com o selo `corrigido` — porque a correção é exatamente o que o corretor
  precisa ver acontecer. Já um campo reconfirmado igual a cada rodada não pisca a cada três
  segundos: viraria ruído e ele pararia de olhar.
- **Cascata, não bloco.** Uma rodada costuma devolver vários campos de uma vez, e todos subindo no
  mesmo instante viram um bloco — o olho recebe quatro coisas e não lê nenhuma. Com 150 ms entre
  uma e outra, cada uma ganha o seu momento.
- **O degrau é fixado na criação**, não lido do índice no array. Com o índice, a saída de uma
  etiqueta faria as outras escorregarem para baixo bem no meio da leitura.
- **O `aoTerminar` vive numa ref.** Ele é recriado a cada render do pai, e o pai renderiza sempre
  que outra etiqueta entra ou sai. Nas dependências do efeito, a animação seria cancelada e
  recomeçada a cada vizinha nova: nunca terminaria, nunca se removeria, e a fila cresceria até
  engasgar — o mesmo formato de vazamento que já travou esta tela por outro caminho.

De carona, o card na lista passou a mostrar o **nome** em vez de `identificado ✓`. Em empreendimento
e correspondente o modelo devolve um **id** (`dev-a1b2…`), que na tela não diz nada; e
"identificado ✓" era pior ainda, porque obrigava a confiar sem conferir — o oposto do que esta tela
existe para fazer. Quem resolve o id de volta para o nome é o `LiaProvider`, que é quem tem o
catálogo em mãos.

### `overflow-x: hidden` na casca (`app/+html.tsx`)

O POUP nunca rola para o lado: todo conteúdo largo rola dentro do próprio contêiner. A página
deslizar na horizontal é sempre acidente — e um acidente que parece defeito grave no celular, onde
o usuário arrasta para rolar a lista e a tela inteira anda de lado.

O acidente veio do orbe da LIA, cuja nuvem se espalha para fora do botão flutuante, que vive a
16 px da borda. O modo `compacto` calibra as camadas para caber, mas confiar só nisso é deixar a
próxima animação reintroduzir o problema em silêncio. A regra é a garantia estrutural, e não
esconde bug de layout: numa casca de tela cheia, não existe conteúdo legítimo à direita da borda.

### O travamento do religamento (corrigido)

Vale registrar porque o sintoma era assustador e a causa é sutil: **a LIA travava o aplicativo
inteiro** — o botão "Encerrar" não respondia a nada.

O navegador encerra a sessão de reconhecimento sozinho depois de um tempo sem fala, então religar é
obrigatório. A primeira versão religava de dois jeitos errados, e juntos eles fechavam a conta:

1. `r.start()` era chamado **dentro do `onend`, de forma síncrona**. Se a sessão morresse logo ao
   nascer, o par `end → start` virava um laço que nunca devolvia o controle à fila de eventos. E um
   laço assim não trava só a LIA: **o toque em "Encerrar" nunca chega a ser processado**, porque
   não sobra volta de laço para processar toque nenhum.
2. A trava anti-laço era zerada no `onstart`. Como a sessão *chegava* a começar (e só então
   morria), o contador voltava a zero a cada volta e a proteção nunca disparava.

A correção ataca as duas: religa sempre por `setTimeout` com espera crescente — o que basta para o
toque no botão passar na frente — e mede a **duração** da sessão em vez de contar `start`s. Sessão
que durou o bastante indica que estava funcionando; cinco sessões natimortas seguidas encerram com
uma mensagem em vez de queimar a aba.

> Verificado com a Web Speech API substituída por uma falsa no navegador, em dois modos. Sessão
> saudável: 1 `start`, campos capturados, "Encerrar" respondeu em 849 ms. Sessão natimorta: **5**
> `start`s e para, com aviso na tela; a página seguiu respondendo em 1 ms.

### Privacidade — e por que ela é mais séria aqui

A LIA abre um microfone numa sala onde há **outra pessoa**, e o titular do dado é o cliente, não
o corretor. Por isso:

- **Consentimento explícito antes da primeira sessão**, nomeando a Anthropic (regra 5.1.2(i) da
  App Store) e dizendo com todas as letras que o cliente precisa saber que está sendo transcrito.
- **O áudio não é gravado nem enviado.** O que sai do aparelho é o texto, no momento da análise.
- **A transcrição vive só na sessão** e é apagada ao encerrar ou ao entregar para o simulador —
  ela contém nome, CPF e renda de alguém que não é o usuário do app.
- **O consentimento é da pessoa, não do aparelho**: o `AuthProvider` o apaga no logout.
- **O sinal de "estou ouvindo" acompanha a navegação.** O botão vira um anel pulsante verde e o
  `LiaProvider` envolve o layout inteiro de `(app)` — se o corretor for consultar um cadastro no
  meio da conversa, o aviso vai junto e a sessão não se perde.

### Onde funciona hoje

| Plataforma | Estado |
|---|---|
| Chrome / Edge (desktop e Android) | ✅ funciona |
| Safari / iOS Safari | ⚠️ sem transcrição contínua confiável — a tela avisa |
| App nativo (Expo Go incluído) | ❌ precisa de *development build* com `expo-speech-recognition` |

Reconhecimento de fala contínuo não existe no React Native puro: é módulo nativo, e o Expo Go só
carrega o que vem embutido nele. Em vez de deixar o botão parecer quebrado, `suporteDeEscuta()`
diz exatamente o que falta e a tela mostra isso. **Um recurso indisponível naquela plataforma é
uma informação; um botão que não faz nada é um bug.**

### As arestas da Web Speech API (`src/features/lia/escuta.ts`)

Todas custaram tempo de alguém e estão tratadas:

- **Ela desliga sozinha.** Mesmo com `continuous = true`, o Chrome encerra a sessão depois de um
  tempo sem fala — sem religar no `onend`, a LIA ficaria "ouvindo" em silêncio pelo resto da
  reunião. O religamento tem trava anti-laço: religar num erro permanente trava a aba.
- **`no-speech` não é erro.** É o que ela devolve quando ninguém falou, e numa negociação isso é
  metade do tempo.
- **Resultados chegam duas vezes** (provisório e final). Guardar os dois duplicaria a conversa
  inteira; só o final entra na transcrição, o provisório só alimenta a onda na tela.
- **`resultIndex`**: o evento traz a lista desde o começo da sessão, não só o pedaço novo.
- **A permissão só é concedida dentro de um gesto do usuário** — por isso o consentimento é pedido
  ao *abrir o painel*, e não no toque de "Começar a ouvir": assim esse toque chega limpo ao
  `iniciar()`, sem um `await` no meio que o Safari usa para descartar o gesto.

### Publicar

```
Edge Function: lia-extract     (precisa de ANTHROPIC_API_KEY, a mesma do scanner)
Modelo:        claude-sonnet-5 (trocável por LIA_MODEL)
```

Sonnet, e não o Haiku que o scanner usa: a tarefa não é ler um campo impresso, é acompanhar uma
conversa sem ordem, em que o sentido de um número depende do contexto, correções chegam depois e
um nome mal transcrito precisa ser casado com o catálogo.

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

### A imagem é reduzida no aparelho antes de subir

`src/lib/imagemReduzida.ts` reduz a foto para **1600 px** no lado maior (compressão JPEG 0,7) antes do envio.

Não é economia de token: a API da Anthropic já reduz a imagem a 1568 px do lado maior antes de cobrar, então uma foto de 4000 px **custa o mesmo** que uma de 1600. O ganho é no que vem antes do modelo — uma foto de celular tem 3 a 6 MB, o que em base64 vira 4 a 8 MB de texto para subir pelo 4G do corretor, na porta do empreendimento, com o cliente esperando. Reduzida, a mesma foto fica entre 150 e 400 KB.

Se a redução falhar, envia o original: foto grande que funciona é melhor que leitura que não acontece. O teto de bytes da edge function (6 MB de base64) fica como rede de proteção para quem não passa pelo aplicativo.

---

## 💸 Limitador de uso de IA (a trava que protege a margem)

**O problema:** a assinatura é receita **fixa** por mês; chamada de modelo é custo **variável** por uso. Sem teto, as duas curvas se cruzam — e ninguém descobre até a fatura chegar.

`0028_limite_ia.sql` + `supabase/functions/_shared/cota.ts` fecham isso.

### Onde o teto mora, e por quê

`ai_limits(plano, recurso)` guarda **teto do mês** e **teto do minuto**; `ai_usage(user_id, recurso, ciclo)` conta o consumo, com o ciclo sendo o mês no fuso de Brasília (não UTC — senão o corretor viraria o mês às 21h do dia 31).

A parte que importa: **`consumir_ia()` recebe apenas o NOME do recurso, nunca o teto.** Quem descobre o plano da conta e o limite correspondente é o próprio Postgres, com `auth.uid()`, dentro de uma função `security definer`.

Isso não é preciosismo. As Edge Functions do POUP criam o client Supabase com a chave de service role **mas repassam o `Authorization` do usuário**, o que faz as queries rodarem como o próprio usuário. Se o teto viesse como parâmetro da chamada, bastaria chamar a função SQL direto do aparelho passando um número alto.

Pelo mesmo motivo, `ai_usage` é **somente leitura** para o usuário: sem policy de insert/update/delete. Uma cota que o dono da linha pode editar é uma sugestão, não uma cota.

### Duas travas, porque são dois abusos

| | Protege contra | Por que separada |
|---|---|---|
| `teto_mes` | consumo alto de um corretor real | é o número comercial do plano |
| `teto_minuto` | laço automatizado | sem ela, um script queima o mês em segundos e ainda estoura a concorrência da Edge Function. Uma pessoa nunca escaneia 30 documentos em um minuto; um script sempre faz |

O `select ... for update` na leitura do contador serializa duas chamadas simultâneas do mesmo corretor. Sem ele, ler-somar-gravar deixa duas requisições verem o mesmo `usados` — e o teto vaza exatamente no caso que ele existe para conter.

### Cobra antes, estorna se a culpa for nossa

A cobrança acontece **antes** da chamada ao modelo. Cobrar depois deixaria a porta aberta: quem derruba a conexão no meio nunca seria cobrado, e repetir isso em laço é uso ilimitado de graça.

O `estornar()` desfaz a cobrança quando a falha é do POUP (502 da Anthropic, chave ausente, exceção). Quando a imagem simplesmente não deu para ler, a cobrança **fica** — o modelo já foi pago, e mandar borrão em laço seria uso ilimitado por outro caminho.

E se a própria cota estiver fora do ar (RPC indisponível, migration não aplicada), a resposta é **recusar** a chamada. Um limitador que abre quando quebra não é um limitador.

### Os seis recursos medidos

`scan`, `lia_escuta`, `lia_fechamento`, `lia_agenda`, `pitch`, `convite`.

Escuta e fechamento da LIA são contadores **separados**, e não pesos do mesmo: a escuta roda dezenas de vezes por reunião em Haiku, o fechamento roda uma vez em Sonnet com a conversa inteira no contexto. Somados, o fechamento desapareceria na média e o teto que realmente importa não existiria.

> Mudar um teto é um `update` em `ai_limits` — **sem deploy**. Os números atuais foram escolhidos por uso plausível e folga na mensalidade, não por medição; o painel de rastreabilidade (§abaixo) mostra o consumo real para corrigi-los no piloto.

### A mensagem de recusa precisou de um conserto no client

`supabase.functions.invoke` devolve sempre `"Edge Function returned a non-2xx status code"` em `error.message` e esconde o corpo da resposta em `error.context`. Um limite atingido (429) chegaria ao corretor como uma frase em inglês sobre status HTTP — e a regra pareceria defeito.

`src/lib/edgeError.ts` lê a explicação do corpo. Vale para **todo** erro de Edge Function, não só para cota.

> Por que não devolver 200 em tudo (que foi o atalho da prospecção): status HTTP correto é o que faz o log do Supabase e qualquer política futura de retentativa distinguirem "recusei de propósito" de "quebrou". Mentir no status para contornar uma limitação do client troca uma linha de código por uma cegueira permanente.

---

## 📈 Rastreabilidade (o painel do piloto)

`0029_rastreabilidade.sql` + `src/features/analytics/` + `app/(app)/admin/rastreabilidade.tsx`.

### Nenhum dado de cliente — garantido pela forma da tabela

`analytics_events` guarda `evento`, `etapa`, `resultado`, `duracao_ms` e um `ref_id` uuid interno. **Não existe coluna de texto livre.** `evento` é lista fechada por CHECK, os rótulos têm teto de 40 caracteres.

Não é disciplina, é estrutura: não há onde um nome, CPF ou valor de imóvel cair — nem por descuido, nem por pressa. Em LGPD é o melhor tipo de controle que existe: o dado que não existe não vaza, não precisa de base legal e não entra em pedido de exclusão.

A assinatura de `registrar()` em `src/features/analytics/eventos.ts` repete a mesma trava no TypeScript — não há parâmetro de texto livre para passar.

### Telemetria nunca atrapalha o uso

`registrar()` não lança, não devolve erro e não é esperada com `await`. Rede caída, migration não aplicada, tabela inexistente: o evento se perde em silêncio. Perder uma medição é irrelevante; travar uma proposta por causa de uma medição seria absurdo.

### Os onze eventos

| Evento | Onde é emitido | O que responde |
|---|---|---|
| `signup_completed` | `(auth)/signup.tsx` | distingue quem entrou de quem ficou esperando o email de confirmação |
| `onboarding_completed` | `OnboardingModal` | o momento em que ele tem cadastro para **emitir proposta**; também registra quem escolheu "preencher depois" |
| `company_created` | `cadastros/empresas.tsx` | só na **criação** — editar é uso normal, ter a primeira é o degrau que destrava o produto |
| `development_created` | `cadastros/empreendimentos.tsx` | idem |
| `simulation_started` | `financiamento/simular.tsx` | quantos começam, por banco |
| `simulation_step_completed` | idem | chegou a um resultado, e em quanto tempo |
| `simulation_abandoned` | idem, na **saída** da tela | a etapa mais avançada que ele alcançou: é o que aponta onde o formulário travou |
| `proposal_generated` | `simulador/fluxo.tsx` | distingue "gerou" de "o PDF falhou e salvou em Relatórios" |
| `proposal_shared` | `relatorios/[id].tsx` | a reabertura, que termina na folha de compartilhamento. Proposta gerada e nunca reaberta é proposta que o corretor não teve coragem de mostrar |
| `user_returned` | `(app)/_layout.tsx` | a única métrica que não dá para fingir |
| `subscription_viewed` | `paywall.tsx` | quem chegou a olhar o preço, e se veio por bloqueio ou por vontade |

Duas notas de implementação que importam:

- No simulador tudo vive em `useRef`, não em estado: aquele formulário recalcula a cada tecla, e um `setState` de telemetria seria um render extra por dígito digitado.
- `user_returned` usa **20 horas**, não 24. Quem abre o app às 9h todo dia útil nunca completa 24 horas entre duas sessões e apareceria como quem nunca voltou.

### O painel

Funil → consumo de IA → eventos, nessa ordem, que é a ordem das perguntas: onde as pessoas param, o que o uso custa, e o detalhe de onde olhar depois.

Os agregados saem do Postgres prontos (`painel_eventos`, `painel_funil`, `painel_consumo_ia`) — em alguns milhares de corretores a tabela passa de centenas de milhares de linhas, e baixar isso para contar no aparelho seria absurdo. Todas as três são `security definer` com `is_app_admin()` **dentro da query**: quem barra é o RLS, não a tela.

`podar_analytics(dias)` apaga eventos antigos (mínimo de 30 dias, padrão 180). Não está agendada — rode a mão, ou configure cron no Supabase quando o volume justificar.

### "Reportar problema ou dar sugestão"

Em Ajustes → Ajuda. A telemetria mostra **onde** as pessoas param; nunca diz **por quê**.

O formulário captura a rota sozinho — e descarta o caminho que o corretor percorreu até chegar em Ajustes, senão todo reporte diria "aconteceu em Ajustes". O histórico de rotas mora numa variável de módulo (`src/features/analytics/tela.ts`) e não num provider: um provider re-renderizaria a árvore a cada navegação para uma informação lida só quando alguém abre o formulário.

É o único campo de texto livre novo que sai do aparelho para o nosso banco, e o aviso pede para descrever pelo que aconteceu, não por quem.

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

**`ai_limits`** — teto de IA por plano e recurso (0028). `-1` = sem teto (só `admin`). RLS: leitura para qualquer logado, **nenhuma policy de escrita** — ninguém aumenta o próprio teto pelo app.
| Coluna | Tipo | Observação |
|---|---|---|
| `plano`, `recurso` | text | PK composta. `plano` ∈ admin/teste/pro/intermed/start/nenhum |
| `teto_mes`, `teto_minuto` | integer | `-1` = sem teto; `0` = plano não inclui |

**`ai_usage`** — consumo por usuário, recurso e ciclo (0028). RLS: **só leitura** (própria, ou tudo se admin). A escrita passa obrigatoriamente por `consumir_ia()`/`estornar_ia()`.
| Coluna | Tipo | Observação |
|---|---|---|
| `user_id`, `recurso`, `ciclo` | | PK composta. `ciclo` = `AAAA-MM` no fuso de Brasília |
| `usados` | integer | contador do mês |
| `janela_inicio`, `janela_usados` | | a trava de rajada de 60 s, na mesma linha para um único lock resolver as duas |

**`analytics_events`** — telemetria do produto (0029). RLS: `insert` do próprio, `select` só admin, **sem update nem delete**. Sem nenhuma coluna de texto livre: ver §Rastreabilidade.
| Coluna | Tipo | Observação |
|---|---|---|
| `evento` | text | lista fechada por CHECK (11 valores) |
| `etapa`, `resultado` | text | rótulos curtos, teto de 40 caracteres |
| `duracao_ms` | integer | 0 a 86.400.000 |
| `ref_id` | uuid | id **interno** (empresa, simulação) |

**`feedback`** — "Reportar problema ou dar sugestão" (0029). RLS: `insert` e `select` do próprio, `select` e `update` do admin.
| Coluna | Tipo | Observação |
|---|---|---|
| `tela`, `etapa` | text | capturados automaticamente |
| `mensagem` | text | 3 a 2000 caracteres |
| `situacao` | text | `aberto` \| `lido` \| `resolvido` |

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

> **Redirect URLs — a lista precisa cobrir `/redefinir-senha` e o esquema do app.** O Supabase só honra um `redirectTo` que case com essa lista; qualquer endereço fora dela é **silenciosamente trocado pelo Site URL**. O sintoma é confuso: o link do e-mail de senha "funciona", mas cai na tela inicial em vez da tela de trocar a senha. Deixe `https://<seu-dominio>/**` e `poup://**` cadastrados.

### Redefinição de senha

O link do e-mail cai em **`/redefinir-senha`** — não em `/login`. A diferença importa porque clicar no link **cria uma sessão de verdade** (é assim que o Supabase prova que quem clicou é o dono da caixa de entrada). Enquanto o destino era `/login`, o efeito era o oposto do pedido: a tela via um usuário autenticado, redirecionava para dentro do app, e a senha continuava a antiga. O corretor pedia para trocar a senha e era jogado no app sem ter trocado nada.

`app/redefinir-senha.tsx` mora **na raiz, fora de `(auth)`**, e isso não é arrumação: `app/(auth)/_layout.tsx` faz `if (user) return <Redirect href="/" />`. Como o link já autenticou o visitante, dentro daquele grupo a tela seria expulsa antes de aparecer — o mesmo bug, por outro caminho.

Web e celular chegam nela de formas diferentes, e o código trata as duas:

- **Web**: o cliente é criado com `detectSessionInUrl`, então ele lê os tokens do endereço, instala a sessão e **limpa o endereço** em seguida. Por isso a tela não tenta ler a URL na web — quando ela monta, o fragmento já pode ter sido consumido. Ela **espera a sessão aparecer** (até 8 s, verificando a cada 250 ms). Sem essa espera, um link válido seria declarado expirado por milésimos de segundo.
- **Celular**: não existe "endereço da página". O `redirectTo` é `Linking.createURL('/redefinir-senha')` (`poup://…`), o link chega como deep link e os tokens vêm no **fragmento** — `applyRecoveryLink` os instala na mão, porque `detectSessionInUrl` é `false` fora da web.

No fim, a tela **sai da conta** e manda para o login. É o que o corretor pediu ao clicar em "esqueci minha senha": trocar a senha, não entrar. Entrar sozinho deixaria a dúvida de sempre ("será que salvou?"); pedir a senha nova responde isso na hora, com a própria senha.

Link expirado ou já usado é o caso **comum**, não a exceção — eles duram pouco e valem uma vez só. Por isso vira uma tela própria ("Link expirado") com o botão de pedir outro, em vez de um erro técnico.

### Configuração do Stripe (os três planos)

**Guia completo passo a passo (100% pelo navegador): [`docs/STRIPE_PLANOS.md`](docs/STRIPE_PLANOS.md).** Resumo:

1. Crie três Produtos (`POUP Start` R$ 29,90, `POUP Intermed` R$ 49,90, `POUP Pro` R$ 89,90) com preço recorrente mensal; copie os `price_...`.
2. Copie a publishable key (`pk_...`).
3. Publique as Edge Functions colando o código de cada uma no Supabase Dashboard. `stripe-webhook` e `get-financing-simulation` vão com **Verify JWT desmarcado** — quem as chama não tem login (o Stripe e o cliente do corretor), e as duas validam por outro caminho (assinatura criptográfica e hash de token).
4. Configure os segredos: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_START`, `STRIPE_PRICE_INTERMED`, `STRIPE_PRICE_PRO`.
5. No Stripe Dashboard, aponte um webhook para `https://<projeto>.supabase.co/functions/v1/stripe-webhook`, assinando `checkout.session.completed` e `customer.subscription.*`; copie o `whsec_...` para o segredo acima.

> **Preço no Stripe não se edita — cria-se outro.** Um `Price` é imutável porque
> assinaturas ativas apontam para ele. Mudar um valor é criar preço novo,
> arquivar o antigo, trocar as variáveis nos **dois** lados (Vercel e Supabase) e
> **redeployar a Vercel** — as `EXPO_PUBLIC_*` são embutidas no build, então sem
> redeploy o site publicado continua vendendo pelo preço velho, sem aviso
> nenhum. E quem já assina **continua no preço antigo** até você migrar a
> assinatura dele. O guia detalha os três caminhos de migração.

---

## ▲ Deploy na Vercel

O projeto já vem com `vercel.json`. Na Vercel:

1. **Import** do repositório.
2. **Environment Variables**: as mesmas `EXPO_PUBLIC_*` do `.env` (com `EXPO_PUBLIC_APP_URL` = domínio de produção).
3. Build detectado automaticamente: `npm run build:web` → saída em `dist/`.

---

## 📲 Instalar na tela de início (PWA)

Enquanto o app não está nas lojas, o corretor chega pelo navegador — e some junto com a aba. "Adicionar à tela de início" resolve isso, mas quase ninguém conhece o caminho sozinho. Por isso o app **convida** e **ensina**.

### O que o corretor vê

- **Cartão no topo da tela inicial** (`src/components/InstallAppCard.tsx`). Some sozinho quando o app já está instalado e quando o corretor toca em "Agora não" (a escolha fica guardada).
- **Atalho em Ajustes → Ajuda → "Instalar na tela de início"**, para quem dispensou e se arrependeu. Usa exatamente o mesmo passo a passo.

### Os dois mundos (e por que o botão muda de nome)

|                                          | Android / Chrome                     | iPhone / Safari              |
| ---------------------------------------- | ------------------------------------ | ---------------------------- |
| O navegador avisa que dá para instalar?  | Sim (`beforeinstallprompt`)          | **Não existe API**           |
| O que o app consegue fazer               | Abrir a caixa oficial: **um toque**  | Só **ensinar** o caminho     |
| Rótulo do botão                          | "Instalar agora"                     | "Ver como fazer"             |

`src/features/install/pwa.ts` concentra essa detecção: `isInstalled()`, `detectPlatform()` (iPad moderno se apresenta como Mac — o toque é o que denuncia), `watchInstallPrompt()`, `canPromptInstall()` / `promptInstall()` e o par `dismiss()` / `undismiss()`.

### O service worker é obrigatório — e é minúsculo de propósito

O Chrome só oferece "Instalar aplicativo" para sites que têm service worker respondendo offline. Sem `public/sw.js`, o Android **nunca** mostraria o botão de um toque: sobraria o passo a passo manual, que é exatamente o problema a resolver.

Mas service worker que guarda JS e HTML é a causa clássica de "o app não atualiza". Então `public/sw.js` **não guarda nada do app**:

- só intercepta requisições de **navegação** (`request.mode === 'navigate'`); bundle, imagem e chamada ao Supabase passam direto, sem interferência;
- o único item em cache é `public/offline.html`, e ele só aparece quando a rede realmente falha;
- a resposta é **remontada** antes de ir para o cache, porque o `cleanUrls` da Vercel redireciona `/offline.html` → `/offline`, e uma resposta vinda de redirecionamento não pode ser devolvida numa navegação (o navegador recusa e a tela fica em branco — justo o que se quer evitar).

O registro é um `<script>` inline em `app/+html.tsx`, e não um módulo do app: precisa rodar antes do bundle carregar. O `vercel.json` serve `/sw.js` com `Cache-Control: no-cache`.

### Requisitos de instalabilidade já atendidos

`public/manifest.json` com `name`, `short_name`, `start_url`, `scope`, `display: standalone`, `theme_color` e ícones de **192** e **512** px (mais um `maskable`), referenciado em `app/+html.tsx` junto das metas `apple-mobile-web-app-*` que fazem o iPhone abrir em tela cheia.

> Ao mudar o conteúdo de `offline.html`, suba a constante `CACHE` em `sw.js` (`poup-offline-v1` → `v2`): o `activate` apaga os caches antigos e o corretor pega a versão nova.

---

## 📎 Arquivos: escolher, salvar e visualizar

Este é o trecho que mais divergia entre o site e o aplicativo. Tudo aqui funciona nos dois — a
regra é: **um módulo só, com o galho certo por dentro**, nunca duas telas diferentes.

### Escolher (`src/features/files/pick.ts`)

Existiam **três cópias** de um `<input type="file">` montado na mão (material de venda, anexos do
lead e fotos do catálogo). Funcionavam no navegador e **não existiam no celular**: no app das
lojas, o botão de anexar não abriria nada. E o único caminho nativo que havia (`expo-image-picker`,
no material de venda) só pegava foto e vídeo — justamente sem **PDF**, que é planta, tabela e book,
ou seja, quase todo o material do corretor.

`pickFiles()` / `pickImage()` usam `expo-document-picker`, que resolve os dois lados: no navegador
monta o mesmo `<input type="file">` (com tratamento de cancelamento e limpeza que as cópias na mão
não tinham) e no celular abre o seletor nativo.

Um detalhe de memória: na web o seletor devolve o `File` original em `asset.file`, e o módulo usa
esse objeto direto. Ler o `uri` (que vem em base64) dobraria a memória à toa num arquivo de 35 MB.

#### `Blob` no celular sobe um arquivo VAZIO — sem erro nenhum

A armadilha mais cara deste módulo, e a que explica o campo `PickedFile.body` ser
`Blob | ArrayBuffer` (o tipo `UploadBody`, em `src/data/types.ts`) em vez de só `Blob`.

O `supabase-js` embrulha **todo `Blob`** num `FormData` antes de enviar. No navegador é o certo. No
React Native o `FormData` **não sabe serializar um `Blob`** — ele só entende `string` e o objeto
`{ uri, name, type }` do próprio RN. O upload é então aceito com **corpo vazio**: nenhum erro volta,
`result.ok` é `true`, a URL pública é gravada na linha, e o arquivo simplesmente não existe. A
própria biblioteca documenta isso na fonte:

> *"For React Native, using either `Blob`, `File` or `FormData` does not work as intended. Upload
> file using `ArrayBuffer` from base64 file data instead."*

Por isso o módulo devolve **`Blob` na web** (o navegador transmite sem copiar) e **`ArrayBuffer` no
celular**, lido do `file://` com `expo-file-system` — que cai no caminho de corpo cru do
`supabase-js`, com o `content-type` no cabeçalho. Isso vale para **todo** upload do app: foto do
catálogo, material de venda e anexo de lead.

> Sintoma quando isso quebra: no celular a foto "sobe", nenhum erro aparece, e o avatar continua nas
> iniciais. Como não há erro em lugar nenhum, é fácil perder horas procurando o bug na tela.

Um segundo detalhe que produzia o **mesmo sintoma** por outro caminho: o `EntityAvatar` guardava
`failed: boolean` quando a imagem não carregava. A falha virava definitiva — o admin trocava a foto,
a URL nova chegava, e o avatar continuava nas iniciais porque o componente não é remontado (mesma
posição na árvore) e nada devolvia o `failed` a `false`. Hoje ele guarda **qual URL** falhou, então
uma imagem nova recomeça limpa sozinha.

**`pickImage()` é o caso à parte: seletor de arquivos não é seletor de fotos.** No celular a
diferença é grande — o `expo-document-picker` abre o gerenciador de arquivos (Downloads, Documentos,
Drive), e no iPhone isso é o app **Arquivos, que nem mostra o rolo da câmera**. Para a foto de uma
construtora era o lugar errado: a foto quase sempre está na galeria. Então `pickImage()` **pergunta**
— "Galeria de fotos" (`expo-image-picker`) ou "Arquivos" (`expo-document-picker`). "Arquivos"
continua na lista porque logo de construtora costuma chegar como PNG baixado, e no iPhone isso vai
para o app Arquivos e nunca aparece em Fotos.

Três botões, não quatro: o `Alert` do Android tem só três lugares (positivo/negativo/neutro) e
**descarta os excedentes em silêncio** — um menu que perde uma opção só num dos sistemas é pior que
um menu menor. A câmera ficou de fora por isso, e porque a foto tirada na hora cai na galeria de
qualquer jeito.

Na **web** não há essa pergunta: o `<input type="file" accept="image/*">` já oferece galeria, câmera
e arquivos num menu feito pelo próprio sistema. Perguntar ali seria inventar uma escolha que o
navegador faz melhor.

A opção `square` liga o recorte 1:1 no caminho da galeria. A foto do catálogo aparece **dentro de um
círculo**; sem o recorte, uma foto deitada entra cortada pelo meio e o corretor não tem como
consertar. A permissão de fototeca é pedida **só no Android** — no iOS o seletor moderno roda fora do
app e não exige autorização, e pedir ali abriria à toa o alerta de acesso *total* às fotos.

### Salvar (`src/features/files/save.ts`)

São dois problemas diferentes, não um só:

- **No navegador**, não existe "salvar na galeria". A única ponte é `navigator.share` com um `File`
  dentro — aí o sistema abre a folha com "Salvar em Fotos"/"Salvar imagem", e PDF cai em "Salvar em
  Arquivos". Sem isso, sobra o `<a download>`, que resolve no computador.
- **No celular**, `navigator.share` e `<a download>` não existem (nem o DOM existe). O caminho é
  gravar o conteúdo num arquivo local (`expo-file-system`) e entregar esse caminho ao
  `expo-sharing`.

> **A armadilha do iPhone, na web:** `navigator.share` exige um TOQUE recente. Baixar o arquivo
> (`await`) e só então compartilhar faz o Safari recusar **em silêncio** — o mesmo problema que já
> derrubou o envio pelo WhatsApp neste projeto. Por isso, na web, o conteúdo é baixado quando o
> preview ABRE (`prefetchFile`) e o botão só usa o que já está pronto. No app nativo essa regra não
> existe, e lá o download acontece no toque mesmo.

### Visualizar (`src/components/FilePreviewModal.tsx`)

|        | Navegador             | App das lojas                    |
| ------ | --------------------- | -------------------------------- |
| Imagem | `<Image>` na hora     | `<Image>` na hora                |
| PDF    | `<iframe>` embutido   | navegador interno (`WebBrowser`) |
| Vídeo  | `<video>` embutido    | navegador interno (`WebBrowser`) |

`<iframe>` e `<video>` são tags de HTML: existem no navegador e **não existem** no celular. Em vez
de trazer uma biblioteca de vídeo e outra de PDF só para isso, o app nativo usa o navegador interno
do sistema — que já exibe os dois, abre **por cima** do app (sem jogar o corretor para fora) e não
custa dependência nenhuma.

---

## 📱 Caminho para App Store / Play Store

O app é Expo, então o build das lojas sai do mesmo código do site, via **EAS Build** (`eas.json` já
está no repositório, com `development`, `preview` e `production`).

### O que já está pronto para a revisão

- **Política de Privacidade** (`app/privacidade.tsx`, rota pública `/privacidade`) — as duas lojas
  pedem essa URL antes de qualquer outra coisa. Linkada no cadastro e em Ajustes → Ajuda, então
  também é alcançável de dentro do app logado.
- **Excluir a conta pelo próprio app** (Ajustes → Excluir conta) — ver §5. Faltar isso é rejeição
  automática.
- **Login com a Apple** — ver §5. Obrigatório (regra 4.8) por existir login com Google.
- **Escolher, salvar e visualizar arquivos no celular** — ver §18. Sem isso, anexar e baixar
  simplesmente não funcionariam no app publicado.
- **Cobrança escondida no app das lojas** — abaixo.

### A regra de ouro da cobrança (`src/features/store.ts`)

A Apple não deixa um app cobrar por fora dela. E a regra não é só "não processar o pagamento
dentro do app": é **não apontar o caminho**. Preço na tela, botão "Assinar", link para o portal de
cobrança, "gerencie sua assinatura aqui" — qualquer um desses derruba a revisão, mesmo que a compra
aconteça em outro lugar.

O POUP cobra pelo Stripe, no site, e isso continua valendo para quem usa pelo navegador. No app das
lojas, toda a parte de cobrança fica invisível:

| Onde | No site | No app das lojas |
| --- | --- | --- |
| `/paywall` | planos, preços e Stripe Checkout | `InactiveAccountScreen`: aviso seco, sem preço e sem link |
| Banner do teste na home | "Toque para assinar" | só informa quantos dias faltam, sem virar botão |
| `ProFeatureLock` | preço do Pro + "Assinar o plano Pro" | explica o módulo, sem preço e sem botão |
| Ajustes → Assinatura | plano, status e "Gerenciar assinatura" | plano e status apenas |

`isStoreBuild` é `true` quando `EXPO_PUBLIC_STORE_BUILD=1` **ou**, por padrão, quando a plataforma
não é web. A variável existe para conferir esse modo **pelo navegador**, sem gerar um build nativo
a cada ajuste de texto — a diferença entre testar em segundos e testar em meia hora.

> **Armadilha ao testar os dois modos localmente:** o Metro guarda o módulo já transformado num
> cache em `/tmp/metro-cache`, e o valor de `EXPO_PUBLIC_*` é assado ali dentro. Trocar a variável e
> rodar `npm run build:web` de novo **reaproveita o build anterior** — os dois `dist` saem com o
> mesmo hash e parece que a flag não funciona. Limpe antes:
> `rm -rf /tmp/metro-cache /tmp/metro-file-map-* .expo node_modules/.cache`.
> No EAS cada build é uma máquina nova, então lá o problema não existe.

### Decisões que valem revisar

- **iPad desligado** (`ios.supportsTablet: false`). O app roda em modo compatibilidade no iPad e a loja deixa de exigir capturas de tela de 13". É uma linha para reverter, mais as capturas.
- **`expo-secure-store` removido**: estava declarado, nunca era usado, e trazia uma capacidade de Keychain que o app não precisa.
- **Token de sessão continua em AsyncStorage.** A Apple não exige Keychain, e trocar isso sem poder testar em aparelho arrisca quebrar o login (o `SecureStore` tem teto de 2 KB e a sessão do Supabase costuma passar disso). Fica registrado como melhoria, não como pendência de conformidade.

### Gerar um build de teste no EAS

O primeiro build costuma falhar por configuração, não por código. Em ordem:

1. **`extra.eas.projectId` no `app.json`.** Sem isso o EAS para logo no começo com
   *"The extra.eas.projectId field is missing"*. O identificador é criado pela Expo e fica em
   **expo.dev → o projeto → Project settings → Project ID**. Rode `eas init` (que escreve o campo
   sozinho) ou cole o valor na mão:

   ```json
   "extra": {
     "router": { "origin": false },
     "eas": { "projectId": "COLE-O-UUID-AQUI" }
   }
   ```

   Se a conta for de organização, `"owner": "<slug-da-conta>"` também precisa entrar na raiz do
   `expo`.

2. **Variáveis de ambiente nos segredos do EAS**: `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` e `EXPO_PUBLIC_APP_URL`. O `eas.json` versionado só define
   `EXPO_PUBLIC_STORE_BUILD` — segredo não entra em arquivo versionado. Se faltarem, o app agora
   abre numa tela dizendo exatamente o que faltou (`BackendMissingScreen`), em vez de instalar e
   não carregar nada.

3. **Perfil `preview`** é o de teste: gera **APK** no Android, que instala direto no aparelho sem
   loja nenhuma. É o único build possível hoje — o iOS, mesmo interno, exige a conta paga da Apple,
   que depende do D-U-N-S.

> **A pegadinha do build de teste:** o perfil `preview` roda com `EXPO_PUBLIC_STORE_BUILD=1`, ou
> seja, se comporta como o app das lojas — sem paywall, sem preço, sem link de cobrança. Se a conta
> usada no teste **não tiver assinatura ativa**, você vai parar na tela "Assinatura não está ativa"
> e não vai conseguir entrar. Deixe `subscriptions.status = 'active'` para o e-mail de teste no
> Supabase antes de instalar. É de propósito: testar um build que se comporta diferente da produção
> não testa nada.

### Antes do primeiro envio

- `app.json` já vai com `version: 1.0.0`, `ios.buildNumber`, `android.versionCode`,
  `ITSAppUsesNonExemptEncryption: false` (evita a pergunta de criptografia a cada envio) e
  `userInterfaceStyle: "automatic"` — este último **era `"light"`**, o que travaria o app no tema
  claro no celular mesmo com o modo escuro ligado.
- As permissões de câmera **e de fotos** estão declaradas para o `expo-image-picker`. A de fotos
  faltava: o scanner de documento cai na galeria quando a câmera é negada, e no iOS acessar a
  galeria sem `NSPhotoLibraryUsageDescription` **derruba o app na hora**.
- As variáveis `EXPO_PUBLIC_*` precisam existir no build do EAS (via `eas secret:create` ou o bloco
  `env` de `eas.json`) — o `eas.json` do repositório declara só `EXPO_PUBLIC_STORE_BUILD`, porque as
  outras são segredos e não entram em arquivo versionado.
- **Login com a Apple** usa o mesmo fluxo OAuth do Google (`signInWithProvider`), o que evita
  dependência nova e faz o botão funcionar também na web. Falta configurar o provedor Apple no
  Supabase, o que depende da conta de desenvolvedor. Se a revisão pedir a folha nativa de "Sign in
  with Apple", o próximo passo é `expo-apple-authentication` + `ios.usesAppleSignIn: true` — a
  entitlement foi deixada **de fora** de propósito, porque exigi-la sem a capability provisionada
  na conta Apple faz o build falhar.

---

## 🍏 Conformidade com a App Review da Apple

Auditoria feita contra a documentação oficial vigente. Cada item cita a regra.

### O que bloqueia o envio (resolver antes de gerar o build)

| Item | Regra / fonte | Situação |
| --- | --- | --- |
| Build com **Xcode 26 / iOS 26 SDK** | [Submitting](https://developer.apple.com/app-store/submitting/) — obrigatório desde 28/04/2026 | Projeto migrado para **Expo SDK 54** (React 19, RN 0.81, expo-router 6), que é o mínimo compatível com Xcode 26; `eas.json` pede `ios.image: "latest"`. Validado no que dá aqui: tsc, eslint, build web, 9 rotas sem erro de JS e prebuild do iOS. **O build nativo em si segue sem validação** — não há macOS neste ambiente. |
| **PrivacyInfo.xcprivacy** | [Privacy manifest files](https://developer.apple.com/documentation/BundleResources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk) — obrigatório desde iOS 17.2 | ✅ Validado: `ios.privacyManifests` no `app.json` gera o arquivo no projeto nativo (conferido com `expo prebuild`). |

### Regras que já estavam sendo violadas e foram corrigidas

| Regra | O que estava errado | Correção |
| --- | --- | --- |
| **2.1** App Completeness | O onboarding era um beco: sem fechar, sem pular, exigindo **CPF brasileiro com dígito verificador válido**. Um revisor da Apple não tem CPF — ficaria preso e nunca veria o app. | Botão "Preencher depois" em `OnboardingModal`. |
| **2.1** | Erro cru do Postgres/PostgREST na tela (~40 pontos): `duplicate key value violates unique constraint`, `PGRST116`, `row-level security policy`. | `src/data/friendlyError.ts`, aplicado dentro de `err()` — ponto único por onde toda falha do app passa. |
| **2.1** | A tela dizia ao corretor: *"falta rodar a migration 0023_commissions.sql no Supabase"*. Instrução de deploy na cara do usuário. | Diagnóstico vai para o log; o corretor lê o que pode fazer. |
| **2.1** | "Gerar Nota Fiscal" prometia emissão automática e respondia "ainda não está conectada"; um banner anunciava recurso futuro. | Rótulo passa a "Registrar Nota Fiscal" quando não há plataforma conectada, e os textos descrevem o que o app faz **hoje**. |
| **2.1** | `FeaturePlaceholder` ("Em desenvolvimento") e `MenuCard` ("Em breve") no bundle. | Removidos — eram código morto. |
| **4.8** Login Services | O login social nativo voltava para uma URL `https` (com fallback `http://localhost:8081`). O iOS só devolve o controle ao app por esquema próprio: o botão da Apple quebraria na mão do revisor. | `Linking.createURL('/')` → `poup://`, sem depender de variável de ambiente. |
| **5.1.1(i)** Privacy Policies | A política omitia a **Casa dos Dados** (recebe dados na prospecção) e o login com **Apple**; faltava a cláusula de proteção equivalente pelos terceiros e o "como revogar consentimento". | Todos incluídos em `app/privacidade.tsx`. |
| **5.1.1(v)** Account Sign-In | *"Apps may not require users to enter personal information to function"* — ver o beco do onboarding acima. | Mesma correção. |
| **5.1.2(i)** Data Use and Sharing | *"You must clearly disclose where personal data will be shared with third parties, **including with third-party AI**, and obtain explicit permission before doing so."* O scanner mandava a foto do documento **do cliente** para a Anthropic atrás de um botão com um emoji, sem uma palavra de aviso. | Consentimento explícito antes da primeira leitura (`src/features/scan/consent.ts`), nomeando o terceiro e pedindo confirmação de autorização do titular. |
| Segurança / LGPD | Os rascunhos do simulador guardam **nome, CPF e renda do cliente** em chave global, e não eram apagados na saída da conta: o próximo corretor no mesmo aparelho abriria o simulador com o cliente do anterior. | `clearLocalUserData()` no `signOut` e na exclusão de conta. |

### Por que o app não precisa de compra dentro do app

A regra é **3.1.3(f) Free Stand-alone Apps**: *"Free apps acting as a stand-alone companion to a paid web based tool ... do not need to use in-app purchase, provided there is no purchasing inside the app, or calls to action for purchase outside of the app."*

É exatamente o desenho do POUP: a assinatura é vendida no site, e o app das lojas não mostra preço, botão de assinar nem link de cobrança (ver §19). Para isso valer, o app **precisa ser gratuito** na App Store Connect.

### O que ainda depende de configuração manual

**Antes de gerar o build:**

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` e `EXPO_PUBLIC_APP_URL` precisam existir nos **EAS Secrets**. O `src/lib/env.ts` tem fallback silencioso para um host inexistente — sem os segredos, o app instala e não carrega nada.
- Rodar no Supabase de produção as migrations pendentes: `0023_commissions.sql`, `0024_catalog.sql`, `0025_uf.sql`, `0026_catalogo_sobrevive_ao_dono.sql`, `0027_financiamento.sql`, `0028_limite_ia.sql`, `0029_rastreabilidade.sql`.
- **A `0028` não é opcional.** Sem ela, `consumir_ia` não existe e o `_shared/cota.ts` recusa toda chamada de IA com 503 — de propósito: um limitador que abre quando quebra não é um limitador. Scanner, LIA, pitch e convite ficam fora do ar até a migration rodar.
- Publicar os Edge Functions `delete-account` e `get-financing-simulation` — este último com **Verify JWT desmarcado**, porque quem o chama é o navegador do CLIENTE do corretor, que não tem conta (ele valida pelo hash do token e pela expiração do link).
- **Publicar o Edge Function `lia-extract`** — obrigatório, e não é opcional depois de mexer nele. O aplicativo e a função combinam uma **versão de contrato** (`VERSAO_CONTRATO` em `src/features/lia/extrair.ts` × `VERSAO` na função) e a resposta ecoa a versão; sem o eco, o aplicativo mostra *"A LIA no servidor está desatualizada"* em vez de fingir que ouviu. Isso existe porque a versão anterior falhava em silêncio: a função procurava um campo que o aplicativo tinha parado de mandar, recebia `undefined` e respondia `{campos: []}` com status 200 — indistinguível de "a LIA não entendeu nada".
- Adicionar `poup://**` e `https://<dominio>/**` na lista de **Redirect URLs** do Supabase Auth. Sem o primeiro, o login social nativo não fecha; sem o segundo, o link de redefinição de senha cai no Site URL e a troca de senha nunca acontece.

**Na App Store Connect:**

- Preço: **Grátis** (exigência da 3.1.3(f)).
- Privacy Policy URL: `https://<dominio>/privacidade`
- Support URL: `https://<dominio>/suporte`
- App Privacy: **sem tracking e sem publicidade** — o app não tem nenhum SDK desse tipo, e `NSPrivacyTracking` é `false`. Os tipos coletados são os 9 declarados no `PrivacyInfo.xcprivacy` (via `ios.privacyManifests` no `app.json`).
- **Há analytics de primeira parte, e ele é declarado.** Desde a `0029`, o app grava eventos de uso do produto (criou empresa, começou simulação, gerou proposta) na nossa própria base — nenhum SDK de terceiro, nenhum dado saindo para rede de anúncio. Isso entra como `NSPrivacyCollectedDataTypeProductInteraction` com finalidade `Analytics`, e no formulário da App Store Connect como **Usage Data → Product Interaction**, ligado à identidade e **não** usado para rastreamento. Declarar isso não é opcional: o formulário pergunta o que o app coleta, não o que ele coleta com SDK de terceiro.

**Para o revisor (App Review Information) — o ponto mais importante:**

> A conta de teste **precisa ter assinatura ativa** (`subscriptions.status = 'active'` no Supabase). No app das lojas a cobrança é invisível: sem assinatura o revisor cai na tela "Assinatura não está ativa" e **não consegue revisar nada**. Isso sozinho reprova o app.

Vale também explicar na nota de revisão o que é a prospecção (consulta ao cadastro **público** de CNPJ) e que a leitura de documento por IA só roda depois de consentimento explícito.

---

## 🛠️ Utilitários

- **`src/components/ErrorBoundary.tsx`** — a rede contra a **tela branca**. Quando um componente quebra durante a renderização e ninguém captura, o React desmonta a árvore inteira e sobra uma tela em branco: sem aviso, sem botão, e com um relato de bug que não diz nada. A fronteira troca isso por uma tela que **mostra a mensagem do erro** (selecionável, para tirar print) e oferece "tentar de novo" e "voltar ao início". Há duas: uma em `app/_layout.tsx`, **por fora de todos os providers** (um erro no `AuthProvider` passaria por cima de uma fronteira interna), e outra em `app/(app)/_layout.tsx` em volta só das telas, para uma tela quebrada não levar junto a barra de navegação. Ela não usa o tema nem nenhum contexto de propósito — cores literais, `View`/`Text`/`Pressable` e nada mais, porque é a última linha.
- **`src/lib/masks.ts`** — `formatPhone`, `formatCNPJ`, `formatCPF`, `formatCurrencyBRL` (formata dígitos digitados como centavos → `R$ 350.000,00`) e `currencyToNumber` (inverso).
- **`src/lib/storage.ts`** — `sessionStorage` (`getItem`/`setItem`/`removeItem`): usa `AsyncStorage` no nativo e na web, com fallback em memória fora do browser (SSR/build). Usado tanto para a sessão do Supabase quanto para o rascunho do Simulador.
- **`src/theme/`** — paletas clara/escura (`AppColors`), `spacing` (escala de 4pt), `radius`, `typography`, `shadow`, `layout.maxContentWidth` (640, usado para não esticar o conteúdo em telas largas).
- **`Logo`/`Mark`** — a marca oficial do POUP dentro do app: **só o símbolo**, sem o nome por extenso.
- **`WordMark`** — segunda variante da marca (símbolo + "POUP" por extenso), usada especificamente em documentos externos (hoje, o cabeçalho do PDF da proposta).
