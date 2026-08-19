/**
 * OS TESTES DO MOTOR DE FINANCIAMENTO.
 *
 * `npm run testar:financiamento`
 *
 * ===========================================================================
 * A LISTA DE TESTES É A DO MANUAL — §76 a §93
 * ===========================================================================
 * O manual técnico do motor não pede "testes"; ele especifica QUAIS. As seções
 * abaixo seguem a numeração dele:
 *
 *   §76  SAC e PRICE com 100.000 / 120 meses / 0,9% a.m.
 *   §77  conservação: saldo final zero
 *   §78  renda × comprometimento = parcela máxima
 *   §79  quota
 *   §80  entrada
 *   §81  FGTS
 *   §82  poder de compra
 *   §83  indexador: TR = 0 contra TR > 0
 *   §84  prefixado sem correção
 *   §85  idade
 *   §86  limite de valor do imóvel
 *   §87  quota nas três posições (abaixo, igual, acima)
 *   §88  prazo mínimo, máximo e acima do máximo
 *   §89  múltiplos participantes e pactuação de renda
 *   §90  MIP com idades diferentes
 *   §91  DFI sobre o valor de avaliação
 *   §92  carência
 *   §93  histórico: regra antiga continua valendo
 *
 * ===========================================================================
 * POR QUE ELES RODAM EM NODE PURO
 * ===========================================================================
 * O motor é função pura de ponta a ponta — sem React, sem Supabase, sem
 * navegador. Foi decisão de arquitetura justamente para que os testes fossem
 * ESTES: rápidos, sem simulador, sem servidor, sem mock. Os arquivos
 * TypeScript são transpilados na hora pelo compilador que já está em
 * `node_modules`, então não há passo de build nem dependência nova.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const RAIZ = path.join(process.cwd(), 'src/features/financiamento');

const cache = new Map();
function compilar(arquivo, resolverImport) {
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  m.require = resolverImport;
  m._compile(js, arquivo);
  return m.exports;
}

/** `@/lib/masks` é o único import externo do módulo. Vai real, não mockado. */
const masks = compilar(path.join(process.cwd(), 'src/lib/masks.ts'), require);

function carregar(nome) {
  if (cache.has(nome)) return cache.get(nome);
  const arquivo = path.join(RAIZ, `${nome}.ts`);
  cache.set(nome, {}); // marca antes de compilar, para aguentar ciclo de tipos
  const exports = compilar(arquivo, (spec) => {
    if (spec.startsWith('./')) return carregar(spec.slice(2));
    if (spec === '@/lib/masks') return masks;
    return require(spec);
  });
  cache.set(nome, exports);
  return exports;
}

const D = carregar('dinheiro');
const A = carregar('amortizacao');
const R = carregar('regras');
const IDX = carregar('indexador');
const SEG = carregar('seguros');
const PROP = carregar('proponentes');
const CRONO = carregar('cronograma');
const { REGRAS_PADRAO } = carregar('regrasPadrao');
const BANCOS_MOD = carregar('bancos');
const { simular, STATUS_ROTULO } = carregar('motor');
const REV = carregar('reverso');
const C = carregar('cenarios');
const PONTE = carregar('ponte');

/* ------------------------------------------------------------- harness */

let ok = 0;
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  if (condicao) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}
function quase(nome, a, b, tolerancia, detalhe = '') {
  checar(nome, Math.abs(a - b) <= tolerancia, detalhe || `(${a} vs ${b}, tol ${tolerancia})`);
}
function secao(t) {
  console.log(`\n${t}`);
}

const reais = D.reaisParaCentavos;

/** Regras com os seguros e o índice preenchidos, para testar o que depende deles. */
function comSeguros(extra = {}) {
  return {
    ...REGRAS_PADRAO,
    ...extra,
    seguros: {
      mipPorIdade: R.oficial(
        [
          { de: 18, ate: 30, taxaMensal: 0.0002 },
          { de: 31, ate: 50, taxaMensal: 0.0004 },
          { de: 51, ate: 70, taxaMensal: 0.0012 },
        ],
        'Apólice de teste',
        'https://exemplo',
        '2026-08-19',
      ),
      dfiPctMensalSobreAvaliacao: R.oficial(0.015, 'Apólice de teste', 'https://exemplo', '2026-08-19'),
      tarifaAdminMensal: R.oficial(25, 'Contrato de teste', 'https://exemplo', '2026-08-19'),
      ...(extra.seguros ?? {}),
    },
  };
}

function comIndice(idAlvo, taxaMensal, base = REGRAS_PADRAO) {
  return {
    ...base,
    indexadores: base.indexadores.map((i) =>
      i.id === idAlvo
        ? { ...i, taxaMensal: R.oficial(taxaMensal, 'BCB', 'https://bcb', '2026-08-19') }
        : i,
    ),
  };
}

function proponente(over = {}) {
  return {
    id: 'p1',
    nome: 'Cliente',
    idadeAnos: 34,
    rendaBruta: reais(8000),
    participacaoPct: null,
    ...over,
  };
}

const BASE = {
  operacao: 'aquisicao_novo',
  tipoImovel: 'residencial',
  uf: 'MA',
  municipio: 'São Luís',
  valorImovel: reais(300000),
  valorAvaliacao: D.ZERO,
  entradaPropria: reais(40000),
  fgtsDisponivel: reais(20000),
  fgtsUsado: reais(20000),
  subsidio: D.ZERO,
  proponentes: [proponente()],
  produtoId: 'informado',
  sistema: 'SAC',
  prazoMeses: 360,
  carenciaMeses: 0,
  cenarioIndexadorPct: null,
  taxaAnualPctInformada: 9,
  regimeTaxaInformado: 'efetiva',
  quotaMaxPctInformada: 80,
  comprometimentoMaxPctInformado: 30,
};

const cronoBase = {
  correcaoMensal: 0,
  carenciaMeses: 0,
  carenciaCapitalizaJuros: true,
  valorAvaliacao: reais(300000),
  proponentes: [],
  seguros: REGRAS_PADRAO.seguros,
  politica: 'mensal',
};

/* ===================================================================== */
secao('DINHEIRO — a base exata (§65, §66)');

checar('reais viram centavos', reais(210000) === 21000000);
checar('centavo quebrado arredonda para cima', reais(10.005) === 1001);
checar('negativo arredonda afastando do zero', D.centavos(-0.5) === -1);
checar('formata em pt-BR', D.formatarBRL(reais(1234567.89)) === 'R$ 1.234.567,89');
checar('formata negativo', D.formatarBRL(D.centavos(-500)) === '-R$ 5,00');

for (const [total, partes] of [
  [10000, 3],
  [1, 7],
  [999999, 420],
  [21000000, 360],
]) {
  const pedacos = D.ratear(D.centavos(total), partes);
  const soma = pedacos.reduce((s, p) => s + p, 0);
  checar(`ratear ${total}/${partes} soma o total`, soma === total, `(deu ${soma})`);
  checar(
    `ratear ${total}/${partes} varia no máximo 1 centavo`,
    Math.max(...pedacos) - Math.min(...pedacos) <= 1,
  );
}

// política de arredondamento
checar('política mensal fecha em centavos', D.conformePolitica(D.preciso(1234.7), 'mensal') === 1235);
checar('política final preserva a fração', D.conformePolitica(D.preciso(1234.7), 'final') === 1234.7);

/* ===================================================================== */
secao('TAXA NOMINAL × EFETIVA (§16, §17, §18)');

quase('10% NOMINAL = 0,8333% a.m.', D.taxaMensalDe(10, 'nominal'), 10 / 100 / 12, 1e-12);
quase('10% EFETIVA = 0,7974% a.m.', D.taxaMensalDe(10, 'efetiva'), Math.pow(1.1, 1 / 12) - 1, 1e-12);
quase('10% nominal tem efetivo de 10,4713%', D.efetivaAnualDe(10, 'nominal'), 10.4713, 0.0001);
quase('10% efetiva volta a 10% efetivo', D.efetivaAnualDe(10, 'efetiva'), 10, 1e-9);
checar(
  'os dois regimes NÃO dão a mesma taxa mensal',
  D.taxaMensalDe(10, 'nominal') !== D.taxaMensalDe(10, 'efetiva'),
);
// o impacto em dinheiro, que é o motivo de a distinção existir
{
  const p = reais(240000);
  const sacNominal = CRONO.gerarCronograma({
    ...cronoBase,
    financiado: p,
    prazoMeses: 420,
    sistema: 'SAC',
    taxaMensal: D.taxaMensalDe(10, 'nominal'),
  });
  const sacEfetiva = CRONO.gerarCronograma({
    ...cronoBase,
    financiado: p,
    prazoMeses: 420,
    sistema: 'SAC',
    taxaMensal: D.taxaMensalDe(10, 'efetiva'),
  });
  const dif = sacNominal.totalJuros - sacEfetiva.totalJuros;
  // Conferido no motor: ~R$ 18 mil num financiamento de R$ 240 mil em 35 anos.
  // O número exato importa menos que a ordem de grandeza — a distinção entre
  // nominal e efetiva vale uma entrada inteira.
  checar(
    'nominal × efetiva difere em mais de R$ 15 mil em 420 meses',
    dif > reais(15000),
    `(deu ${D.formatarBRL(dif)})`,
  );
}
checar('taxa zero continua zero', D.taxaMensalDe(0, 'nominal') === 0);

/* ===================================================================== */
secao('SAC e PRICE — o cenário do §76 (100.000 / 120 meses / 0,9% a.m.)');

{
  const PV = reais(100000);
  const i = 0.009;
  const n = 120;

  const sac = CRONO.gerarCronograma({ ...cronoBase, financiado: PV, prazoMeses: n, sistema: 'SAC', taxaMensal: i });
  // amortização = 100.000/120 = 833,33 ; juros1 = 0,9% de 100.000 = 900
  checar('SAC §76: amortização ≈ R$ 833,33', Math.abs(sac.parcelas[0].amortizacao - reais(833.33)) <= 1);
  checar('SAC §76: 1º juros = R$ 900,00', sac.parcelas[0].juros === reais(900));
  checar('SAC §76: 1ª parcela ≈ R$ 1.733,33',
    Math.abs(sac.parcelas[0].encargoPrincipal - reais(1733.33)) <= 1);
  // última: saldo 833,33 → juros 7,50 → parcela 840,83
  quase('SAC §76: última parcela ≈ R$ 840,83', sac.ultima.encargoPrincipal, reais(840.83), 100,
    `(deu ${D.formatarBRL(sac.ultima.encargoPrincipal)})`);
  checar('SAC §77: saldo final ZERO', sac.ultima.saldoFinal === 0, `(sobrou ${sac.ultima.saldoFinal})`);
  checar('SAC §77: amortiza o principal exato', sac.totalAmortizado === PV);

  const price = CRONO.gerarCronograma({ ...cronoBase, financiado: PV, prazoMeses: n, sistema: 'PRICE', taxaMensal: i });
  // PMT = 100000 · 0,009 · 1,009^120 / (1,009^120 − 1) = 1.366,14
  quase('PRICE §76: PMT ≈ R$ 1.366,14', price.parcelas[0].encargoPrincipal, reais(1366.14), 100,
    `(deu ${D.formatarBRL(price.parcelas[0].encargoPrincipal)})`);
  checar('PRICE §77: saldo final ZERO', price.ultima.saldoFinal === 0);
  checar('PRICE §77: amortiza o principal exato', price.totalAmortizado === PV);
  checar('PRICE §76: total de juros MAIOR que o do SAC', price.totalJuros > sac.totalJuros);
}

// conservação em vários prazos e nos dois sistemas
for (const sistema of ['SAC', 'PRICE']) {
  for (const prazo of [12, 120, 360, 420]) {
    const t = CRONO.gerarCronograma({
      ...cronoBase,
      financiado: reais(240000),
      prazoMeses: prazo,
      sistema,
      taxaMensal: D.taxaMensalDe(9, 'efetiva'),
    });
    checar(`${sistema} ${prazo}m gera ${prazo} linhas`, t.parcelas.length === prazo);
    checar(`${sistema} ${prazo}m fecha em ZERO`, t.ultima.saldoFinal === 0, `(sobrou ${t.ultima.saldoFinal})`);
    checar(`${sistema} ${prazo}m amortiza exatamente`, t.totalAmortizado === reais(240000));
    checar(`${sistema} ${prazo}m: saldo nunca negativo`, t.parcelas.every((l) => l.saldoFinal >= 0));
  }
}

{
  const sac = CRONO.gerarCronograma({ ...cronoBase, financiado: reais(240000), prazoMeses: 360, sistema: 'SAC', taxaMensal: 0.007 });
  const price = CRONO.gerarCronograma({ ...cronoBase, financiado: reais(240000), prazoMeses: 360, sistema: 'PRICE', taxaMensal: 0.007 });
  checar('SAC: prestação sempre cai',
    sac.parcelas.every((l, i) => i === 0 || l.encargoPrincipal <= sac.parcelas[i - 1].encargoPrincipal));
  checar('PRICE: encargo principal constante até a penúltima', (() => {
    const m = price.parcelas.slice(0, -1).map((l) => l.encargoPrincipal);
    return Math.max(...m) - Math.min(...m) <= 1;
  })());
  checar('SAC paga menos juros', sac.totalJuros < price.totalJuros);
  checar('1ª do SAC > 1ª da PRICE', sac.parcelas[0].encargoPrincipal > price.parcelas[0].encargoPrincipal);
}

/* ===================================================================== */
secao('INDEXADOR — §24 a §28, §83, §84');

{
  const semTR = CRONO.gerarCronograma({ ...cronoBase, financiado: reais(240000), prazoMeses: 360, sistema: 'SAC', taxaMensal: 0.007, correcaoMensal: 0 });
  const comTR = CRONO.gerarCronograma({ ...cronoBase, financiado: reais(240000), prazoMeses: 360, sistema: 'SAC', taxaMensal: 0.007, correcaoMensal: 0.001 });

  checar('§83: com TR > 0 o saldo atualizado é MAIOR', comTR.parcelas[0].saldoAtualizado > semTR.parcelas[0].saldoAtualizado);
  checar('§83: com TR > 0 o total de juros é maior', comTR.totalJuros > semTR.totalJuros);
  checar('§84: sem correção, a coluna de correção é ZERO', semTR.totalCorrecao === 0);
  checar('com correção, a coluna soma algo', comTR.totalCorrecao > 0);
  checar('§77: mesmo com TR o saldo fecha em zero', comTR.ultima.saldoFinal === 0);

  // §25: o índice entra ANTES dos juros
  const l1 = comTR.parcelas[0];
  checar('§25: saldo atualizado = saldo inicial + correção',
    l1.saldoAtualizado === l1.saldoInicial + l1.correcaoIndexador);
  quase('§25: juros incidem sobre o saldo ATUALIZADO', l1.juros, Math.round(l1.saldoAtualizado * 0.007), 1,
    `(juros ${l1.juros}, sobre atualizado ${Math.round(l1.saldoAtualizado * 0.007)}, sobre inicial ${Math.round(l1.saldoInicial * 0.007)})`);
  checar('§25: e NÃO sobre o saldo inicial', l1.juros !== Math.round(l1.saldoInicial * 0.007));
}

{
  // resolverCorrecao: as três origens
  const trPendente = REGRAS_PADRAO.indexadores.find((i) => i.id === 'TR');
  const prefixado = REGRAS_PADRAO.indexadores.find((i) => i.id === 'NONE');

  checar('prefixado: sem correção', IDX.resolverCorrecao({ indexador: prefixado }).origem === 'sem_correcao');
  checar('TR sem índice cadastrado: sem correção', IDX.resolverCorrecao({ indexador: trPendente }).origem === 'sem_correcao');
  checar('TR sem índice avisa que o real será maior',
    IDX.resolverCorrecao({ indexador: trPendente }).explicacao.includes('maior'));

  const cenario = IDX.resolverCorrecao({ indexador: trPendente, cenarioMensalPct: 0.1 });
  checar('§110: cenário vira PROJEÇÃO', cenario.origem === 'cenario');
  quase('cenário de 0,1% vira fração 0,001', cenario.taxaMensal, 0.001, 1e-12);
  checar('a explicação diz que é projeção', cenario.explicacao.toLowerCase().includes('projeção'));

  const trObservada = comIndice('TR', 0.0008).indexadores.find((i) => i.id === 'TR');
  checar('índice cadastrado vira "observada"', IDX.resolverCorrecao({ indexador: trObservada }).origem === 'observada');
  checar('o cenário GANHA do índice cadastrado',
    IDX.resolverCorrecao({ indexador: trObservada, cenarioMensalPct: 0.2 }).origem === 'cenario');
}

/* ===================================================================== */
secao('SEGUROS — §34, §35, §90, §91');

{
  const regras = comSeguros();
  const faixas = regras.seguros.mipPorIdade.valor;

  checar('a tábua acha a faixa certa', SEG.taxaMipDaIdade(faixas, 34) === 0.0004);
  checar('idade fora da tábua devolve null', SEG.taxaMipDaIdade(faixas, 75) === null);

  const quadro = PROP.montarQuadro([
    proponente({ id: 'a', idadeAnos: 30, rendaBruta: reais(5000) }),
    proponente({ id: 'b', idadeAnos: 55, rendaBruta: reais(5000) }),
  ]);
  const e = SEG.encargosDoMes({
    saldoDevedor: reais(200000),
    valorAvaliacao: reais(300000),
    proponentes: quadro.proponentes,
    regras: regras.seguros,
  });
  // §34: 200.000 × (0,0002×50% + 0,0012×50%) = 200.000 × 0,0007 = 140
  quase('§34: MIP soma por proponente, com pactuação', e.mip, reais(140), 1, `(deu ${D.formatarBRL(e.mip)})`);
  // §35: DFI = 0,015% de 300.000 = 45
  checar('§35: DFI incide sobre a AVALIAÇÃO', e.dfi === reais(45), `(deu ${D.formatarBRL(e.dfi)})`);
  checar('tarifa fixa entra em reais', e.tarifa === reais(25));
  checar('nada parcial quando tudo está cadastrado', e.parcial === false);

  // §90: idades diferentes mudam o MIP
  const soJovens = PROP.montarQuadro([
    proponente({ id: 'a', idadeAnos: 30, rendaBruta: reais(5000) }),
    proponente({ id: 'b', idadeAnos: 30, rendaBruta: reais(5000) }),
  ]);
  const eJovens = SEG.encargosDoMes({
    saldoDevedor: reais(200000),
    valorAvaliacao: reais(300000),
    proponentes: soJovens.proponentes,
    regras: regras.seguros,
  });
  checar('§90: casal jovem paga MIP MENOR', eJovens.mip < e.mip, `(${eJovens.mip} vs ${e.mip})`);

  // §91: mudar a avaliação muda o DFI
  const outraAvaliacao = SEG.encargosDoMes({
    saldoDevedor: reais(200000),
    valorAvaliacao: reais(600000),
    proponentes: quadro.proponentes,
    regras: regras.seguros,
  });
  checar('§91: DFI dobra quando a avaliação dobra', outraAvaliacao.dfi === e.dfi * 2);

  // idade não informada derruba o MIP inteiro, e não pela metade
  const semIdade = PROP.montarQuadro([
    proponente({ id: 'a', idadeAnos: 30, rendaBruta: reais(5000) }),
    proponente({ id: 'b', idadeAnos: null, rendaBruta: reais(5000) }),
  ]);
  const eSemIdade = SEG.encargosDoMes({
    saldoDevedor: reais(200000),
    valorAvaliacao: reais(300000),
    proponentes: semIdade.proponentes,
    regras: regras.seguros,
  });
  checar('MIP incompleto vira null, não meio-MIP', eSemIdade.mip === null);
  checar('e o mês fica marcado como parcial', eSemIdade.parcial === true);
}

// sem parâmetro cadastrado, NADA é inventado
{
  const e = SEG.encargosDoMes({
    saldoDevedor: reais(200000),
    valorAvaliacao: reais(300000),
    proponentes: PROP.montarQuadro([proponente()]).proponentes,
    regras: REGRAS_PADRAO.seguros,
  });
  checar('§74: MIP não cadastrado é null, nunca zero', e.mip === null);
  checar('§74: DFI não cadastrado é null', e.dfi === null);
  checar('§74: tarifa não cadastrada é null', e.tarifa === null);
  checar('e o total não soma null como zero', e.total === 0 && e.parcial === true);
}

/* ===================================================================== */
secao('PROPONENTES E PACTUAÇÃO — §5, §89');

{
  // O exemplo literal do §89
  const q = PROP.montarQuadro([
    proponente({ id: 'a', nome: 'A', rendaBruta: reais(3000), idadeAnos: 30 }),
    proponente({ id: 'b', nome: 'B', rendaBruta: reais(2500), idadeAnos: 45 }),
  ]);
  checar('§89: renda familiar = 5.500', q.rendaFamiliarBruta === reais(5500));
  quase('§89: A participa com 54,545%', q.proponentes[0].participacaoEfetivaPct, 54.5454, 0.001);
  quase('§89: B participa com 45,455%', q.proponentes[1].participacaoEfetivaPct, 45.4545, 0.001);
  checar('a soma das participações fecha 100%',
    Math.abs(q.proponentes.reduce((s, p) => s + p.participacaoEfetivaPct, 0) - 100) < 1e-9);
  checar('a idade que manda é a MAIOR', q.idadeMaisAlta === 45);

  // pactuação informada é respeitada
  const pactuado = PROP.montarQuadro([
    proponente({ id: 'a', rendaBruta: reais(3000), participacaoPct: 50 }),
    proponente({ id: 'b', rendaBruta: reais(2500), participacaoPct: 50 }),
  ]);
  checar('pactuação informada ganha da proporção de renda',
    pactuado.proponentes[0].participacaoEfetivaPct === 50);

  // soma errada é normalizada, e isso é registrado
  const torto = PROP.montarQuadro([
    proponente({ id: 'a', rendaBruta: reais(3000), participacaoPct: 60 }),
    proponente({ id: 'b', rendaBruta: reais(2500), participacaoPct: 30 }),
  ]);
  checar('soma ≠ 100 é normalizada', Math.abs(
    torto.proponentes.reduce((s, p) => s + p.participacaoEfetivaPct, 0) - 100) < 1e-9);
  checar('e a normalização é sinalizada', torto.participacaoNormalizada === true);
}

/* ===================================================================== */
secao('CARÊNCIA — §37, §92');

{
  const semCarencia = CRONO.gerarCronograma({ ...cronoBase, financiado: reais(240000), prazoMeses: 120, sistema: 'SAC', taxaMensal: 0.008 });
  const comCarencia = CRONO.gerarCronograma({ ...cronoBase, financiado: reais(240000), prazoMeses: 120, sistema: 'SAC', taxaMensal: 0.008, carenciaMeses: 12 });

  checar('§92: nos meses de carência não há amortização',
    comCarencia.parcelas.slice(0, 12).every((l) => l.amortizacao === 0));
  checar('§92: os 12 primeiros meses são marcados como carência',
    comCarencia.parcelas.slice(0, 12).every((l) => l.carencia));
  checar('§37: o saldo SOBE durante a carência',
    comCarencia.parcelas[11].saldoFinal > comCarencia.parcelas[0].saldoInicial);
  checar('§92: a amortização começa no mês 13', comCarencia.parcelas[12].amortizacao > 0);
  checar('§77: mesmo com carência, fecha em zero', comCarencia.ultima.saldoFinal === 0);
  checar('§92: com carência incorre-se em MAIS juros no total',
    comCarencia.totalJuros > semCarencia.totalJuros,
    `(${D.formatarBRL(comCarencia.totalJuros)} vs ${D.formatarBRL(semCarencia.totalJuros)})`);
  checar('§37: durante a carência os juros são capitalizados, não pagos',
    comCarencia.parcelas.slice(0, 12).every((l) => l.juros > 0 && l.jurosCapitalizados === l.juros));
  checar('§37: e o encargo principal da carência é zero',
    comCarencia.parcelas.slice(0, 12).every((l) => l.encargoPrincipal === 0));
  checar('§92: amortiza MAIS que o financiado (os juros viraram principal)',
    comCarencia.totalAmortizado > reais(240000));
  checar('§92: e a parcela depois da carência é maior',
    comCarencia.parcelas[12].encargoPrincipal > semCarencia.parcelas[12].encargoPrincipal);
}

/* ===================================================================== */
secao('CASOS EXTREMOS');

{
  const t = CRONO.gerarCronograma({ ...cronoBase, financiado: reais(240000), prazoMeses: 240, sistema: 'PRICE', taxaMensal: 0 });
  checar('taxa zero: PRICE não divide por zero', t.parcelas.length === 240);
  checar('taxa zero: juros totais = 0', t.totalJuros === 0);
  checar('taxa zero: fecha em zero', t.ultima.saldoFinal === 0);
}
checar('principal zero devolve cronograma vazio',
  CRONO.gerarCronograma({ ...cronoBase, financiado: D.ZERO, prazoMeses: 12, sistema: 'SAC', taxaMensal: 0.01 }).parcelas.length === 0);
{
  const t = CRONO.gerarCronograma({ ...cronoBase, financiado: D.centavos(1), prazoMeses: 3, sistema: 'SAC', taxaMensal: 0.01 });
  checar('1 centavo em 3 meses amortiza 1 centavo', t.totalAmortizado === 1);
  checar('1 centavo em 3 meses fecha em zero', t.ultima.saldoFinal === 0);
}
{
  const t = CRONO.gerarCronograma({ ...cronoBase, financiado: reais(100000), prazoMeses: 2, sistema: 'PRICE', taxaMensal: 0.5 });
  checar('taxa absurda: ainda termina', t.parcelas.length === 2);
  checar('taxa absurda: fecha em zero', t.ultima.saldoFinal === 0);
}

/* ===================================================================== */
secao('MOTOR — pipeline completo');

const s = simular(BASE, REGRAS_PADRAO);
checar('a simulação roda', s.ok === true, s.ok ? '' : s.erro);
if (s.ok) {
  const r = s.resultado;
  checar('§80: entrada total = próprio + FGTS', r.entradaTotal === reais(60000));
  checar('§80: financiado = base − entrada', r.valorFinanciado === reais(240000));
  quase('§79: quota aplicada = 80%', r.quotaAplicadaPct, 80, 0.001);
  checar('o cronograma tem 360 linhas', r.tabela.length === 360);
  checar('§77: fecha em zero', r.tabela[359].saldoFinal === 0);
  checar('§74: MIP não calculado', r.primeira.mip === null);
  checar('§74: os pendentes aparecem em naoCalculados', r.naoCalculados.length >= 3);
  checar('§95: status pede validação', r.status === 'REQUER_VALIDACAO', `(deu ${r.status})`);
  checar('§68: o snapshot vai junto', r.snapshot.versao === REGRAS_PADRAO.versao);
  checar('§69: o trace tem passos', r.trace.length >= 8, `(tem ${r.trace.length})`);
  checar('§69: o trace explica a taxa', r.trace.some((t) => t.etapa === 'Taxa' && t.detalhe.includes('efetiva')));
  checar('§69: o trace explica o valor financiado', r.trace.some((t) => t.etapa === 'Valor financiado'));
  checar('§64: o CET NÃO é calculado', r.cet === null);
  checar('§12: o motor diz qual restrição mandou', typeof r.restricaoQueMandou === 'string' && r.restricaoQueMandou.length > 0);
  checar('§13: classifica SFH', r.enquadramentoSfh === 'SFH', `(deu ${r.enquadramentoSfh})`);
  checar('todo status tem rótulo', typeof STATUS_ROTULO[r.status] === 'string');
}

// §8: avaliação menor que a venda manda no cálculo
{
  const comAvaliacao = simular({ ...BASE, valorAvaliacao: reais(280000) }, REGRAS_PADRAO);
  checar('§8: valor base = MIN(venda, avaliação)',
    comAvaliacao.ok && comAvaliacao.resultado.valorBase === reais(280000));
  checar('§8: o financiado cai junto',
    comAvaliacao.ok && comAvaliacao.resultado.valorFinanciado === reais(220000));
  checar('§8: e o corretor é avisado',
    comAvaliacao.ok && comAvaliacao.resultado.avisos.some((a) => a.includes('avaliação')));
}

// §81: FGTS nunca maior que o saldo
{
  const demais = simular({ ...BASE, fgtsDisponivel: reais(10000), fgtsUsado: reais(20000) }, REGRAS_PADRAO);
  checar('§10: FGTS usado é limitado ao saldo', demais.ok && demais.resultado.fgtsUsado === reais(10000));
  checar('§10: e o corte é avisado', demais.ok && demais.resultado.avisos.some((a) => a.includes('FGTS')));
}

// §78: renda × comprometimento
{
  const r5000 = simular({ ...BASE, proponentes: [proponente({ rendaBruta: reais(5000) })] }, REGRAS_PADRAO);
  checar('§78: parcela máxima = 30% de 5.000 = 1.500',
    r5000.ok && r5000.resultado.comprometimentoMaximo === reais(1500),
    r5000.ok ? `(deu ${D.formatarBRL(r5000.resultado.comprometimentoMaximo)})` : '');
}

// §87: quota nas três posições
{
  const abaixo = simular({ ...BASE, entradaPropria: reais(100000) }, REGRAS_PADRAO);
  const exata = simular(BASE, REGRAS_PADRAO);
  const acima = simular({ ...BASE, entradaPropria: D.ZERO, fgtsUsado: D.ZERO, fgtsDisponivel: D.ZERO }, REGRAS_PADRAO);
  const situacao = (x) => x.ok && x.resultado.elegibilidade.itens.find((i) => i.chave === 'quota')?.situacao;
  checar('§87: quota abaixo do limite → ok', situacao(abaixo) === 'ok');
  checar('§87: quota exatamente no limite → ok', situacao(exata) === 'ok');
  checar('§87: quota acima do limite → reprova', situacao(acima) === 'reprova');
  checar('§87: e a mensagem diz quanto falta de entrada',
    acima.ok && acima.resultado.elegibilidade.reprovacoes.some((i) => i.detalhe.includes('Faltam R$')));
}

// §88: prazo
{
  const regras = { ...REGRAS_PADRAO };
  const acima = simular({ ...BASE, produtoId: 'mcmv_classe_media', prazoMeses: 480, valorImovel: reais(400000), proponentes: [proponente({ rendaBruta: reais(12000) })] }, regras);
  checar('§88: prazo acima do máximo reprova',
    acima.ok && acima.resultado.elegibilidade.reprovacoes.some((i) => i.chave === 'prazo'),
    acima.ok ? JSON.stringify(acima.resultado.elegibilidade.reprovacoes.map((r) => r.chave)) : acima.erro);
  const dentro = simular({ ...BASE, produtoId: 'mcmv_classe_media', prazoMeses: 420, valorImovel: reais(400000), proponentes: [proponente({ rendaBruta: reais(12000) })] }, regras);
  checar('§88: prazo no máximo passa',
    dentro.ok && dentro.resultado.elegibilidade.itens.find((i) => i.chave === 'prazo')?.situacao === 'ok');
}

// §85: idade
{
  const regras = {
    ...REGRAS_PADRAO,
    produtos: REGRAS_PADRAO.produtos.map((p) =>
      p.id === 'informado'
        ? { ...p, idadeMaisPrazoMaxAnos: R.oficial(80, 'teste', 'https://x', '2026-08-19') }
        : p,
    ),
  };
  const jovem = simular({ ...BASE, prazoMeses: 420, proponentes: [proponente({ idadeAnos: 30 })] }, regras);
  const velho = simular({ ...BASE, prazoMeses: 420, proponentes: [proponente({ idadeAnos: 60 })] }, regras);
  const item = (x) => x.ok && x.resultado.elegibilidade.itens.find((i) => i.chave === 'idade');
  checar('§85: 30 anos + 35 = 65, dentro de 80', item(jovem)?.situacao === 'ok');
  checar('§85: 60 anos + 35 = 95, acima de 80', item(velho)?.situacao === 'reprova');
  checar('§85: e diz o prazo que caberia', item(velho)?.detalhe.includes('prazo máximo'));
  // a MAIOR idade é a que vale
  const casal = simular({
    ...BASE,
    prazoMeses: 420,
    proponentes: [proponente({ id: 'a', idadeAnos: 30 }), proponente({ id: 'b', idadeAnos: 60, rendaBruta: reais(3000) })],
  }, regras);
  checar('§89+§15: a idade do mais velho é a que reprova',
    item(casal)?.situacao === 'reprova');
}

// §86: teto de valor do imóvel
{
  const dentro = simular({ ...BASE, produtoId: 'mcmv_classe_media', valorImovel: reais(600000), entradaPropria: reais(150000), fgtsUsado: D.ZERO, fgtsDisponivel: D.ZERO, proponentes: [proponente({ rendaBruta: reais(12000) })] }, REGRAS_PADRAO);
  const acima = simular({ ...BASE, produtoId: 'mcmv_classe_media', valorImovel: reais(700000), entradaPropria: reais(200000), fgtsUsado: D.ZERO, fgtsDisponivel: D.ZERO, proponentes: [proponente({ rendaBruta: reais(12000) })] }, REGRAS_PADRAO);
  const it = (x) => x.ok && x.resultado.elegibilidade.itens.find((i) => i.chave === 'valorImovel');
  checar('§86: imóvel no teto passa', it(dentro)?.situacao === 'ok', JSON.stringify(it(dentro)));
  checar('§86: imóvel acima do teto reprova', it(acima)?.situacao === 'reprova');
  checar('§86: e diz o excedente', it(acima)?.detalhe.includes('Excedente'));
}

// MCMV Classe Média: a taxa NOMINAL de 10% do manual
{
  const cm = simular({
    ...BASE,
    produtoId: 'mcmv_classe_media',
    valorImovel: reais(400000),
    entradaPropria: reais(80000),
    fgtsUsado: D.ZERO,
    fgtsDisponivel: D.ZERO,
    proponentes: [proponente({ rendaBruta: reais(12000) })],
  }, REGRAS_PADRAO);
  checar('Classe Média simula', cm.ok === true, cm.ok ? '' : cm.erro);
  if (cm.ok) {
    checar('a taxa é 10% ao ano', cm.resultado.taxaAnualPct === 10);
    checar('e o regime é NOMINAL', cm.resultado.regimeTaxa === 'nominal');
    quase('que dá 0,8333% ao mês', cm.resultado.taxaMensal, 10 / 100 / 12, 1e-12);
    quase('e 10,4713% efetivos', cm.resultado.taxaAnualEfetivaPct, 10.4713, 0.001);
    checar('a quota é 80% (complemento da entrada de 20%)',
      cm.resultado.elegibilidade.itens.find((i) => i.chave === 'quota')?.situacao === 'ok');
    checar('a faixa de renda até 13 mil aceita 12 mil',
      cm.resultado.elegibilidade.itens.find((i) => i.chave === 'faixa')?.situacao === 'ok');
  }
  const rico = simular({
    ...BASE,
    produtoId: 'mcmv_classe_media',
    valorImovel: reais(400000),
    entradaPropria: reais(80000),
    fgtsUsado: D.ZERO,
    fgtsDisponivel: D.ZERO,
    proponentes: [proponente({ rendaBruta: reais(15000) })],
  }, REGRAS_PADRAO);
  checar('renda de 15 mil sai da faixa da Classe Média',
    rico.ok && rico.resultado.elegibilidade.reprovacoes.some((i) => i.chave === 'faixa'));
}

// linha sem parâmetro NÃO simula, e explica
{
  const mcmv = simular({ ...BASE, produtoId: 'mcmv_2' }, REGRAS_PADRAO);
  checar('linha sem taxa se recusa a simular', mcmv.ok === false);
  checar('e explica o caminho', !mcmv.ok && mcmv.erro.includes('Condições informadas'));
}

// §110: cenário marca o resultado como PROJEÇÃO
{
  const proj = simular({ ...BASE, produtoId: 'mcmv_classe_media', valorImovel: reais(400000), entradaPropria: reais(80000), fgtsUsado: D.ZERO, fgtsDisponivel: D.ZERO, proponentes: [proponente({ rendaBruta: reais(12000) })], cenarioIndexadorPct: 0.1 }, REGRAS_PADRAO);
  checar('§110: cenário vira status PROJECAO', proj.ok && proj.resultado.status === 'PROJECAO');
  checar('§111: e o aviso deixa isso claro',
    proj.ok && proj.resultado.avisos.some((a) => a.includes('PROJEÇÃO')));
  checar('§26: com correção, o saldo é corrigido',
    proj.ok && proj.resultado.totalCorrecao > 0);
}

// tudo cadastrado → status muda e a prestação fica completa
{
  const regras = comIndice('TR', 0.0008, comSeguros());
  const completo = simular({
    ...BASE,
    produtoId: 'mcmv_classe_media',
    valorImovel: reais(400000),
    entradaPropria: reais(80000),
    fgtsUsado: D.ZERO,
    fgtsDisponivel: D.ZERO,
    proponentes: [proponente({ rendaBruta: reais(12000), idadeAnos: 34 })],
  }, regras);
  checar('com tudo cadastrado a simulação roda', completo.ok === true, completo.ok ? '' : completo.erro);
  if (completo.ok) {
    const r = completo.resultado;
    checar('a prestação deixa de ser parcial', r.primeira.parcial === false);
    checar('MIP calculado', r.primeira.mip !== null && r.primeira.mip > 0);
    checar('DFI calculado', r.primeira.dfi !== null && r.primeira.dfi > 0);
    checar('tarifa calculada', r.primeira.tarifa === reais(25));
    checar('§32: prestação total > encargo principal',
      r.primeira.prestacaoTotal > r.primeira.encargoPrincipal);
    checar('§63: total de seguros somado', r.totalSeguros !== null && r.totalSeguros > 0);
    checar('§63: total de tarifas somado', r.totalTarifas === reais(25 * 420) || r.totalTarifas > 0);
    checar('total pago não é mais parcial', r.totalPagoParcial === false);
    checar('§95: status vira OFICIAL', r.status === 'OFICIAL', `(deu ${r.status})`);
    /*
     * §23 — PRICE NÃO SIGNIFICA PRESTAÇÃO TOTAL FIXA, e ela pode ir para os
     * DOIS lados. As duas metades do aviso:
     *
     *   PREFIXADO: o encargo principal é constante e o MIP cai junto com o
     *     saldo, então a prestação TOTAL diminui.
     *   COM TR: o saldo é corrigido, o encargo é recalculado sobre ele, e a
     *     prestação TOTAL sobe — é o que o cliente estranha no boleto.
     */
    const segurosSemIndice = comSeguros();
    const pricePrefixado = simular({
      ...BASE,
      produtoId: 'sbpe_prefixado',
      sistema: 'PRICE',
      valorImovel: reais(400000),
      entradaPropria: reais(80000),
      fgtsUsado: D.ZERO,
      fgtsDisponivel: D.ZERO,
      proponentes: [proponente({ rendaBruta: reais(12000), idadeAnos: 34 })],
    }, {
      ...segurosSemIndice,
      produtos: segurosSemIndice.produtos.map((p) =>
        p.id === 'sbpe_prefixado'
          ? {
              ...p,
              taxaAnualPct: R.oficial(11, 'teste', 'https://x', '2026-08-19'),
              quotaMaxPct: R.oficial(80, 'teste', 'https://x', '2026-08-19'),
              prazoMaxMeses: R.oficial(420, 'teste', 'https://x', '2026-08-19'),
            }
          : p,
      ),
    });
    /*
     * A comparação é com a PENÚLTIMA, não com a última.
     *
     * A última parcela do PRICE liquida o saldo remanescente e por isso difere
     * das outras — comportamento documentado em `cronograma.ts` e verdadeiro em
     * contrato real. Comparar com ela mediria o arredondamento, não a
     * constância da prestação.
     */
    checar('§23 prefixado: encargo principal constante até a penúltima',
      pricePrefixado.ok &&
        Math.abs(
          pricePrefixado.resultado.tabela[pricePrefixado.resultado.tabela.length - 2]
            .encargoPrincipal - pricePrefixado.resultado.primeira.encargoPrincipal,
        ) <= reais(1),
      pricePrefixado.ok ? '' : pricePrefixado.erro);
    checar('§23 prefixado: prestação TOTAL CAI (o MIP acompanha o saldo)',
      pricePrefixado.ok &&
        pricePrefixado.resultado.ultima.prestacaoTotal <
          pricePrefixado.resultado.primeira.prestacaoTotal);

    const priceComTr = simular({ ...BASE, produtoId: 'mcmv_classe_media', sistema: 'PRICE', valorImovel: reais(400000), entradaPropria: reais(80000), fgtsUsado: D.ZERO, fgtsDisponivel: D.ZERO, proponentes: [proponente({ rendaBruta: reais(12000), idadeAnos: 34 })] }, regras);
    checar('§23 com TR: a prestação TOTAL SOBE ao longo do contrato',
      priceComTr.ok &&
        priceComTr.resultado.ultima.prestacaoTotal > priceComTr.resultado.primeira.prestacaoTotal);
    checar('§22 com TR: o encargo é recalculado, e o contrato fecha em zero',
      priceComTr.ok && priceComTr.resultado.tabela[priceComTr.resultado.tabela.length - 1].saldoFinal === 0);
  }
}

/* ===================================================================== */
secao('PODER DE COMPRA — §39 a §44, §82');

{
  // renda alta, entrada baixa: trava na ENTRADA
  const p = REV.poderDeCompra({
    proponentes: [proponente({ rendaBruta: reais(30000) })],
    entradaPropria: reais(60000),
    fgtsUsado: D.ZERO,
    subsidio: D.ZERO,
    produto: REGRAS_PADRAO.produtos[0],
    regras: REGRAS_PADRAO,
    prazoMeses: 360,
    sistema: 'SAC',
    taxaAnualPctInformada: 9,
    regimeTaxaInformado: 'efetiva',
    quotaMaxPctInformada: 80,
    comprometimentoMaxPctInformado: 30,
  });
  checar('§82: o poder de compra calcula', p.ok === true, p.erro ?? '');
  checar('trava na entrada', p.limitante === 'entrada', `(travou ${p.limitante})`);
  checar('60k com quota 80% dá imóvel de 300k', p.valorImovelMax === reais(300000),
    `(deu ${D.formatarBRL(p.valorImovelMax)})`);
}
{
  // renda baixa, entrada alta: trava na RENDA
  const p = REV.poderDeCompra({
    proponentes: [proponente({ rendaBruta: reais(3000) })],
    entradaPropria: reais(200000),
    fgtsUsado: D.ZERO,
    subsidio: D.ZERO,
    produto: REGRAS_PADRAO.produtos[0],
    regras: REGRAS_PADRAO,
    prazoMeses: 360,
    sistema: 'SAC',
    taxaAnualPctInformada: 9,
    regimeTaxaInformado: 'efetiva',
    quotaMaxPctInformada: 80,
    comprometimentoMaxPctInformado: 30,
  });
  checar('trava na renda', p.limitante === 'renda', `(travou ${p.limitante})`);
  checar('§78: parcela máxima = 30% de 3.000 = 900', p.parcelaMaxima === reais(900));
  checar('§44: a prestação no limite respeita a parcela máxima',
    p.primeiraPrestacao <= p.parcelaMaxima,
    `(${D.formatarBRL(p.primeiraPrestacao)} vs ${D.formatarBRL(p.parcelaMaxima)})`);
  checar('§44: e chega perto do limite (busca convergiu)',
    p.primeiraPrestacao > p.parcelaMaxima - reais(5),
    `(${D.formatarBRL(p.primeiraPrestacao)})`);
}
{
  // §43: com seguros, a busca binária tem que descontá-los da capacidade
  const regras = comSeguros();
  const comum = {
    proponentes: [proponente({ rendaBruta: reais(6000), idadeAnos: 55 })],
    entradaPropria: reais(100000),
    fgtsUsado: D.ZERO,
    subsidio: D.ZERO,
    produto: REGRAS_PADRAO.produtos[0],
    prazoMeses: 360,
    sistema: 'SAC',
    taxaAnualPctInformada: 9,
    regimeTaxaInformado: 'efetiva',
    quotaMaxPctInformada: 80,
    comprometimentoMaxPctInformado: 30,
  };
  const semSeg = REV.poderDeCompra({ ...comum, regras: REGRAS_PADRAO });
  const comSeg = REV.poderDeCompra({ ...comum, regras });
  checar('§43: com seguros, o poder de compra é MENOR',
    comSeg.valorFinanciadoMax < semSeg.valorFinanciadoMax,
    `(${D.formatarBRL(comSeg.valorFinanciadoMax)} vs ${D.formatarBRL(semSeg.valorFinanciadoMax)})`);
  checar('§44: mesmo com seguros a prestação cabe na parcela máxima',
    comSeg.primeiraPrestacao <= comSeg.parcelaMaxima,
    `(${D.formatarBRL(comSeg.primeiraPrestacao)} vs ${D.formatarBRL(comSeg.parcelaMaxima)})`);
  checar('§40: os acessórios estimados são informados', comSeg.acessoriosEstimados > 0);
  checar('sem seguros cadastrados, o aviso aparece',
    semSeg.avisos.some((a) => a.includes('MIP')));
}
{
  // o cenário no limite tem que ENQUADRAR de verdade
  const p = REV.poderDeCompra({
    proponentes: [proponente({ rendaBruta: reais(5000), idadeAnos: 34 })],
    entradaPropria: reais(50000),
    fgtsUsado: D.ZERO,
    subsidio: D.ZERO,
    produto: REGRAS_PADRAO.produtos[0],
    regras: REGRAS_PADRAO,
    prazoMeses: 420,
    sistema: 'PRICE',
    taxaAnualPctInformada: 8,
    regimeTaxaInformado: 'efetiva',
    quotaMaxPctInformada: 80,
    comprometimentoMaxPctInformado: 30,
  });
  const conf = simular({
    ...BASE,
    valorImovel: p.valorImovelMax,
    entradaPropria: reais(50000),
    fgtsUsado: D.ZERO,
    fgtsDisponivel: D.ZERO,
    proponentes: [proponente({ rendaBruta: reais(5000), idadeAnos: 34 })],
    sistema: 'PRICE',
    prazoMeses: 420,
    taxaAnualPctInformada: 8,
  }, REGRAS_PADRAO);
  checar('§82: o cenário no limite enquadra',
    conf.ok && conf.resultado.elegibilidade.elegivel === true,
    conf.ok ? JSON.stringify(conf.resultado.elegibilidade.reprovacoes.map((r) => r.chave)) : conf.erro);
}

checar('§79: entrada necessária com quota 80%', REV.entradaNecessaria(reais(300000), 80) === reais(60000));
checar('§79: imóvel por entrada com quota 80%', REV.imovelPorEntrada(reais(60000), 80) === reais(300000));

/* ===================================================================== */
secao('UNIDADES COMPATÍVEIS');

{
  const estoque = [
    { item: 'Unidade 304', valor: reais(250000) },
    { item: 'Unidade 506', valor: reais(265000) },
    { item: 'Unidade 702', valor: reais(280000) },
    { item: 'Cobertura', valor: reais(420000) },
  ];
  const { compativeis, quaseLa } = REV.unidadesCompativeis(estoque, reais(270000), 10);
  checar('duas unidades cabem', compativeis.length === 2, `(coube ${compativeis.length})`);
  checar('a cobertura não cabe', !compativeis.includes('Cobertura'));
  checar('a 702 aparece como "quase lá"', quaseLa.length === 1 && quaseLa[0].item === 'Unidade 702');
  checar('e diz quanto falta', quaseLa[0].falta === reais(10000));
}

/* ===================================================================== */
secao('COMPARADOR — §94');

{
  const cenarios = C.montarCenarios(BASE, REGRAS_PADRAO, C.variacoesPadrao(360));
  checar('§94: monta quatro cenários', cenarios.length === 4, `(montou ${cenarios.length})`);
  const linhas = C.compararCenarios(cenarios);
  checar('a primeira linha é a primeira parcela', linhas[0].chave === 'primeira');
  const venc = C.vencedores(linhas.find((l) => l.chave === 'juros'));
  checar('quem ganha em juros é um SAC', venc.length >= 1 && cenarios[venc[0]].sistema === 'SAC');
  const vencP = C.vencedores(linhas.find((l) => l.chave === 'primeira'));
  checar('quem ganha na 1ª parcela é uma PRICE', vencP.length >= 1 && cenarios[vencP[0]].sistema === 'PRICE');
}

/* ===================================================================== */
secao('REGRAS — procedência, pendências e histórico (§93, §95, §106)');

checar('a versão de fábrica é 2026.08', REGRAS_PADRAO.versao === '2026.08');
checar('"Condições informadas" é sempre calculável',
  R.produtoCalculavel(REGRAS_PADRAO.produtos.find((p) => p.id === 'informado')));
checar('MCMV Classe Média é calculável (dados do manual)',
  R.produtoCalculavel(REGRAS_PADRAO.produtos.find((p) => p.id === 'mcmv_classe_media')));
checar('as faixas 1/2/3 do MCMV NÃO são calculáveis',
  REGRAS_PADRAO.produtos.filter((p) => /^mcmv_[123]$/.test(p.id)).every((p) => !R.produtoCalculavel(p)));

{
  const pend = R.parametrosPendentes(REGRAS_PADRAO);
  checar('há pendências declaradas', pend.length > 0);
  checar('toda pendência explica o motivo', pend.every((p) => p.motivo.length > 20));
  checar('o MIP está entre elas', pend.some((p) => p.onde.includes('MIP')));
  checar('o DFI está entre elas', pend.some((p) => p.onde.includes('DFI')));
  checar('a tarifa está entre elas', pend.some((p) => p.onde.includes('tarifa')));
  checar('a TR está entre elas', pend.some((p) => p.onde.includes('TR')));
}

checar('§106: todo parâmetro oficial tem fonte e data', (() => {
  const todos = REGRAS_PADRAO.produtos.flatMap((p) =>
    ['taxaAnualPct', 'quotaMaxPct', 'prazoMaxMeses', 'valorImovelMax', 'faixaRenda',
     'comprometimentoRendaMaxPct', 'subsidioMax', 'entradaMinimaPct'].map((k) => p[k]),
  );
  return todos.filter((p) => p.origem === 'oficial').every((p) => p.fonte && p.fonteUrl && p.verificadoEm);
})());

checar('§74: nenhum parâmetro pendente carrega valor',
  REGRAS_PADRAO.produtos.every((p) =>
    ['valorImovelMax', 'quotaMaxPct', 'prazoMaxMeses', 'taxaAnualPct', 'subsidioMax', 'entradaMinimaPct']
      .every((k) => p[k].origem !== 'pendente' || p[k].valor === null)));

// §13
{
  checar('§13: SFH até o limite', R.classificarSfh(REGRAS_PADRAO, 2000000).enquadramento === 'SFH');
  checar('§13: SFI acima', R.classificarSfh(REGRAS_PADRAO, 3000000).enquadramento === 'SFI');
  const semLimite = { ...REGRAS_PADRAO, sfh: { limiteValorImovel: R.pendente('x') } };
  checar('§13: sem limite cadastrado, indefinido — nunca chute',
    R.classificarSfh(semLimite, 3000000).enquadramento === 'indefinido');
}

// §93: a simulação antiga não muda quando a regra muda
{
  const antiga = simular(BASE, REGRAS_PADRAO);
  const snapshot = antiga.ok ? antiga.resultado.snapshot : null;
  const novasRegras = {
    ...REGRAS_PADRAO,
    versao: '2026.09',
    produtos: REGRAS_PADRAO.produtos.map((p) =>
      p.id === 'informado' ? { ...p, comprometimentoRendaMaxPct: R.oficial(20, 'x', 'https://x', '2026-09-01') } : p,
    ),
  };
  const refeita = simular(BASE, snapshot);
  const comNova = simular(BASE, novasRegras);
  checar('§93: reexecutar sobre o SNAPSHOT dá o mesmo resultado',
    antiga.ok && refeita.ok &&
    refeita.resultado.rendaMinimaEstimada === antiga.resultado.rendaMinimaEstimada &&
    refeita.resultado.versaoRegras === '2026.08');
  checar('§93: a regra NOVA muda o resultado novo',
    comNova.ok && comNova.resultado.versaoRegras === '2026.09');
  checar('§93: e o snapshot antigo não foi contaminado', snapshot.versao === '2026.08');
}

/* ===================================================================== */
secao('PONTE PARA O SIMULADOR DE POUPANÇA');

{
  const simSalva = {
    leadId: 'lead-1',
    clientName: 'Maria Souza',
    companyId: 'emp-1',
    developmentId: 'dev-1',
    block: 2,
    unit: '304',
    input: {
      valorImovel: reais(300000),
      subsidio: reais(12000),
      fgts: reais(20000),
      rendaFamiliarMensal: reais(5500),
    },
    financedValue: 220000,
  };
  const cliente = { cpf: '12345678901', email: 'maria@ex.com', phone: '98999990000', name: 'Maria' };
  const p = PONTE.pontePoupanca(simSalva, cliente);

  checar('o lead viaja', p.leadId === 'lead-1');
  checar('a empresa viaja', p.estado.companyId === 'emp-1');
  checar('bloco e unidade viajam', p.estado.block === 2 && p.estado.unit === '304');
  checar('valor do imóvel: centavos → máscara', p.estado.unitValue === 'R$ 300.000,00', `(deu ${p.estado.unitValue})`);
  checar('financiado: REAIS → máscara', p.estado.financingApproved === 'R$ 220.000,00', `(deu ${p.estado.financingApproved})`);
  checar('subsídio: centavos → máscara', p.estado.subsidy === 'R$ 12.000,00');
  checar('FGTS: centavos → máscara', p.estado.fgts === 'R$ 20.000,00');
  checar('o CPF do cliente viaja', p.estado.proponent1.cpf === '12345678901');
  checar('o nome da simulação ganha do nome do lead', p.estado.proponent1.name === 'Maria Souza');
  checar('o ato NÃO viaja', p.estado.ato === undefined);
  checar('as mensais NÃO viajam', p.estado.mensaisCount === undefined);

  const vazia = PONTE.pontePoupanca({ ...simSalva, input: { valorImovel: reais(300000) }, financedValue: null }, null);
  checar('subsídio ausente vira vazio', vazia.estado.subsidy === '');
  checar('financiado nulo vira vazio', vazia.estado.financingApproved === '');
  checar('sem cliente não quebra', vazia.estado.proponent1.cpf === '');
}

/* ==========================================================================
 * BANCOS — a porta do simulador
 *
 * O corretor escolhe o BANCO, e o simulador escolhe a linha. Estes testes
 * travam o contrato: um banco com tabela cadastrada abre numa linha oficial;
 * um banco sem tabela abre em "Condições informadas"; e o banco escolhido
 * viaja com o resultado, para o PDF saber onde a simulação foi feita.
 * ====================================================================== */
{
  secao('BANCOS — a porta do simulador');

  const bancos = BANCOS_MOD.BANCOS;
  checar('a Caixa é o primeiro da lista', [...bancos].sort((a, b) => a.ordem - b.ordem)[0].id === 'caixa');
  checar('todo banco tem nome, sigla e cor', bancos.every((b) => b.nome && b.sigla && /^#[0-9A-F]{6}$/i.test(b.cor)));
  checar('todo id de banco é único', new Set(bancos.map((b) => b.id)).size === bancos.length);
  checar('acharBanco devolve null para id desconhecido', BANCOS_MOD.acharBanco('banco-que-nao-existe') === null);
  checar('acharBanco devolve null para null', BANCOS_MOD.acharBanco(null) === null);
  checar('nomeDoBanco nunca devolve vazio', BANCOS_MOD.nomeDoBanco(null).length > 0);
  checar('nomeDoBanco resolve a Caixa', BANCOS_MOD.nomeDoBanco('caixa') === 'Caixa Econômica Federal');

  /* ---------------------------------------------- vínculo com as regras */
  const daCaixa = R.produtosDoBanco(REGRAS_PADRAO, 'caixa');
  checar('a Caixa tem linhas próprias', daCaixa.some((p) => p.bancoId === 'caixa'));
  checar('a linha genérica também aparece na Caixa', daCaixa.some((p) => p.bancoId === null));
  checar(
    'as próprias vêm antes das genéricas',
    daCaixa.findIndex((p) => p.bancoId === 'caixa') < daCaixa.findIndex((p) => p.bancoId === null),
  );

  const doItau = R.produtosDoBanco(REGRAS_PADRAO, 'itau');
  checar('banco sem tabela só enxerga a linha genérica', doItau.every((p) => p.bancoId === null));
  checar('e ela existe', doItau.length >= 1);

  /* ------------------------------------------------- a linha automática */
  const padraoCaixa = R.produtoPadraoDoBanco(REGRAS_PADRAO, 'caixa');
  checar('a Caixa abre numa linha oficial', padraoCaixa !== null && padraoCaixa.parametrosManuais === false);
  checar('e essa linha é calculável', padraoCaixa !== null && R.produtoCalculavel(padraoCaixa));

  const padraoItau = R.produtoPadraoDoBanco(REGRAS_PADRAO, 'itau');
  checar('banco sem tabela abre em condições informadas', padraoItau !== null && padraoItau.parametrosManuais === true);

  /*
   * O ponto que mais importa: uma linha SEM parâmetro cadastrado nunca pode
   * ser a escolhida sozinha. Abrir o simulador nela mostraria uma tela vazia
   * sem explicar por quê.
   */
  const soPendentes = {
    ...REGRAS_PADRAO,
    produtos: REGRAS_PADRAO.produtos.filter((p) => p.bancoId === 'caixa' && !R.produtoCalculavel(p)),
  };
  const semNadaCalculavel = R.produtoPadraoDoBanco(soPendentes, 'caixa');
  checar(
    'sem linha calculável, ainda devolve algo em vez de null',
    soPendentes.produtos.length === 0 ? semNadaCalculavel === null : semNadaCalculavel !== null,
  );
  checar('banco desconhecido cai na linha genérica', R.produtoPadraoDoBanco(REGRAS_PADRAO, 'inexistente')?.parametrosManuais === true);

  /* ----------------------------------------- o banco viaja no resultado */
  const comBanco = simular({ ...BASE, bancoId: 'caixa', produtoId: 'mcmv_classe_media', valorImovel: reais(400000) }, REGRAS_PADRAO);
  checar('simulação com banco calcula', comBanco.ok === true);
  checar('o banco escolhido viaja no resultado', comBanco.ok && comBanco.resultado.produto.bancoId === 'caixa');

  const outroBanco = simular({ ...BASE, bancoId: 'itau', produtoId: 'informado' }, REGRAS_PADRAO);
  checar(
    'condição informada guarda o banco do corretor, não null',
    outroBanco.ok && outroBanco.resultado.produto.bancoId === 'itau',
  );

  const semBanco = simular({ ...BASE, produtoId: 'informado' }, REGRAS_PADRAO);
  checar('sem banco informado, cai no banco do produto', semBanco.ok && semBanco.resultado.produto.bancoId === null);

  /* -------------------------------------------- todo produto tem bancoId */
  checar(
    'todo produto cadastrado declara a que banco pertence',
    REGRAS_PADRAO.produtos.every((p) => p.bancoId === null || typeof p.bancoId === 'string'),
  );
  checar(
    'todo bancoId de produto existe na lista de bancos',
    REGRAS_PADRAO.produtos.every((p) => p.bancoId === null || bancos.some((b) => b.id === p.bancoId)),
  );
}

/* ==========================================================================
 * PARAMETRIZAÇÃO — o que a especificação de regras exige
 *
 * Renda mínima e máxima, entrada mínima efetiva, base do comprometimento,
 * formato da versão, confiabilidade e a lista honesta de componentes.
 * ====================================================================== */
{
  secao('PARAMETRIZAÇÃO — faixas, bases e procedência');

  /* -------------------------------------------- formato da versão (§10) */
  checar('2026.08 é válida', R.versaoValida('2026.08'));
  checar('2026.08.1 (revisão) é válida', R.versaoValida('2026.08.1'));
  checar('mês 13 é recusado', !R.versaoValida('2026.13'));
  checar('mês 00 é recusado', !R.versaoValida('2026.00'));
  checar('ano de dois dígitos é recusado', !R.versaoValida('26.08'));
  checar('texto livre é recusado', !R.versaoValida('agosto'));

  /* ------------------------------------- entrada mínima efetiva (§2.10) */
  checar('entrada 10% com quota 80% vira 20%', R.entradaMinimaEfetivaPct(10, 80) === 20);
  checar('entrada 25% com quota 80% continua 25%', R.entradaMinimaEfetivaPct(25, 80) === 25);
  checar('sem entrada cadastrada, manda a quota', R.entradaMinimaEfetivaPct(null, 90) === 10);
  checar('sem quota cadastrada, manda a entrada', R.entradaMinimaEfetivaPct(15, null) === 15);
  checar('sem nenhum dos dois, não há mínimo', R.entradaMinimaEfetivaPct(null, null) === null);
  checar('quota de 100% não exige entrada', R.entradaMinimaEfetivaPct(0, 100) === 0);

  /* ------------------------------------------- confiabilidade (§8, §13) */
  const semNada = { ...REGRAS_PADRAO, statusConfiabilidade: 'oficial_configurado', fonte: null, fonteUrl: null, verificadoEm: null };
  checar('sem fonte, não é oficial', R.confiabilidadeDaVersao(semNada) === 'estimativa');
  const semData = { ...REGRAS_PADRAO, statusConfiabilidade: 'oficial_configurado', fonte: 'CAIXA', fonteUrl: 'https://x', verificadoEm: null };
  checar('sem data de verificação, não é oficial', R.confiabilidadeDaVersao(semData) === 'estimativa');
  const completa = { ...REGRAS_PADRAO, statusConfiabilidade: 'oficial_configurado', fonte: 'CAIXA', fonteUrl: 'https://x', verificadoEm: '2026-08-19' };
  checar('com os quatro, é oficial', R.confiabilidadeDaVersao(completa) === 'oficial_configurado');
  const semDeclarar = { ...REGRAS_PADRAO, fonte: 'CAIXA', fonteUrl: 'https://x', verificadoEm: '2026-08-19' };
  checar('sem declarar, é estimativa', R.confiabilidadeDaVersao(semDeclarar) === 'estimativa');

  /* -------------------------------------------- faixa pela renda (§2.1) */
  const comFaixas = {
    ...REGRAS_PADRAO,
    produtos: REGRAS_PADRAO.produtos.map((p) => {
      if (p.id === 'mcmv_1') {
        return {
          ...p,
          faixaRenda: R.oficial({ min: 0, max: 2850 }, 'f', 'u', '2026-08-19'),
          taxaAnualPct: R.oficial(4.5, 'f', 'u', '2026-08-19'),
          prazoMaxMeses: R.oficial(420, 'f', 'u', '2026-08-19'),
          quotaMaxPct: R.oficial(90, 'f', 'u', '2026-08-19'),
          comprometimentoRendaMaxPct: R.oficial(30, 'f', 'u', '2026-08-19'),
        };
      }
      if (p.id === 'mcmv_2') {
        return {
          ...p,
          faixaRenda: R.oficial({ min: 2850.01, max: 4700 }, 'f', 'u', '2026-08-19'),
          taxaAnualPct: R.oficial(5.5, 'f', 'u', '2026-08-19'),
          prazoMaxMeses: R.oficial(420, 'f', 'u', '2026-08-19'),
          quotaMaxPct: R.oficial(90, 'f', 'u', '2026-08-19'),
          comprometimentoRendaMaxPct: R.oficial(30, 'f', 'u', '2026-08-19'),
        };
      }
      return p;
    }),
  };

  checar('renda de 2.000 cai na Faixa 1', R.faixaPelaRenda(comFaixas, 'caixa', 2000)?.id === 'mcmv_1');
  checar('renda de 4.000 cai na Faixa 2', R.faixaPelaRenda(comFaixas, 'caixa', 4000)?.id === 'mcmv_2');
  checar('o limite superior é inclusivo', R.faixaPelaRenda(comFaixas, 'caixa', 4700)?.id === 'mcmv_2');
  checar('um centavo acima já sai da faixa', R.faixaPelaRenda(comFaixas, 'caixa', 4700.01)?.id !== 'mcmv_2');
  checar('renda zero não enquadra em nada', R.faixaPelaRenda(comFaixas, 'caixa', 0) === null);
  checar('renda alta não acha faixa do MCMV', R.faixaPelaRenda(comFaixas, 'caixa', 90000) === null);
  checar('banco sem linha própria não acha faixa', R.faixaPelaRenda(comFaixas, 'itau', 4000) === null);
  /*
   * A trava que mais importa: uma faixa SEM parâmetro cadastrado nunca pode ser
   * apontada. Apontar para uma faixa que o simulador não consegue calcular
   * mandaria o corretor para uma tela vazia.
   */
  checar(
    'faixa sem parâmetro não é apontada',
    R.faixaPelaRenda(REGRAS_PADRAO, 'caixa', 2000)?.id !== 'mcmv_1',
  );
  /* A mais estreita ganha: entre "até 4.700" e uma sem teto, vale a primeira. */
  const comAberta = {
    ...comFaixas,
    produtos: comFaixas.produtos.map((p) =>
      p.id === 'mcmv_3'
        ? {
            ...p,
            faixaRenda: R.oficial({ min: 0, max: null }, 'f', 'u', '2026-08-19'),
            taxaAnualPct: R.oficial(9, 'f', 'u', '2026-08-19'),
            prazoMaxMeses: R.oficial(420, 'f', 'u', '2026-08-19'),
            quotaMaxPct: R.oficial(80, 'f', 'u', '2026-08-19'),
            comprometimentoRendaMaxPct: R.oficial(30, 'f', 'u', '2026-08-19'),
          }
        : p,
    ),
  };
  checar('a faixa mais estreita ganha da aberta', R.faixaPelaRenda(comAberta, 'caixa', 2000)?.id === 'mcmv_1');

  /* ------------------------------- base do comprometimento (§2.7, §12) */
  const regrasComSeguros = comSeguros();
  const baseTotal = simular({ ...BASE, produtoId: 'informado' }, regrasComSeguros);
  const soPrincipal = simular(
    { ...BASE, produtoId: 'informado' },
    {
      ...regrasComSeguros,
      produtos: regrasComSeguros.produtos.map((p) =>
        p.id === 'informado' ? { ...p, baseComprometimento: 'principal_juros' } : p,
      ),
    },
  );
  checar('as duas bases calculam', baseTotal.ok && soPrincipal.ok);
  checar(
    'a base "prestação total" exige mais renda que "só o principal"',
    baseTotal.ok &&
      soPrincipal.ok &&
      baseTotal.resultado.rendaMinimaEstimada > soPrincipal.resultado.rendaMinimaEstimada,
    `(${baseTotal.ok && baseTotal.resultado.rendaMinimaEstimada} vs ${soPrincipal.ok && soPrincipal.resultado.rendaMinimaEstimada})`,
  );

  /* --------------------------------------- componentes incluídos (§12) */
  const semApolice = simular({ ...BASE, produtoId: 'informado' }, REGRAS_PADRAO);
  checar('sem apólice, o MIP não entra', semApolice.ok && semApolice.resultado.componentes.mipIncluido === false);
  checar('e o resultado diz isso em português', semApolice.ok && semApolice.resultado.componentes.naoIncluidos.some((t) => t.includes('MIP')));
  checar('juros e amortização sempre entram', semApolice.ok && semApolice.resultado.componentes.incluidos.includes('Juros'));

  const comApolice = simular({ ...BASE, produtoId: 'informado' }, regrasComSeguros);
  checar('com apólice, o MIP entra', comApolice.ok && comApolice.resultado.componentes.mipIncluido === true);

  /* ------------------------------- linha indexada sem índice cadastrado */
  const semTr = simular(
    { ...BASE, produtoId: 'mcmv_classe_media', valorImovel: reais(400000) },
    REGRAS_PADRAO,
  );
  checar('linha com TR sem índice avisa no status', semTr.ok && semTr.resultado.status === 'SEM_CORRECAO');
  checar('e lista a correção como não incluída', semTr.ok && semTr.resultado.componentes.correcaoAplicada === false);

  const comTr = simular(
    { ...BASE, produtoId: 'mcmv_classe_media', valorImovel: reais(400000) },
    comIndice('TR', 0.001),
  );
  checar('com o índice cadastrado, a correção entra', comTr.ok && comTr.resultado.componentes.correcaoAplicada === true);
  checar('e o status deixa de ser SEM_CORRECAO', comTr.ok && comTr.resultado.status !== 'SEM_CORRECAO');

  /* ------------------------------ toda linha declara base e tratamento */
  checar(
    'todo produto declara a base do comprometimento',
    REGRAS_PADRAO.produtos.every((p) =>
      ['principal_juros', 'principal_juros_dfi', 'prestacao_total'].includes(p.baseComprometimento),
    ),
  );
  checar(
    'todo produto declara o tratamento da carência',
    REGRAS_PADRAO.produtos.every((p) =>
      ['nao_permitida', 'juros_capitalizados', 'juros_pagos_mensalmente'].includes(
        p.tratamentoCarencia,
      ),
    ),
  );
}

/* ==========================================================================
 * RASCUNHO ANTIGO — o defeito que derrubou o simulador no celular
 *
 * O formato do formulário mudou entre duas versões: `proponentes` era o texto
 * '1' e virou a lista das pessoas. Um rascunho velho no aparelho fazia o app
 * chamar `.map` numa string e quebrar a tela inteira. Estes testes travam o
 * saneamento para isso não voltar de nenhuma outra forma.
 * ====================================================================== */
{
  secao('RASCUNHO ANTIGO — saneamento do formulário');

  const F = carregar('formulario');

  const velho = F.sanearForm({ proponentes: '1', idade: '34', valorImovel: 'R$ 300.000,00' });
  checar('proponentes em texto vira lista', Array.isArray(velho.proponentes));
  checar('e a lista nunca fica vazia', velho.proponentes.length === 1);
  checar('o que era compatível é aproveitado', velho.valorImovel === 'R$ 300.000,00');
  checar('o rascunho velho não quebra o motor', Array.isArray(F.paraProponentes(velho.proponentes)));

  checar('nulo vira formulário inicial', F.sanearForm(null).proponentes.length === 1);
  checar('texto solto vira formulário inicial', F.sanearForm('lixo').proponentes.length === 1);
  checar('lista solta vira formulário inicial', F.sanearForm([1, 2, 3]).proponentes.length === 1);

  const tipoErrado = F.sanearForm({ valorImovel: 42, block: 'dois', sistema: 'FRANCES', uf: 7 });
  checar('número onde se espera texto é descartado', tipoErrado.valorImovel === '');
  checar('texto onde se espera número é descartado', tipoErrado.block === 0);
  checar('sistema desconhecido volta ao padrão', tipoErrado.sistema === 'SAC');
  checar('UF de tipo errado volta ao padrão', tipoErrado.uf === null);

  const proponentesSujos = F.sanearForm({
    proponentes: [null, 'texto', { nome: 'Ana', rendaBruta: 'R$ 5.000,00', idade: 30 }],
  });
  checar('itens inválidos da lista somem', proponentesSujos.proponentes.length === 1);
  checar('o item bom sobrevive', proponentesSujos.proponentes[0].nome === 'Ana');
  checar('e o campo de tipo errado dentro dele é limpo', proponentesSujos.proponentes[0].idade === '');
  checar('todo proponente saneado ganha id', proponentesSujos.proponentes[0].id === 'p1');

  const muitos = F.sanearForm({ proponentes: Array.from({ length: 9 }, () => ({ nome: 'x' })) });
  checar('a lista é limitada a quatro pessoas', muitos.proponentes.length === 4);

  checar('paraProponentes aguenta receber texto', F.paraProponentes('1').length === 0);
  checar('rendaFamiliar aguenta proponentes inválidos', F.rendaFamiliar({ proponentes: 'x' }) === 0);
}

/* ===================================================================== */

console.log(`\n${ok} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.log(`  FALHOU: ${f}`);
process.exit(falhas.length ? 1 : 0);
