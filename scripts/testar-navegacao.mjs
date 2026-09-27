/**
 * A NAVEGAÇÃO NÃO PODE TRAVAR.
 *
 * `npm run testar:navegacao`
 *
 * No TestFlight, indo e voltando entre as telas, o "Voltar" do iPhone parou de
 * responder (bug do botão nativo do iOS 26 no react-native-screens 4.16 — ver
 * `src/lib/navegacao.ts`). Este teste segura as quatro defesas:
 *
 *   1. `voltar()`: toque duplo não volta duas telas; sem histórico, vai para o
 *      Início em vez de não fazer nada;
 *   2. todo `Stack` com cabeçalho usa o "Voltar" nosso, não o nativo, e as
 *      páginas sem cabeçalho têm "Voltar" no topo;
 *   3. a biblioteca nativa está numa versão sem o defeito;
 *   4. quem fecha uma janela (`Modal`) para navegar espera ela sair.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
let passou = 0;
async function teste(nome, fn) {
  await fn();
  passou++;
  console.log(`ok ${nome}`);
}

function carregar(arquivo, mocks) {
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  m.require = (spec) => (spec in mocks ? mocks[spec] : require(spec));
  m._compile(js, arquivo);
  return m.exports;
}

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
const TODOS = [...arquivos('app'), ...arquivos('src')];
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// ------------------------------------------------------------------ 1. voltar()
const plataforma = { OS: 'ios' };
const N = carregar('src/lib/navegacao.ts', { 'react-native': { Platform: plataforma } });
function roteador(podeVoltar) {
  const r = { voltas: 0, trocas: [], canGoBack: () => podeVoltar, back: () => { r.voltas++; }, replace: (h) => r.trocas.push(h) };
  return r;
}

await teste('voltar: com histórico, volta uma tela', () => {
  N.reiniciarTravaDeVolta();
  const r = roteador(true);
  assert.equal(N.voltar(r, '/(app)', 10_000), true);
  assert.equal(r.voltas, 1);
});
await teste('voltar: toque duplo não volta duas telas', () => {
  N.reiniciarTravaDeVolta();
  const r = roteador(true);
  N.voltar(r, '/(app)', 10_000);
  assert.equal(N.voltar(r, '/(app)', 10_000 + 120), false);
  assert.equal(r.voltas, 1);
  assert.equal(N.voltar(r, '/(app)', 10_000 + N.INTERVALO_ENTRE_VOLTAS_MS + 1), true);
  assert.equal(r.voltas, 2);
});
await teste('voltar: sem histórico, vai para o destino de reserva (nunca fica preso)', () => {
  N.reiniciarTravaDeVolta();
  const r = roteador(false);
  assert.equal(N.voltar(r, '/(app)/leads', 50_000), true);
  assert.deepEqual(r.trocas, ['/(app)/leads']);
  assert.equal(r.voltas, 0);
});
await teste('depois de fechar janela: no iOS espera a janela sair; fora dele, na hora', async () => {
  let feito = 0;
  plataforma.OS = 'web';
  N.depoisDeFecharJanela(() => feito++);
  assert.equal(feito, 1);
  plataforma.OS = 'ios';
  N.depoisDeFecharJanela(() => feito++);
  assert.equal(feito, 1, 'no iOS não navega no mesmo instante');
  await new Promise((r) => setTimeout(r, N.ESPERA_FECHAR_JANELA_MS + 50));
  assert.equal(feito, 2);
});

// ------------------------------------------------ 2. cabeçalhos e páginas soltas
await teste('todo Stack com cabeçalho usa o "Voltar" nosso, não o nativo', () => {
  const layouts = TODOS.filter((f) => /_layout\.tsx$/.test(f));
  let comCabecalho = 0;
  for (const f of layouts) {
    const s = semComentarios(readFileSync(f, 'utf8'));
    if (!/<Stack\b/.test(s) || !/headerShown:\s*true/.test(s)) continue;
    comCabecalho++;
    assert.match(s, /cabecalhoComVoltar\(/, `${f} usa o botão nativo do iOS`);
    assert.doesNotMatch(s, /headerBackTitle/, `${f} ainda configura o botão nativo`);
  }
  assert.equal(comCabecalho, 3, 'o app tem três Stacks com cabeçalho (app, simulador, financiamento)');
});
await teste('páginas sem cabeçalho têm "Voltar" no topo', () => {
  for (const f of ['app/termos.tsx', 'app/privacidade.tsx', 'app/suporte.tsx', 'app/excluir-conta.tsx']) {
    assert.match(readFileSync(f, 'utf8'), /<VoltarNoTopo \/>/, f);
  }
});
await teste('nenhuma tela chama router.back() direto (só pelo voltar seguro)', () => {
  for (const f of TODOS) {
    if (f.endsWith(path.join('lib', 'navegacao.ts'))) continue;
    assert.doesNotMatch(semComentarios(readFileSync(f, 'utf8')), /router\.back\(\)|navigation\.goBack\(\)/, f);
  }
});
await teste('telas de detalhe não se empilham em dobro (getId)', () => {
  const s = readFileSync('app/(app)/_layout.tsx', 'utf8');
  for (const nome of ['leads/[id]', 'agendamentos/[id]', 'relatorios/[id]', 'comissao/[id]', 'vendas/[id]']) {
    const linha = s.split('\n').find((l) => l.includes(`name="${nome}"`));
    assert.ok(linha && /getId=\{porId\}/.test(linha), nome);
  }
});
await teste('a barra de baixo ignora toque na aba atual e toques seguidos', () => {
  const s = readFileSync('src/components/BottomTabBar.tsx', 'utf8');
  assert.match(s, /naRaizDaAba\(tab\)\) return/);
  assert.match(s, /INTERVALO_ENTRE_ABAS_MS/);
  assert.doesNotMatch(s, /onPress=\{\(\) => router\.replace/);
});

// ------------------------------------------------------- 3. a biblioteca nativa
await teste('react-native-screens sem o defeito do "Voltar" do iOS 26 (4.17+)', () => {
  const v = require('react-native-screens/package.json').version;
  const [maior, menor] = v.split('.').map(Number);
  assert.ok(maior > 4 || (maior === 4 && menor >= 17), `versão ${v}`);
  const nativo = readFileSync(require.resolve('react-native-screens/ios/RNSScreenStack.mm'), 'utf8');
  assert.doesNotMatch(nativo, /button\.userInteractionEnabled = false/);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(pkg.expo?.install?.exclude?.includes('react-native-screens'), 'o expo install não pode voltar para a 4.16');
});

// ------------------------------------------------ 4. janela fechando + navegação
await teste('quem fecha uma janela para navegar espera ela sair', () => {
  for (const f of TODOS) {
    const s = semComentarios(readFileSync(f, 'utf8'));
    if (!/<Modal\b|aoFechar\(\)|onFechar\(\)|onClose\(\)/.test(s)) continue;
    const linhas = s.split('\n');
    linhas.forEach((l, i) => {
      if (!/\b(?:set[A-Z]\w*\(false\)|aoFechar\(\)|onFechar\(\)|onClose\(\));/.test(l)) return;
      // A linha logo depois (a próxima não vazia) é uma navegação solta?
      const seguinte = linhas.slice(i + 1).find((x) => x.trim() !== '') ?? '';
      if (/^\s*router\.(?:push|replace|navigate)\(/.test(seguinte)) {
        assert.fail(`${f} fecha uma janela e navega no mesmo instante — use depoisDeFecharJanela:\n${l}\n${seguinte}`);
      }
    });
  }
});

console.log(`\n${passou} verificações de navegação passaram.`);
