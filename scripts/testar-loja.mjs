/**
 * TESTES DAS REGRAS DE LOJA — o que o app das lojas NÃO pode mostrar.
 *
 * `npm run testar:loja`
 *
 * ===========================================================================
 * POR QUE ISTO PRECISA DE TESTE
 * ===========================================================================
 * Uma auditoria externa apontou três bloqueadores prováveis de reprovação na
 * App Store, e os três eram a mesma classe de erro: **o app das lojas mostrava
 * algo que não podia mostrar**.
 *
 *   * a LIA aparecia e dizia "Ainda não neste aplicativo" (regras 2.1 e 2.3 —
 *     recurso incompleto e metadado que não corresponde ao produto);
 *   * dava para criar conta e começar um teste grátis, num app cuja assinatura
 *     é vendida fora (regra 3.1.1);
 *   * o paywall listava a LIA como parte do plano Pro num binário que não a
 *     entrega.
 *
 * Todos os três se resolvem com uma constante em `features/store.ts`. E é
 * justamente por serem uma constante que precisam de teste: são três linhas
 * fáceis de inverter sem querer, o efeito só aparece num build nativo, e o
 * feedback vem semanas depois, pela reprovação.
 *
 * Estes testes rodam em segundos e dizem a mesma coisa que o build diria.
 *
 * ===========================================================================
 * COMO A PLATAFORMA É SIMULADA
 * ===========================================================================
 * `store.ts` decide por `Platform.OS` e pela variável
 * `EXPO_PUBLIC_STORE_BUILD` (que o `eas.json` manda como `"1"` nos perfis
 * `preview` e `production`). Aqui o `react-native` é trocado por um toco que
 * devolve a plataforma pedida, e a variável é escrita antes de compilar — o
 * módulo é recompilado a cada cenário porque as constantes são resolvidas na
 * importação.
 */
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

function compilar(arquivo, resolver) {
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  m.require = resolver;
  m._compile(js, arquivo);
  return m.exports;
}

/** Recompila `store.ts` para um cenário de plataforma. */
function store(storeBuild, plataforma) {
  process.env.EXPO_PUBLIC_STORE_BUILD = storeBuild;
  return compilar(path.join(process.cwd(), 'src/features/store.ts'), (spec) =>
    spec === 'react-native' ? { Platform: { OS: plataforma } } : require(spec),
  );
}

/** `plans.ts` depende de `store.ts` e de `env`; os dois entram como toco. */
function plans(storeBuild, plataforma) {
  const s = store(storeBuild, plataforma);
  return compilar(path.join(process.cwd(), 'src/features/plans.ts'), (spec) => {
    if (spec === './store') return s;
    if (spec === '@/lib/env') return { env: { stripePriceStart: '', stripePriceIntermed: '', stripePricePro: '' } };
    if (spec === '@/data/types') return {};
    return require(spec);
  });
}

let ok = 0;
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  if (condicao) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}
function secao(t) {
  console.log(`\n${t}`);
}

/* ===========================================================================
 * BUILD DE LOJA — o cenário que o EAS gera de verdade
 * ======================================================================= */
{
  secao('BUILD DE LOJA (EXPO_PUBLIC_STORE_BUILD=1)');

  const s = store('1', 'ios');
  checar('é build de loja', s.isStoreBuild === true);
  checar('cobrança escondida (3.1.1)', s.canShowBilling === false);
  checar('LIA escondida (2.1 / 2.3)', s.liaDisponivel === false);
  checar('cadastro e teste grátis bloqueados (3.1.1)', s.podeCriarConta === false);

  // O paywall não pode ANUNCIAR o que aquele binário não entrega.
  const p = plans('1', 'ios');
  checar(
    'a LIA some da lista exibida',
    p.PLAN_FEATURES_VISIVEIS.every((f) => f.key !== 'lia'),
  );
  checar(
    'o Pro não lista a LIA no app das lojas',
    p.PLANS.pro.features.every((f) => f.key !== 'lia'),
  );
  // Mas o DIREITO continua: quem paga o Pro tem a LIA na web.
  checar('o direito à LIA continua valendo', p.canUse('lia', 'pro') === true);
  checar('a fonte da verdade continua completa', p.PLAN_FEATURES.some((f) => f.key === 'lia'));
}

/* ===========================================================================
 * NATIVO SEM A FLAG — Expo Go, build local, qualquer coisa que não seja web
 * ======================================================================= */
{
  secao('NATIVO SEM A FLAG (o padrão seguro)');

  for (const os of ['ios', 'android']) {
    const s = store('', os);
    checar(`${os}: tratado como loja`, s.isStoreBuild === true);
    checar(`${os}: LIA escondida`, s.liaDisponivel === false);
    checar(`${os}: cadastro bloqueado`, s.podeCriarConta === false);
  }
}

/* ===========================================================================
 * WEB — o produto completo, onde a assinatura é vendida
 * ======================================================================= */
{
  secao('WEB (o produto completo)');

  const s = store('', 'web');
  checar('não é build de loja', s.isStoreBuild === false);
  checar('cobrança liberada', s.canShowBilling === true);
  checar('LIA disponível', s.liaDisponivel === true);
  checar('cadastro e teste grátis liberados', s.podeCriarConta === true);

  const p = plans('', 'web');
  checar('a LIA aparece na lista exibida', p.PLAN_FEATURES_VISIVEIS.some((f) => f.key === 'lia'));
  checar('o Pro lista a LIA', p.PLANS.pro.features.some((f) => f.key === 'lia'));
}

/* ===========================================================================
 * WEB EM MODO LOJA — conferir o app publicado sem gerar build nativo
 * ======================================================================= */
{
  secao('WEB COM A FLAG LIGADA (conferência pelo navegador)');

  const s = store('1', 'web');
  checar('a flag vence a plataforma', s.isStoreBuild === true);
  checar('LIA escondida', s.liaDisponivel === false);
  checar('cadastro bloqueado', s.podeCriarConta === false);
  checar('cobrança escondida', s.canShowBilling === false);

  // 'true' também liga, porque é o que alguém escreve sem pensar.
  const t = store('true', 'web');
  checar('"true" liga igual a "1"', t.isStoreBuild === true);
  const f = store('0', 'web');
  checar('"0" desliga', f.isStoreBuild === false);
}

/* ===========================================================================
 * A PROSPECÇÃO NÃO PODE VOLTAR SEM QUE ALGUÉM PERCEBA
 * ======================================================================= */
{
  secao('PROSPECÇÃO — removida por completo (5.1.1(viii))');

  const p = plans('', 'web');
  checar(
    'não existe mais a funcionalidade de plano "prospeccao"',
    p.PLAN_FEATURES.every((f) => f.key !== 'prospeccao'),
  );

  // O arquivo do cliente não pode voltar a chamar a Edge Function removida.
  const captacao = readFileSync(path.join(process.cwd(), 'src/lib/captacao.ts'), 'utf8');
  checar('o cliente não chama mais prospect-leads', !captacao.includes("invoke('prospect-leads'"));
  checar('não existe mais prospectLeads()', !/export async function prospectLeads/.test(captacao));
}

console.log(`\n${ok} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.log(`  FALHOU: ${f}`);
process.exit(falhas.length ? 1 : 0);
