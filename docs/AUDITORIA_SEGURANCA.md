# Auditoria de Segurança e LGPD — POUP

Data: 27/07/2026 · Escopo: app Expo/React Native (web + mobile), Supabase (Postgres/RLS/Storage/Auth), Edge Functions Deno, deploy Vercel.

## Resumo executivo

Risco geral: **médio-baixo, aceitável para lançar**. A base está sólida no que mais importa: nenhum segredo comitado, RLS habilitado em **todas** as 15 tabelas com política por `auth.uid()`, todo acesso a banco via query builder do Supabase (sem SQL concatenado), e o `stripe-webhook` valida a assinatura da Stripe corretamente.

Os problemas encontrados são de **abuso e validação de entrada**, não de vazamento de dados entre usuários: a cota da prospecção era burlável pelo próprio usuário (corrigido), o `create-checkout-session` aceitava qualquer `priceId` da conta Stripe (corrigido) e os endpoints públicos/IA aceitavam entrada sem limite de tamanho ou tipo (corrigido).

O único item **Alto** que fica pendente é a **ausência de rate limiting no `capture-lead`** (endpoint público, sem autenticação): não vaza dados, mas permite inundar a base de leads de qualquer corretor. Em LGPD, o que falta é processo/produto (exportar dados, excluir conta, registro de consentimento), não código de segurança.

## Corrigido nesta auditoria

**`supabase/migrations/0013_security_hardening.sql`** (novo, idempotente)
- `prospect_usage` tinha política `for all` — o usuário podia `update usados = 0` ou `delete` a própria linha pelo client e **zerar a cota de prospecção**, queimando créditos pagos da Casa dos Dados sem limite. Substituída por políticas `select`/`insert`/`update` (sem `delete`) + trigger `prospect_usage_monotonic`, que impede o contador de regredir e impede troca da chave (`user_id`/`dia`/`periodo`). As políticas de `insert`/`update` foram mantidas porque a Edge Function grava com o JWT do usuário (ver "Achados pendentes" → padrão service-role), não como service role.
- `alter table ... enable row level security` re-afirmado para as 15 tabelas (no-op seguro, protege contra tabela criada sem RLS em ambiente novo).

**`supabase/functions/capture-lead/index.ts`** (público, sem JWT)
- Entrada era usada sem checagem de tipo: `body.name.trim()` com `name` numérico gerava exceção não tratada (500). Agora todo campo passa por checagem de tipo `string`.
- `message` e `email` não tinham limite de tamanho — inserção pública ilimitada na tabela `leads`. Agora `message` ≤ 2000, `email` ≤ 320, `name` ≤ 200 (rejeita, não trunca silenciosamente).
- `brokerUserId`, `companyId`, `developmentId` agora validados como UUID (antes, valor inválido virava erro 500 do Postgres; `companyId` arbitrário era repassado direto ao insert).
- `email` validado por formato; `source` agora só é aceito se for `string` na allowlist.

**`supabase/functions/get-lead-page/index.ts`** (público, sem JWT)
- `brokerId` agora exige formato UUID (antes, tipo não-string quebrava com 500).
- Confirmado que a resposta expõe apenas o necessário para a landing (`full_name`, `agency`, `phone` do corretor + textos da campanha). **Não** expõe `email`, `cnpj` nem `creci`.

**`supabase/functions/scan-document/index.ts`**
- `mimeType` era repassado direto para a API da Anthropic sem validação → agora allowlist (`image/jpeg|png|webp|gif`).
- `imageBase64` sem limite de tamanho → agora teto de 8 MB de base64 (retorna 413).

**`supabase/functions/generate-invite/index.ts` e `generate-pitch/index.ts`**
- Texto do usuário era interpolado no prompt **sem limite de tamanho**: `max_tokens` limita a saída (1024), mas a entrada era ilimitada — custo por requisição sem teto. Agora nomes ≤ 200 e texto livre (`extra`, `descricao`) ≤ 2000, com checagem de tipo.

**`supabase/functions/prospect-leads/index.ts`**
- `uf` agora validado contra allowlist das 27 UFs; `cidade` limitada a 120 caracteres; ambos com checagem de tipo.
- Removidos os campos `detail` da resposta, que devolviam ao client o corpo de erro cru da API upstream e `(e as Error).message`. O client só lê `data.error`, então não houve mudança de contrato.

**`supabase/functions/create-checkout-session/index.ts`**
- `priceId` era repassado à Stripe **sem nenhuma validação**: um usuário autenticado podia assinar por qualquer preço existente na conta Stripe (inclusive um preço de teste barato) e o `stripe-webhook`, ao não reconhecer o price, concedia o tier `start` com 5 GB. Agora exige `string` com prefixo `price_` **e** pertencer à allowlist `STRIPE_PRICE_START`/`STRIPE_PRICE_PRO`.
  - **Ação necessária antes/depois do deploy:** confirme que os secrets `STRIPE_PRICE_START` e `STRIPE_PRICE_PRO` estão setados no projeto (`npx supabase secrets list`). Eles já são exigidos pelo `stripe-webhook` e secrets no Supabase são por projeto, então devem estar presentes. Se ambos estiverem vazios, a allowlist fica inativa e vale só a validação de formato — proposital, para não derrubar o checkout no lançamento.
- `successUrl`/`cancelUrl` eram repassados sem validação. Agora só `http:`/`https:` (bloqueia `javascript:`/`data:`) e ≤ 2000 caracteres.

**`supabase/functions/create-billing-portal-session/index.ts`**
- `returnUrl` com a mesma validação de esquema.

**Mensagens de erro (4 funções)**
- `create-checkout-session`, `create-billing-portal-session`, `scan-document` e `generate-invite` devolviam `(e as Error).message` cru ao client. Agora devolvem mensagem genérica e logam apenas `error.name` (sem corpo de request, token, telefone ou CPF).

**`src/data/supabase/SupabaseMaterialRepository.ts`**
- Sanitização de nomes usados como chave de Storage centralizada em `stripUnsafe`: remove caracteres de controle (`U+0000`–`U+001F` e `U+007F`), troca `/` e `\` por `_`, rejeita `.` e `..`, e limita o segmento a 120 caracteres. `upload` usa `sanitizeFileName`, que preserva a extensão ao truncar (evita quebrar a abertura do arquivo).
- `saveCompanyMaterial` agora rejeita `javascript:`/`data:`/`vbscript:`/`file:` no link do Drive e limita a 2000 caracteres — o valor é consumido por `Linking.openURL`, que na web poderia executar `javascript:` (self-XSS).

**`vercel.json`**
- Adicionados `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` e `X-DNS-Prefetch-Control: off` (headers sem impacto funcional).

## Achados críticos / pendentes

### 1. `capture-lead` sem rate limiting — **Alto**
Endpoint público, sem JWT. O `brokerUserId` é o UUID do corretor e circula abertamente na URL de captação (`/captar?c=<uuid>`) e no QR code. Não há limite por IP nem por corretor.
**Por que importa:** qualquer pessoa com o link pode inserir leads em volume na base de um corretor — poluição de dados, ruído no funil e custo de armazenamento. Não há vazamento nem escrita fora do `user_id` do corretor (o insert é fixado no `brokerUserId` validado).
**Correção concreta:** tabela `lead_capture_throttle (ip_hash text, broker_id uuid, janela timestamptz, contador int)` com upsert no início da função e teto (ex. 5/min por IP+corretor, 50/dia por corretor), ou proteger a rota na borda (Cloudflare/WAF na frente do domínio das functions). Mitigação de baixo esforço para amanhã: adicionar um honeypot (campo oculto que humanos não preenchem) + exigir `Origin` do domínio do app.

### 2. Padrão service-role + override de `Authorization` nas funções autenticadas — **Médio**
Todas as funções protegidas (`create-checkout-session`, `create-billing-portal-session`, `scan-document`, `generate-invite`, `generate-pitch`, `prospect-leads`) fazem `createClient(URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader } } })` e depois `auth.getUser()`.
**Situação atual: está funcionalmente correto e não há bypass.** Todas verificam header + `getUser()` e retornam 401 sem usuário; o PostgREST usa o JWT do `Authorization` para definir o role, então as queries rodam como `authenticated` com RLS aplicada (é justamente por isso que a política de `update` em `prospect_usage` precisou ser mantida).
**Por que importa:** é um footgun. A chave service role está no cliente; se um dia o header `Authorization` deixar de ser repassado, ou alguém adicionar uma query sem `.eq('user_id', user.id)`, o acesso silenciosamente vira full-admin sem RLS — falha aberta, não fechada.
**Correção concreta (pós-lançamento):** nessas seis funções, trocar `SUPABASE_SERVICE_ROLE_KEY` por `SUPABASE_ANON_KEY` mantendo o override do `Authorization`. O comportamento observável é idêntico e a falha passa a ser fechada. `capture-lead`, `get-lead-page` e `stripe-webhook` **devem continuar** com service role — precisam escrever/ler fora do contexto de um usuário logado.

### 3. `meta_lead_integrations.page_access_token` em texto claro — **Médio**
Tabela guarda `page_access_token` e `verify_token` do Meta sem cifra. RLS restringe ao dono (`auth.uid() = user_id`), então não há exposição entre usuários.
**Por que importa:** um XSS no app web ou o vazamento do token de sessão de um corretor entrega também o token da Página do Meta dele, que é um credencial de terceiro com validade longa.
**Correção concreta:** mover para Supabase Vault (`vault.create_secret`) e guardar apenas o `id` do segredo na tabela, com leitura só via Edge Function em service role; ou remover a política de `select` do usuário nessas duas colunas (o app não precisa ler o token de volta — só gravar).

### 4. Sessão em `localStorage` na web — **Médio (risco residual aceito)**
Padrão suportado do Supabase para Expo e explicitamente fora do escopo desta auditoria — **não foi alterado**. O risco residual é: XSS na web ⇒ roubo do token de sessão.
**Mitigação real:** não existe nenhum sink de XSS hoje (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`: zero ocorrências) e nenhuma dependência renderiza HTML de terceiros. O que reduziria o risco é uma CSP — ver Recomendações.

### 5. `UNLIMITED_EMAILS` com e-mail pessoal hardcoded — **Baixo**
`prospect-leads/index.ts:14` libera cota ilimitada para `julio.pereira@sellmyhouse.com.br`. O e-mail vem do JWT verificado, então não é falsificável sem controlar a conta (e sem confirmação de e-mail).
**Por que importa:** é uma regra de negócio em código, invisível para auditoria, e não expira. Se a confirmação de e-mail estiver desligada no Auth, alguém pode cadastrar esse endereço e herdar a cota.
**Correção concreta:** confirme que "Confirm email" está **on** no Supabase Auth; depois mova para uma coluna `prospect_unlimited boolean` em `profiles` ou `subscriptions`.

### 6. `stripe-webhook` sem deduplicação de eventos — **Baixo**
Assinatura verificada corretamente com `constructEventAsync` (fail-closed: secret vazio ⇒ exceção ⇒ 400). Não há registro de `event.id` processado.
**Por que importa:** replay de um evento válido é possível, mas o handler é idempotente (`upsert` por `user_id` com o estado da subscription buscado na Stripe), então o efeito é reescrever o mesmo estado. Impacto prático baixo.
**Correção concreta:** tabela `stripe_events (id text primary key, processed_at timestamptz)` com insert-if-not-exists no início do handler.

### 7. `get-lead-page` permite enumeração de dados do corretor — **Baixo**
Com um `brokerId` válido, qualquer um obtém nome, imobiliária e telefone do corretor sem autenticação.
**Por que importa:** é intencional (é o rodapé da landing pública de captação, dado comercial de contato). O ID é um UUID v4, inviável de enumerar por força bruta. Sem ação recomendada.

### 8. QR code gerado por serviço de terceiro — **Baixo**
`app/(app)/leads.tsx:91` envia a URL de captação (que contém o UUID do corretor) para `api.qrserver.com`.
**Por que importa:** transferência a terceiro sem previsão contratual; não são dados de lead, apenas o link público do corretor.
**Correção concreta:** gerar o QR localmente, ou citar o serviço na política de privacidade como operador.

### Itens verificados e sem problema (uma linha cada)
- **Segredos:** `.env` está no `.gitignore` e não é rastreado (`git check-ignore -v .env` → confirmado); `.env.example` só tem placeholders; nenhum `sk-ant`/`sk_live`/`whsec_`/JWT/service-role em arquivo rastreado — as ocorrências de `SUPABASE_SERVICE_ROLE_KEY` são leituras de `Deno.env.get()` e as de `whsec_`/`sk_test_` são placeholders de documentação.
- **RLS:** todas as 15 tabelas com `enable row level security` **e** política por `auth.uid()`. Nenhuma tabela desprotegida.
- **Políticas permissivas justificadas:** `appointment_types` e `appointment_statuses` são leitura para qualquer autenticado — são tabelas de referência estática (rótulo, cor, ícone), sem dado pessoal, e sem política de escrita. Correto.
- **`subscriptions`:** só tem `select` para o usuário; escrita exclusivamente pelo webhook em service role — usuário não consegue se conceder plano. Bem modelado.
- **Injeção SQL:** todo acesso via query builder do Supabase (parametrizado). Único `rpc` é `user_storage_used(uid)`, função `security definer` com parâmetro tipado `uuid`.
- **URLs:** todo valor de usuário em URL passa por `encodeURIComponent` (`leads.tsx:91,434`, `captar.tsx:92`); `fetchDetail` do `prospect-leads` monta a URL com CNPJ já reduzido a dígitos.
- **Storage:** bucket `uploads` privado, políticas de select/insert/update/delete exigem `(storage.foldername(name))[1] = auth.uid()::text`; travessia por `..` não escapa o prefixo porque o Supabase Storage trata a chave como string literal, sem resolver caminho — mesmo assim foi sanitizado.
- **Upload 20 MB:** limite aplicado em `material-venda.tsx:308` (`MAX_FILE_BYTES`), e a cota do plano é imposta no servidor pelo trigger `enforce_storage_quota` — o limite não depende só do client.
- **CORS `*`:** aceitável e mantido — nos endpoints públicos é necessário, nos protegidos a autorização vem do JWT, não da origem.
- **Logs do client:** nenhum `console.log` de dado de usuário no app. A única ocorrência (`src/lib/env.ts:6`) imprime o **nome** da variável ausente, nunca o valor.
- **XSS:** zero ocorrências de `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`.

## LGPD

### Implementado
- **Minimização na captação pública:** o formulário coleta apenas nome e telefone; `email`/`message` são opcionais e não são pedidos na UI.
- **Minimização na prospecção:** dos dados retornados pela Casa dos Dados, só são persistidos nome, telefone, e-mail e cidade/UF — e **somente** quando o corretor clica em salvar (`leads.tsx:onSave`). Nada é gravado automaticamente.
- **Aviso de finalidade:** existe uma linha em `app/captar.tsx:152` ("Seus dados são usados só para o corretor entrar em contato.").
- **Exclusão pelo titular (parcial):** o corretor pode excluir leads individualmente (`SupabaseLeadRepository.ts:86`), além de empresas, empreendimentos, correspondentes e simulações. `on delete cascade` em `auth.users` garante que apagar a conta no painel do Supabase apaga todos os dados vinculados.
- **Isolamento:** RLS garante que nenhum corretor acessa dados de outro.

### Pendente

**1. Base legal da prospecção — Pendente (prioridade alta, é documento, não código)**
A funcionalidade coleta dados de terceiros (nome de MEI + telefone comercial) sem consentimento do titular. A base legal aplicável é **legítimo interesse** (art. 7º, IX) para prospecção B2B com dado público de CNPJ — é defensável, mas hoje **não está documentada em lugar nenhum**. `docs/PROSPECCAO_CNPJ.md:50` só diz "respeite quem pedir para não ser contatado".
*Caminho mínimo:* registrar em uma página/seção de política: (a) a base legal invocada, (b) a origem dos dados (bases públicas de CNPJ via Casa dos Dados), (c) a finalidade (contato comercial B2B), (d) canal para oposição/descadastro. Como o titular não é usuário do app, o atendimento a pedidos é manual — defina um e-mail de contato do encarregado.

**2. Política de privacidade e registro de aceite — Pendente**
Não existe política de privacidade no app (nenhuma rota, nenhum link) nem registro de aceite no cadastro.
*Caminho mínimo:* publicar a política numa URL estática, linkar em `app/(auth)/signup.tsx` e em `captar.tsx`, e gravar o aceite: `alter table profiles add column privacy_accepted_at timestamptz, add column privacy_version text`, preenchido no signup. Sem isso não há prova de informação ao titular.

**3. Consentimento no formulário público — Pendente**
`captar.tsx` tem a frase de finalidade, mas sem checkbox de aceite, sem identificação do controlador, sem prazo de retenção e sem link para a política. Não implementei porque exige a política do item 2 (não vou inventar uma URL) e é decisão de produto.
*Caminho mínimo:* checkbox obrigatório + link para a política, e persistir `consent_at`/`consent_text_version` na tabela `leads` junto com o lead.

**4. Exportação de dados (art. 18, II e V) — Pendente**
Não existe.
*Caminho mínimo:* Edge Function autenticada que faz `select` das tabelas do usuário e devolve um JSON único para download. É a mais barata das pendências — cerca de 40 linhas, sem UI nova além de um botão em Configurações.

**5. Exclusão de conta pelo titular (art. 18, VI) — Pendente**
O usuário não consegue excluir a própria conta pelo app. `profiles` não tem política de `delete` e o client não pode apagar de `auth.users`. Hoje depende de ação manual no painel do Supabase.
*Caminho mínimo:* Edge Function em service role que valida o usuário e chama `admin.auth.admin.deleteUser(user.id)` — o `on delete cascade` já limpa todas as tabelas. Os arquivos em `storage` do prefixo `<uid>/` precisam ser removidos explicitamente antes. **Não implementei: é uma operação destrutiva e irreversível, não é algo para escrever e deployar sem teste na véspera do lançamento.**

**6. Revogação de consentimento / opt-out de lead — Pendente**
Não há campo de opt-out. Se um lead pede para não ser mais contatado, o corretor só pode excluir o registro (o que perde o rastro do pedido e permite recaptura do mesmo telefone).
*Caminho mínimo:* `alter table leads add column opt_out_at timestamptz` + filtro na listagem; ou uma tabela `lead_opt_outs (phone_hash text primary key)` consultada pelo `capture-lead`, que resolve também a recaptura.

**7. Retenção de dados de terceiros no dispositivo — Pendente (Baixo)**
`leads.tsx:614` guarda a lista de leads prospectados (nome + telefone de terceiros) em AsyncStorage/localStorage sob `prospect:${userId}`, sem cifra e sem expiração — na web, persiste no navegador indefinidamente.
*Caminho mínimo:* gravar `savedAt` no cache e descartar na leitura se tiver mais de 24–48 h.

**8. Registro de operações / encarregado (DPO) — Pendente**
Sem `ROPA` e sem encarregado nomeado. Obrigação formal, não técnica; resolve-se com documento + e-mail de contato publicado na política.

## Recomendações pós-lançamento

**Semana 1**
1. Rate limiting no `capture-lead` (achado 1) — é o único Alto em aberto e o mais provável de ser explorado, porque o link é público por natureza.
2. Verificar `npx supabase secrets list` para `STRIPE_PRICE_START`/`STRIPE_PRICE_PRO`, garantindo que a allowlist de preços do checkout está ativa.
3. Confirmar "Confirm email" habilitado no Supabase Auth (fecha o achado 5 e evita cadastro com e-mail de terceiro).
4. Rodar `get_advisors` (lint de segurança do Supabase) no projeto de produção — pega `search_path` mutável em funções e views `security definer` que uma leitura de migrations não detecta.

**Mês 1**
5. Trocar service role por anon key nas seis funções autenticadas (achado 2) — mudança pequena, transforma um footgun em falha fechada.
6. Política de privacidade publicada + aceite registrado + checkbox no `captar.tsx` (LGPD 2 e 3) — destrava a conformidade dos itens públicos.
7. Exportação de dados (LGPD 4) e exclusão de conta (LGPD 5), nessa ordem: a exportação é barata e sem risco, a exclusão precisa de teste cuidadoso em staging.
8. `page_access_token` para o Vault ou remover o `select` do usuário (achado 3).

**Backlog**
9. CSP na Vercel. Não adicionei agora porque o bundle web do Expo usa estilos/scripts inline e uma CSP restritiva pode quebrar a aplicação em produção — precisa de teste no preview antes. Comece com `Content-Security-Policy-Report-Only` para medir, e considere `X-Frame-Options: SAMEORIGIN` (também não aplicado: se algum corretor embutir a landing `/captar` em iframe no site próprio, quebraria).
10. Deduplicação de eventos da Stripe (achado 6).
11. Opt-out de leads (LGPD 6) e expiração do cache de prospecção (LGPD 7).
12. QR code gerado localmente (achado 8).

---

# Segunda rodada — 21/08/2026

Escopo desta rodada: **custo de API**, **telemetria** e **escala até 5 mil corretores** no stack atual (Vercel + Supabase + React Native). A primeira rodada olhou vazamento e validação de entrada; esta olha o que sangra dinheiro e o que quebra quando a base cresce.

## Resumo

O risco que sobrou depois da primeira rodada não era vazamento — era **custo sem teto**. Todo recurso de IA (scanner, LIA, pitch, convite) cobrava por uso contra uma assinatura de valor fixo, sem nenhum limite. Um corretor entusiasmado, ou um script apontado para a Edge Function, custava mais do que pagava, e nada disso aparecia em tela nenhuma até a fatura chegar.

Isso está fechado: `0028_limite_ia.sql` põe teto mensal e teto por minuto por plano, cobrados **no banco**, antes de qualquer chamada ao modelo.

## Corrigido nesta rodada

**`supabase/migrations/0028_limite_ia.sql`** (novo, idempotente)
- **Teto de uso de IA por plano e recurso** (`ai_limits`) e contagem por mês no fuso de Brasília (`ai_usage`). Recursos medidos separadamente: `scan`, `lia_escuta`, `lia_fechamento`, `lia_agenda`, `pitch`, `convite`. Escuta e fechamento da LIA são contadores distintos porque o fechamento usa o modelo caro com a conversa inteira no contexto — somados num contador só, ele desapareceria na média e o teto que importa não existiria de fato.
- **O teto nunca é parâmetro da chamada.** `consumir_ia(p_recurso, p_peso)` é `security definer` e descobre o plano por `auth.uid()`. Isso não é preciosismo: as Edge Functions criam o client com a chave de service role mas repassam o `Authorization` do usuário, então as queries rodam **como o usuário**. Se o teto viesse do lado de fora, bastaria chamar a função SQL direto do aparelho passando um número alto.
- **`ai_usage` é somente-leitura para o usuário.** Sem policy de insert/update/delete: quem escreve é a função definer. Uma cota que o dono da linha pode editar é uma sugestão, não uma cota.
- **`plano_de_cobranca(uuid)` teve o `execute` revogado do PUBLIC.** Ela aceita um uuid qualquer; chamada do aparelho, responderia se outra conta é admin e qual o plano dela. As funções que a usam são definer e rodam como o dono, então continuam funcionando.
- **Trava de rajada** (`teto_minuto`), na mesma linha do contador mensal para que uma leitura com `for update` resolva as duas. O teto mensal protege a margem; o de minuto protege contra o laço automatizado que queima o mês em segundos e estoura a concorrência da Edge Function. Uma pessoa nunca escaneia 30 documentos em um minuto; um script sempre faz.
- **`SELECT ... FOR UPDATE` no consumo.** Sem ele, ler-somar-gravar deixa duas requisições concorrentes verem o mesmo `usados` e gravarem o mesmo valor: o teto vaza exatamente no caso que ele existe para conter.
- **Cota da prospecção deixou de ser contada com uma corrida.** A 0013 já havia fechado o buraco grave (a policy `for all` dava DELETE ao dono da linha, e portanto ao aparelho). O que restava era mais silencioso: a Edge Function lia `usados`, somava `leads.length` em JavaScript e gravava o TOTAL — duas prospecções simultâneas sobrescreviam uma à outra em vez de somar. Agora o incremento é `usados = usados + N` dentro do banco, via `registrar_prospeccao()`.

**`cobrarUso`** (novo — copiado em `scan-document`, `lia-extract`, `generate-pitch` e `generate-invite`)
- Cobra **antes** da chamada ao modelo, e estorna quando a falha é nossa (502 da Anthropic, chave ausente, exceção). Cobrar depois deixaria a porta aberta: quem derruba a conexão no meio nunca seria cobrado, e repetir isso em laço é uso ilimitado. Quando a imagem simplesmente não dava para ler, a cobrança **fica** — o modelo já foi pago, e mandar borrão em laço seria uso ilimitado por outro caminho.
- **Falha de infraestrutura recusa a chamada.** Se o RPC estiver fora ou a migration não tiver rodado, a resposta é 503, não "pode passar". Um limitador que abre quando quebra não é um limitador.
- Nasceu em `_shared/cota.ts` e voltou para dentro de cada função: o deploy pelo Dashboard envia um arquivo só e o bundler falha com `Module not found` em qualquer import relativo para fora da pasta. Duplicação deliberada, com a condição anotada no topo de cada cópia — mexeu em uma, mexa nas quatro.

**`supabase/functions/scan-document/index.ts`**
- GIF saiu da allowlist de mimetype: documento de identidade é foto, e GIF animado só serviria para empurrar quadros de sobra no mesmo pedido.
- Teto de base64 de 8 MB para 6 MB, agora que o aplicativo reduz a imagem antes de enviar.

**`src/lib/imagemReduzida.ts`** (novo)
- Reduz a foto para 1600 px no lado maior antes de enviar. **Não é economia de token** — a API já reduz a 1568 px e cobra igual. É banda e tempo: 4 a 8 MB de base64 pelo 4G do corretor, na porta do empreendimento, com o cliente esperando. Reduzido, fica em 150–400 KB. Se a redução falhar, envia o original: foto grande que funciona é melhor que leitura que não acontece.

**`src/features/material/limits.ts`**
- Upload restrito a **PDF, JPEG, PNG e WebP**, máximo **20 MB por arquivo**, nas duas telas que enviam (material de venda e anexos do lead). Sem limite de tipo, o material de venda vira a nuvem pessoal de quem descobrir primeiro — e espaço é custo por mês, para sempre, contra uma assinatura fixa. Vídeo fica de fora de propósito: é o caso legítimo mais afetado e também o maior consumidor de espaço; o caminho dele é o link, que o cadastro da empresa já aceita.
- Extensão é a checagem principal e o mimetype é o reforço, não o contrário: no Android é comum um PDF válido chegar como `application/octet-stream`, e recusar por isso seria recusar arquivo legítimo.

**`src/lib/edgeError.ts`** (novo)
- `supabase.functions.invoke` devolve sempre `"Edge Function returned a non-2xx status code"` em `error.message` e esconde o corpo em `error.context`. Toda recusa de cota (429) chegaria ao corretor como uma frase em inglês sobre status HTTP, e a regra pareceria defeito. Vale para todo erro de Edge Function, não só para cota.
- Deliberadamente **não** resolvemos isso devolvendo 200 em tudo (que foi o atalho da prospecção): status correto é o que faz o log do Supabase e qualquer política futura de retentativa distinguirem "recusei de propósito" de "quebrou".

**`supabase/migrations/0029_rastreabilidade.sql`** (novo, idempotente)
- Telemetria do produto com **nenhum dado de cliente, garantido pela forma da tabela** e não por disciplina: `analytics_events` não tem coluna de texto livre. `evento` é lista fechada por CHECK, `etapa` e `resultado` têm teto de 40 caracteres, e o único identificador é um uuid interno. Não há onde um nome, CPF ou valor cair — nem por descuido, nem por pressa. Em LGPD isso é o melhor tipo de controle: o dado que não existe não vaza, não precisa de base legal e não entra em pedido de exclusão.
- Escrita: `insert` do próprio usuário. Leitura: **só admin**. Sem update nem delete — telemetria editável não serve de prova de nada. A poda por idade é `podar_analytics()`, restrita a admin, mínimo de 30 dias.
- `feedback` (o "Reportar problema ou dar sugestão") é o único campo de texto livre novo que sai do aparelho, e sai porque o corretor escreveu e apertou enviar. Teto de 2000 caracteres, com aviso na tela para não incluir dado de cliente.
- Os três agregados (`painel_eventos`, `painel_funil`, `painel_consumo_ia`) são `security definer` **com `is_app_admin()` dentro da própria query**: não é a tela que decide quem vê.
- Ambas as tabelas têm `on delete cascade` em `auth.users`, então a exclusão de conta pelo app (que chama `auth.admin.deleteUser`) já as leva junto.

**`src/data/supabase/limites.ts`** (novo) — teto explícito nas listas
- `select` sem `limit` **não devolve tudo**: o PostgREST corta no `db-max-rows` do projeto e devolve as primeiras N linhas com status 200 e nenhum aviso. Num CRM essa é a pior classe de defeito — a lista parece completa, o corretor confere e conclui que perdeu leads. Ninguém abre relatório de erro para isso; a pessoa desconfia do produto e vai embora.
- Aplicado em leads, simulações da poupança, simulações de financiamento, auditoria de regras, compromissos (`LIMITE_LISTA = 1000`) e em vendas e comissões (`LIMITE_HISTORICO = 5000`, porque ali uma linha que não aparece é uma comissão que o corretor acha que não recebeu).
- A conta que importa para os 5 mil corretores não é o total de linhas da tabela — o RLS já reduz toda consulta ao `user_id` de quem pediu —, é quanto **um** corretor acumula. Quando estes tetos começarem a ser alcançados de verdade, a resposta é paginação na tela, não um número maior no arquivo.

**`app/privacidade.tsx`**
- Declara as três coletas novas: medições de uso do produto (dizendo explicitamente que não incluem dado de cliente), contagem de uso dos recursos de IA, e o texto do "Reportar problema". Retenção da telemetria: seis meses.
- Item de Segurança agora diz que as regras valem no banco e não na tela, e que as chaves de pagamento e de IA nunca vão para o aparelho.

## Índices e escala

Conferidos os índices por `user_id` (ou composto com `user_id` como coluna líder) nas tabelas que crescem: `companies`, `developments`, `correspondents`, `leads`, `lead_stages`, `simulations`, `appointments`, `sales`, `commissions`, `commission_installments`, `financing_simulations`. Todas cobertas — o que importa aqui é que a política de RLS (`user_id = auth.uid()`) tenha índice para não virar varredura da tabela inteira a cada consulta, e é justamente isso que decide se 5 mil corretores caberem no Supabase atual.

Índices novos desta rodada: `analytics_events (evento, criado_em desc)`, `analytics_events (user_id, criado_em desc)`, `ai_usage (ciclo, recurso)`, `feedback (situacao, criado_em desc)`.

## Fica em aberto

1. **Rate limiting no `capture-lead`** — continua sendo o único achado Alto da primeira rodada em aberto. É endpoint público por natureza e não vaza dados, mas permite inundar a base de leads de um corretor. O padrão de contador atômico do `consumir_ia` serve de modelo, com a diferença de que ali não existe `auth.uid()` — a chave teria que ser o `brokerUserId` mais uma janela de tempo.
2. **Trocar service role por anon key nas funções autenticadas** — o achado 2 da primeira rodada. Continua valendo, e ficou mais visível nesta: foi exatamente esse padrão que obrigou o teto a morar no banco.
3. **`financing_rule_audit` aceita update e delete do admin.** Para uma trilha de auditoria, o correto é insert-only. Como existe um único admin, que é o dono, o risco prático é baixo — mas uma trilha que o interessado pode editar não prova nada.
4. **Nenhum dos tetos de `ai_limits` foi validado contra custo real.** Os números foram escolhidos por uso plausível e por folga na mensalidade, não por medição. O painel de rastreabilidade mostra o consumo do mês e o maior consumidor por recurso justamente para corrigir isso no piloto — e mudar um teto é `update`, não deploy.
5. **`podar_analytics()` não está agendada.** Rodar a mão, ou configurar cron no Supabase quando o volume justificar.
