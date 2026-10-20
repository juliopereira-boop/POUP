/**
 * TESTES DO "SINCRONIZAR EMPRESAS" — o atalho da tela inicial para o catálogo.
 *
 * `npm run testar:sincronizar`
 *
 * O que vem marcado, quando a janela abre sozinha, o lote com falha parcial e
 * as ligações no app (layout, guia, tela inicial, Cadastros › Empresas).
 *
 * Mesma técnica de `testar-disponibilidade.mjs`: o `.ts` é transpilado na hora.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const RAIZ = process.cwd();

const cache = new Map();
function carregar(relativo) {
  const arquivo = path.join(RAIZ, relativo);
  if (cache.has(arquivo)) return cache.get(arquivo);
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  cache.set(arquivo, m.exports);
  m.require = (spec) => {
    if (spec === '@/features/uf') return carregar('src/features/uf.ts');
    return require(spec);
  };
  m._compile(js, arquivo);
  cache.set(arquivo, m.exports);
  return m.exports;
}
const ler = (relativo) => readFileSync(path.join(RAIZ, relativo), 'utf8');

const S = carregar('src/features/catalog/sincronizar.ts');
const G = carregar('src/features/guide.ts');

let ok = 0;
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  if (condicao) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}
function secao(t) {
  console.log(`\n${t}`);
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function empresa(id, { ufs = [], adotada = false, ativa = true, obras = 3, nome = id } = {}) {
  return {
    company: { id, name: nome, ativa, photoUrl: null },
    developmentCount: obras,
    developmentNames: [],
    commissionSummary: null,
    ufs,
    adopted: adotada,
  };
}

const CATALOGO = [
  empresa('canopus', { ufs: ['MA'], nome: 'Canopus' }),
  empresa('piaui', { ufs: ['PI'], nome: 'Construtora do Piauí' }),
  empresa('semuf', { ufs: [], obras: 0, nome: 'Sem UF' }),
  empresa('jausa', { ufs: ['MA'], adotada: true, nome: 'Já usa' }),
  empresa('montando', { ufs: ['MA'], ativa: false, nome: 'Em montagem' }),
  empresa('duas', { ufs: ['MA', 'PI'], obras: 1, nome: 'Duas UFs' }),
];

// ---------------------------------------------------------------------------
secao('1. O que entra na janela');
// ---------------------------------------------------------------------------
checar(
  'inativa (em montagem) não aparece nem para o admin',
  !S.empresasDoCatalogo(CATALOGO).some((e) => e.company.id === 'montando'),
);
checar(
  'pendentes = ativas e ainda não adotadas',
  igual(S.paraSincronizar(CATALOGO).map((e) => e.company.id), ['canopus', 'piaui', 'semuf', 'duas']),
);

// ---------------------------------------------------------------------------
secao('2. O que já vem marcado (estado do corretor)');
// ---------------------------------------------------------------------------
checar(
  'corretor do MA: marca MA, a sem estado e a que tem MA entre outras; não marca só-PI',
  igual(S.marcadasDeInicio(CATALOGO, 'MA'), ['canopus', 'semuf', 'duas']),
  JSON.stringify(S.marcadasDeInicio(CATALOGO, 'MA')),
);
checar(
  'corretor sem estado no perfil: marca todas as pendentes',
  igual(S.marcadasDeInicio(CATALOGO, null), ['canopus', 'piaui', 'semuf', 'duas']),
);
checar('estado em minúsculas também vale', igual(S.marcadasDeInicio(CATALOGO, 'ma'), ['canopus', 'semuf', 'duas']));
checar('o número do botão é o das marcadas de início', S.quantasPendentes(CATALOGO, 'MA') === 3);
checar(
  'tudo adotado: zero pendentes',
  S.quantasPendentes([empresa('a', { adotada: true }), empresa('b', { ativa: false })], 'MA') === 0,
);

// ---------------------------------------------------------------------------
secao('3. Quando a janela abre sozinha');
// ---------------------------------------------------------------------------
checar('primeira vez com pendentes: abre', S.deveAbrirSozinha({ jaAberta: false, pendentes: 2 }) === true);
checar('já abriu antes: não abre de novo', S.deveAbrirSozinha({ jaAberta: true, pendentes: 2 }) === false);
checar('nada para sincronizar: não abre', S.deveAbrirSozinha({ jaAberta: false, pendentes: 0 }) === false);
checar('a marca é por conta', S.chaveJaAberta('u1') !== S.chaveJaAberta('u2') && S.chaveJaAberta('u1').includes('u1'));

// ---------------------------------------------------------------------------
secao('4. Textos');
// ---------------------------------------------------------------------------
checar('botão sem marcadas', S.rotuloDoBotao(0) === 'Marque ao menos uma empresa');
checar('botão com 1', S.rotuloDoBotao(1) === 'Sincronizar 1 empresa');
checar('botão com 3', S.rotuloDoBotao(3) === 'Sincronizar 3 empresas');
checar('detalhe no estado', S.detalheDaEmpresa(CATALOGO[0], 'MA') === '3 empreendimentos · MA');
checar('detalhe de fora do estado', S.detalheDaEmpresa(CATALOGO[1], 'MA') === '3 empreendimentos · só em PI');
checar('detalhe sem empreendimento', S.detalheDaEmpresa(CATALOGO[2], 'MA') === 'Sem empreendimentos ainda');
checar('detalhe no singular', S.detalheDaEmpresa(CATALOGO[5], 'MA') === '1 empreendimento · MA, PI');

// ---------------------------------------------------------------------------
secao('5. Sincronizar em lote');
// ---------------------------------------------------------------------------
{
  const chamadas = [];
  const r = await S.sincronizar(['canopus', 'piaui', 'canopus', 'semuf'], async (id) => {
    chamadas.push(id);
    if (id === 'piaui') return { ok: false, error: 'rede' };
    if (id === 'semuf') throw new Error('caiu');
    return { ok: true, data: undefined };
  });
  checar('id repetido sincroniza uma vez só', igual(chamadas.sort(), ['canopus', 'piaui', 'semuf']));
  checar('o que deu certo volta em sincronizadas', igual(r.sincronizadas, ['canopus']));
  checar(
    'erro devolvido e exceção viram falha com o motivo, sem derrubar as outras',
    igual(r.falhas, [{ id: 'piaui', erro: 'rede' }, { id: 'semuf', erro: 'caiu' }]),
  );
  const nomes = new Map(CATALOGO.map((e) => [e.company.id, e.company.name]));
  const texto = S.resumoDoResultado(r, nomes);
  checar('resumo cita a que entrou', texto.startsWith('Canopus já está no seu app.'), texto);
  checar('resumo cita, por nome, as que falharam', texto.includes('Construtora do Piauí, Sem UF'), texto);
  const tudo = S.resumoDoResultado({ sincronizadas: ['canopus', 'duas'], falhas: [] }, nomes);
  checar(
    'resumo de sucesso no plural',
    tudo === '2 construtoras já estão no seu app. Os empreendimentos delas já aparecem no simulador e nos cadastros.',
    tudo,
  );
}

// ---------------------------------------------------------------------------
secao('6. Quem abre a janela e quem ouve');
// ---------------------------------------------------------------------------
{
  let depoisRodou = 0;
  S.registrarAbridorDaSincronizacao(null);
  S.abrirSincronizacao({ depois: () => depoisRodou++ });
  checar('sem a janela montada, o "depois" acontece direto', depoisRodou === 1);

  let recebido = null;
  S.registrarAbridorDaSincronizacao((o) => (recebido = o));
  const depois = () => {};
  S.abrirSincronizacao({ depois });
  checar('com a janela montada, ela recebe o "depois"', recebido?.depois === depois);
  S.registrarAbridorDaSincronizacao(null);

  let avisos = 0;
  const parar = S.aoMudarAsEmpresas(() => avisos++);
  S.avisarQueAsEmpresasMudaram();
  parar();
  S.avisarQueAsEmpresasMudaram();
  checar('avisa quem ouve, e para de avisar depois do "parar"', avisos === 1);

  let simulador = 0;
  G.registrarAoTerminarOGuia(null);
  G.terminarOGuia(() => simulador++);
  checar('fim do guia sem ninguém ouvindo: segue para o simulador', simulador === 1);
  let repassado = null;
  G.registrarAoTerminarOGuia((d) => (repassado = d));
  const irAoSimulador = () => {};
  G.terminarOGuia(irAoSimulador);
  checar('fim do guia com a janela ouvindo: ela decide e recebe o "depois"', repassado === irAoSimulador);
  G.registrarAoTerminarOGuia(null);
}

// ---------------------------------------------------------------------------
secao('7. As ligações no aplicativo');
// ---------------------------------------------------------------------------
{
  const layout = ler('app/(app)/_layout.tsx');
  checar('o layout monta a janela e o botão', /<SincronizarEmpresas \/>/.test(layout));

  const guia = ler('src/components/WelcomeGuide.tsx');
  checar(
    'o guia, ao terminar (ou pular), avisa a sincronização',
    /depoisDeFecharJanela\(\(\) => terminarOGuia\(depois\)\)/.test(guia),
  );
  checar(
    'o simulador pedido no guia vira o "depois", em vez de abrir por cima da janela',
    !/if \(goToSimulation\) depoisDeFecharJanela/.test(guia),
  );

  const comp = ler('src/components/catalogo/SincronizarEmpresas.tsx');
  checar('a janela ouve o fim do guia', /registrarAoTerminarOGuia\(/.test(comp));
  checar('o botão abre a mesma janela', /registrarAbridorDaSincronizacao\(/.test(comp));
  checar('sincroniza pelo mesmo vínculo do aceite um a um', /db\.catalog\.adopt\(user\.id, id\)/.test(comp));
  checar('marca "já abriu" ao abrir', /sessionStorage\.setItem\(chaveJaAberta\(user\.id\), '1'\)/.test(comp));
  checar('o botão só aparece na tela inicial', /naInicial && user \?/.test(comp));
  checar(
    'o botão fica na mesma altura da LIA',
    /bottom: 74 \+ Math\.max\(insets\.bottom, spacing\.sm\)/.test(comp) &&
      /bottom: 74 \+ Math\.max\(insets\.bottom, spacing\.sm\)/.test(ler('src/components/lia/LiaBotao.tsx')),
  );
  checar('a LIA fica à direita e o botão à esquerda', /left: spacing\.lg/.test(comp) && /right: spacing\.lg/.test(ler('src/components/lia/LiaBotao.tsx')));
  checar('o aviso do que se autoriza continua na janela', /somente leitura/.test(comp) && /histórico não muda/.test(comp));
  checar('quem pula o cadastro não recebe a janela por cima do pedido de dados', /needsOnboarding\) return/.test(comp));

  const empresas = ler('app/(app)/cadastros/empresas.tsx');
  checar(
    'adotar e remover em Cadastros › Empresas atualizam o número do botão',
    (empresas.match(/avisarQueAsEmpresasMudaram\(\)/g) ?? []).length === 2,
  );

  const inicio = ler('app/(app)/index.tsx');
  checar('a tela inicial rola acima dos botões flutuantes', /folgaDosBotoes/.test(inicio));

  const passos = ler('src/features/guideSteps.ts');
  checar('o guia ensina o botão novo', /Sincronizar empresas/.test(passos));
}

console.log(`\n${ok} verificações ok, ${falhas.length} falha(s).`);
if (falhas.length) {
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
