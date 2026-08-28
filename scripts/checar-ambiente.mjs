/**
 * GUARDA DAS VARIÁVEIS DE AMBIENTE, ANTES DE O BUILD SAIR.
 *
 * `node scripts/checar-ambiente.mjs [web|loja] [--exigir]`
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * `src/lib/env.ts` tem fallback silencioso: sem `EXPO_PUBLIC_SUPABASE_URL` e
 * `EXPO_PUBLIC_SUPABASE_ANON_KEY`, ele aponta para `placeholder.supabase.co` e
 * o app **compila, instala e abre** — só não carrega nada. O `eas.json`
 * versionado define apenas `EXPO_PUBLIC_STORE_BUILD`, porque segredo não entra
 * em arquivo do repositório; as demais vivem nos segredos do EAS e da Vercel, e
 * esquecer de cadastrá-las lá não quebra nada até tarde demais.
 *
 * `BackendMissingScreen` já cobre o caso em tempo de execução, e continua
 * valendo. Mas a auditoria da App Store apontou o problema real: um build de
 * loja sem essas variáveis chega na mão do **revisor da Apple** com um app que
 * não faz nada. Isso não é bug para descobrir em produção — é reprovação, mais
 * um ciclo inteiro de revisão perdido. O lugar de perceber é aqui, antes de o
 * artefato existir.
 *
 * ===========================================================================
 * CONTEXTOS DIFERENTES EXIGEM COISAS DIFERENTES
 * ===========================================================================
 * Exigir tudo em todo lugar seria a saída preguiçosa, e quebraria o build de
 * quem não precisa daquilo. O que é obrigatório sai da leitura de
 * `features/store.ts` e `features/plans.ts`:
 *
 *   * **Os dois contextos** precisam do Supabase (`URL` + `ANON_KEY`) e de
 *     `EXPO_PUBLIC_APP_URL`. O `APP_URL` surpreende, mas é real: a tela de
 *     Leads monta o link da página pública de captação com `env.appUrl` **sem
 *     passar por `getAppUrl()`**, então sem a variável o corretor gera um QR
 *     Code apontando para `http://localhost:8081`. O mesmo vale para o link de
 *     simulação compartilhada com o cliente.
 *
 *   * **Só a web** precisa dos três `EXPO_PUBLIC_STRIPE_PRICE_*`. No build de
 *     loja `canShowBilling` é `false`: não há paywall, não há botão de assinar,
 *     e desde a remoção do checkout do binário o arquivo que usaria esses IDs
 *     nem entra no bundle (ver `src/features/cobranca/`). Exigi-los ali seria
 *     inventar uma trava que não protege nada.
 *
 *   * **Ninguém** precisa de `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Ela está no
 *     `.env.example` e em `env.ts`, mas nenhuma linha do aplicativo a lê — o
 *     Checkout é hospedado pelo Stripe e quem cria a sessão é a Edge Function,
 *     com a chave secreta. Cobrá-la aqui faria alguém perder tempo procurando
 *     uma chave que não muda nada.
 *
 * ===========================================================================
 * QUANDO ISTO REPROVA, E QUANDO SÓ AVISA
 * ===========================================================================
 * Na máquina de build — EAS, Vercel ou qualquer CI — falta de variável é
 * **erro**: aquele artefato vai para a mão de alguém.
 *
 * Na máquina de quem desenvolve, é **aviso**. Rodar `npm run build:web` para
 * conferir que o projeto ainda exporta é parte do ritual de validação deste
 * repositório, e é feito o tempo todo sem `.env` nenhum. Transformar isso em
 * erro não protegeria build nenhum — só ensinaria todo mundo a contornar a
 * checagem, que é o jeito mais rápido de ela deixar de existir.
 *
 * `--exigir` força o modo estrito em qualquer lugar (é o que `vercel-build` e o
 * gancho do EAS usam, para não depender de adivinhar a máquina).
 */

/** Placeholders de `src/lib/env.ts`. Cadastrar isto é o mesmo que não cadastrar. */
const PLACEHOLDERS = new Set(['https://placeholder.supabase.co', 'placeholder-anon-key']);

/**
 * As exigências, com o motivo junto.
 *
 * O motivo não é enfeite: quem lê esta saída está numa máquina de build, sem o
 * repositório aberto, tentando entender por que o deploy parou. A mensagem
 * precisa dizer o que quebra, não só o nome da variável.
 */
const REGRAS = [
  {
    nome: 'EXPO_PUBLIC_SUPABASE_URL',
    contextos: ['web', 'loja'],
    porque: 'sem ela o app abre e nada carrega — login, listas e uploads ficam mudos.',
  },
  {
    nome: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    contextos: ['web', 'loja'],
    porque: 'mesma coisa: é o par da URL acima, e uma sem a outra não serve.',
  },
  {
    nome: 'EXPO_PUBLIC_APP_URL',
    contextos: ['web', 'loja'],
    porque:
      'o link da página de captação e o link de simulação são montados com ela; ' +
      'sem ela, o QR Code do corretor aponta para http://localhost:8081.',
  },
  {
    nome: 'EXPO_PUBLIC_STRIPE_PRICE_START',
    contextos: ['web'],
    porque: 'o plano Start fica indisponível no paywall e ninguém consegue assinar.',
  },
  {
    nome: 'EXPO_PUBLIC_STRIPE_PRICE_INTERMED',
    contextos: ['web'],
    porque: 'idem, para o plano Intermed.',
  },
  {
    nome: 'EXPO_PUBLIC_STRIPE_PRICE_PRO',
    contextos: ['web'],
    porque: 'idem, para o plano Pro.',
  },
];

/** Onde cada variável é cadastrada, por contexto. Vai na mensagem de erro. */
const ONDE = {
  web: 'Vercel → Project Settings → Environment Variables (e redeploy: as EXPO_PUBLIC_* são assadas no build).',
  loja: 'EAS → Project settings → Environment variables, ou `eas secret:create`.',
};

const argv = process.argv.slice(2);
const forcado = argv.includes('--exigir');

/*
 * O contexto pode vir por argumento. Sem argumento: `EAS_BUILD` significa que
 * quem está compilando é a máquina do EAS, e ali só sai build nativo.
 */
const pedido = argv.find((a) => !a.startsWith('--'));
const contexto =
  pedido === 'loja' || pedido === 'nativo'
    ? 'loja'
    : pedido === 'web'
      ? 'web'
      : process.env.EAS_BUILD
        ? 'loja'
        : 'web';

const naMaquinaDeBuild = Boolean(process.env.EAS_BUILD || process.env.VERCEL || process.env.CI);
const estrito = forcado || naMaquinaDeBuild;

const faltando = [];

for (const regra of REGRAS) {
  if (!regra.contextos.includes(contexto)) continue;
  const valor = (process.env[regra.nome] ?? '').trim();
  if (valor === '') {
    faltando.push({ ...regra, motivo: 'não foi definida' });
    continue;
  }
  if (PLACEHOLDERS.has(valor)) {
    faltando.push({ ...regra, motivo: `ainda está com o valor de exemplo (${valor})` });
  }
}

const rotulo = contexto === 'loja' ? 'build de loja (iOS/Android)' : 'build da web';

if (faltando.length === 0) {
  console.log(
    `Ambiente conferido para o ${rotulo}: todas as variáveis obrigatórias estão presentes.`,
  );
  process.exit(0);
}

const cabecalho = estrito ? 'ERRO' : 'AVISO';
console.error(`\n${cabecalho}: faltam variáveis de ambiente para o ${rotulo}.\n`);
for (const f of faltando) {
  console.error(`  ${f.nome} — ${f.motivo}`);
  console.error(`      ${f.porque}\n`);
}
console.error(`  Onde cadastrar: ${ONDE[contexto]}`);
console.error(
  '  Referência das variáveis: .env.example e a seção "Variáveis de ambiente" do README.\n',
);

if (!estrito) {
  console.error(
    '  Só um aviso porque isto não parece uma máquina de build. Um build de verdade\n' +
      '  (EAS, Vercel, CI) para aqui — e `--exigir` reproduz esse comportamento.\n',
  );
  process.exit(0);
}

process.exit(1);
