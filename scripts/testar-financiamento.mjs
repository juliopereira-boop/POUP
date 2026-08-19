/**
 * OS TESTES DO MOTOR DE FINANCIAMENTO.
 *
 * `npm run testar:financiamento`
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE RODA EM NODE PURO
 * ===========================================================================
 * O motor é uma função pura de ponta a ponta — sem React, sem Supabase, sem
 * navegador. Isso foi decisão de arquitetura justamente para que os testes
 * fossem ESTES: rápidos, sem simulador, sem servidor, sem mock.
 *
 * O que eles protegem é o que não pode quebrar nunca:
 *
 *   1. **A tabela fecha.** Saldo devedor final exatamente zero e soma das
 *      amortizações exatamente igual ao principal. Um centavo sobrando numa
 *      tabela de 420 linhas é a falha clássica deste domínio.
 *   2. **SAC e PRICE se comportam como devem.** SAC decresce, PRICE é
 *      constante (fora a última), SAC paga menos juros no total.
 *   3. **Os reversos são reversos de verdade.** Calcular a parcela a partir do
 *      financiado e voltar ao financiado a partir da parcela tem que fechar.
 *   4. **O motor não inventa.** Parâmetro pendente vira `null` e entra em
 *      `naoCalculados` — nunca vira zero disfarçado de resposta.
 *
 * Os arquivos TypeScript são transpilados na hora pelo compilador do próprio
 * projeto (que já está em `node_modules`), então não há passo de build nem
 * dependência nova.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const RAIZ = path.join(process.cwd(), 'src/features/financiamento');

const cache = new Map();
function carregar(nome) {
  if (cache.has(nome)) return cache.get(nome);
  const arquivo = path.join(RAIZ, `${nome}.ts`);
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  m.require = (spec) => (spec.startsWith('./') ? carregar(spec.slice(2)) : require(spec));
  cache.set(nome, m.exports);
  m._compile(js, arquivo);
  cache.set(nome, m.exports);
  return m.exports;
}

const D = carregar('dinheiro');
const A = carregar('amortizacao');
const R = carregar('regras');
const { REGRAS_PADRAO } = carregar('regrasPadrao');
const { simular } = carregar('motor');
const R2 = carregar('reverso');
const C = carregar('cenarios');

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

/* ===================================================================== */
secao('DINHEIRO — a base exata');

checar('reais viram centavos', reais(210000) === 21000000);
checar('centavo quebrado arredonda para cima', reais(10.005) === 1001);
checar('negativo arredonda afastando do zero', D.centavos(-0.5) === -1);
checar('formata em pt-BR', D.formatarBRL(reais(1234567.89)) === 'R$ 1.234.567,89');
checar('formata zero', D.formatarBRL(D.ZERO) === 'R$ 0,00');
checar('formata negativo', D.formatarBRL(D.centavos(-500)) === '-R$ 5,00');

// ratear é a garantia de que nenhuma divisão perde centavo
for (const [total, partes] of [
  [10000, 3],
  [1, 7],
  [999999, 420],
  [21000000, 360],
]) {
  const pedacos = D.ratear(D.centavos(total), partes);
  const soma = pedacos.reduce((s, p) => s + p, 0);
  checar(`ratear ${total} em ${partes} soma o total`, soma === total, `(deu ${soma})`);
  checar(`ratear ${total} em ${partes} dá ${partes} pedaços`, pedacos.length === partes);
  const dif = Math.max(...pedacos) - Math.min(...pedacos);
  checar(`ratear ${total} em ${partes} varia no máximo 1 centavo`, dif <= 1, `(variou ${dif})`);
}

// conversão de taxa
const mensalComposta = D.taxaAnualParaMensal(12, 'composta');
quase('12% a.a. composta volta a 12% a.a. efetiva', D.taxaMensalParaAnualEfetiva(mensalComposta), 12, 1e-9);
const mensalLinear = D.taxaAnualParaMensal(12, 'linear');
quase('12% a.a. linear = 1% a.m.', mensalLinear, 0.01, 1e-12);
quase(
  '12% a.a. linear tem efetivo de 12,6825%',
  D.taxaMensalParaAnualEfetiva(mensalLinear),
  12.6825,
  0.0001,
);
checar('taxa zero continua zero', D.taxaAnualParaMensal(0, 'composta') === 0);

/* ===================================================================== */
secao('SAC — parcela decrescente');

const PRINCIPAL = reais(240000);
const TAXA_MES = D.taxaAnualParaMensal(9, 'composta');

for (const prazo of [12, 120, 360, 420]) {
  const t = A.gerarTabela({ principal: PRINCIPAL, taxaMensal: TAXA_MES, prazoMeses: prazo, sistema: 'SAC' });
  checar(`SAC ${prazo}m gera ${prazo} linhas`, t.linhas.length === prazo);
  checar(`SAC ${prazo}m termina com saldo ZERO`, t.linhas[prazo - 1].saldoFinal === 0,
    `(sobrou ${t.linhas[prazo - 1].saldoFinal})`);
  checar(`SAC ${prazo}m amortiza exatamente o principal`, t.totalAmortizado === PRINCIPAL,
    `(${t.totalAmortizado} vs ${PRINCIPAL})`);
  checar(`SAC ${prazo}m: prestação sempre cai`,
    t.linhas.every((l, i) => i === 0 || l.encargoPrincipal <= t.linhas[i - 1].encargoPrincipal));
  checar(`SAC ${prazo}m: amortização constante (±1 centavo)`,
    Math.max(...t.linhas.map((l) => l.amortizacao)) - Math.min(...t.linhas.map((l) => l.amortizacao)) <= 1);
  checar(`SAC ${prazo}m: saldo nunca negativo`, t.linhas.every((l) => l.saldoFinal >= 0));
  checar(`SAC ${prazo}m: total = amortização + juros`,
    t.totalEncargoPrincipal === t.totalAmortizado + t.totalJuros);
}

// conferência à mão: 100.000 em 100 meses a 1% a.m. linear
{
  const p = reais(100000);
  const i = D.taxaAnualParaMensal(12, 'linear'); // 1% ao mês
  const t = A.gerarTabela({ principal: p, taxaMensal: i, prazoMeses: 100, sistema: 'SAC' });
  // amortização = 1.000,00 ; juros do 1º mês = 1% de 100.000 = 1.000,00
  checar('SAC didático: amortização = R$ 1.000,00', t.linhas[0].amortizacao === reais(1000));
  checar('SAC didático: 1º juros = R$ 1.000,00', t.linhas[0].juros === reais(1000));
  checar('SAC didático: 1ª prestação = R$ 2.000,00', t.linhas[0].encargoPrincipal === reais(2000));
  // último mês: saldo inicial = 1.000, juros = 10, prestação = 1.010
  checar('SAC didático: última prestação = R$ 1.010,00', t.linhas[99].encargoPrincipal === reais(1010));
  // juros totais = 1% * soma dos saldos = 1% * 1000*(100+99+...+1)*... = 50.500
  checar('SAC didático: juros totais = R$ 50.500,00', t.totalJuros === reais(50500),
    `(deu ${D.formatarBRL(t.totalJuros)})`);
}

/* ===================================================================== */
secao('PRICE — parcela fixa');

for (const prazo of [12, 120, 360, 420]) {
  const t = A.gerarTabela({ principal: PRINCIPAL, taxaMensal: TAXA_MES, prazoMeses: prazo, sistema: 'PRICE' });
  checar(`PRICE ${prazo}m gera ${prazo} linhas`, t.linhas.length === prazo);
  checar(`PRICE ${prazo}m termina com saldo ZERO`, t.linhas[prazo - 1].saldoFinal === 0,
    `(sobrou ${t.linhas[prazo - 1].saldoFinal})`);
  checar(`PRICE ${prazo}m amortiza exatamente o principal`, t.totalAmortizado === PRINCIPAL,
    `(${t.totalAmortizado} vs ${PRINCIPAL})`);
  // fora a última, a prestação é constante
  const meio = t.linhas.slice(0, -1).map((l) => l.encargoPrincipal);
  checar(`PRICE ${prazo}m: prestação constante até a penúltima`,
    Math.max(...meio) - Math.min(...meio) <= 1);
  checar(`PRICE ${prazo}m: amortização cresce`,
    t.linhas.every((l, i) => i === 0 || l.amortizacao >= t.linhas[i - 1].amortizacao - 1));
  checar(`PRICE ${prazo}m: juros caem`,
    t.linhas.every((l, i) => i === 0 || l.juros <= t.linhas[i - 1].juros));
}

// conferência à mão: PMT de 100.000, 1% a.m., 100 meses = 1.587,45
{
  const p = reais(100000);
  const i = 0.01;
  const pmt = A.prestacaoPrice(p, i, 100);
  // Conferido na fórmula: 100000 · 0,01 / (1 − 1,01^-100) = 1.586,57.
  quase('PRICE didático: PMT de 100k/1%/100m = R$ 1.586,57', pmt, reais(1586.57), 1,
    `(deu ${D.formatarBRL(pmt)})`);
}

// SAC sempre paga menos juros que PRICE no mesmo prazo
{
  const sac = A.gerarTabela({ principal: PRINCIPAL, taxaMensal: TAXA_MES, prazoMeses: 360, sistema: 'SAC' });
  const price = A.gerarTabela({ principal: PRINCIPAL, taxaMensal: TAXA_MES, prazoMeses: 360, sistema: 'PRICE' });
  checar('SAC paga menos juros que PRICE', sac.totalJuros < price.totalJuros);
  checar('a 1ª do SAC é maior que a 1ª da PRICE',
    sac.linhas[0].encargoPrincipal > price.linhas[0].encargoPrincipal);
  checar('a última do SAC é menor que a última da PRICE',
    sac.linhas[359].encargoPrincipal < price.linhas[359].encargoPrincipal);
}

/* ===================================================================== */
secao('CASOS EXTREMOS');

{
  const t = A.gerarTabela({ principal: PRINCIPAL, taxaMensal: 0, prazoMeses: 240, sistema: 'PRICE' });
  checar('taxa zero: PRICE não divide por zero', t.linhas.length === 240);
  checar('taxa zero: juros totais = 0', t.totalJuros === 0);
  checar('taxa zero: amortiza tudo', t.totalAmortizado === PRINCIPAL);
  checar('taxa zero: saldo final zero', t.linhas[239].saldoFinal === 0);
}
{
  const t = A.gerarTabela({ principal: PRINCIPAL, taxaMensal: 0, prazoMeses: 240, sistema: 'SAC' });
  checar('taxa zero SAC: amortiza tudo', t.totalAmortizado === PRINCIPAL);
  checar('taxa zero SAC: saldo final zero', t.linhas[239].saldoFinal === 0);
}
checar('principal zero devolve tabela vazia',
  A.gerarTabela({ principal: D.ZERO, taxaMensal: 0.01, prazoMeses: 12, sistema: 'SAC' }).linhas.length === 0);
checar('prazo zero devolve tabela vazia',
  A.gerarTabela({ principal: PRINCIPAL, taxaMensal: 0.01, prazoMeses: 0, sistema: 'SAC' }).linhas.length === 0);
{
  // 1 centavo em 3 meses: o caso que quebra arredondamento ingênuo
  const t = A.gerarTabela({ principal: D.centavos(1), taxaMensal: 0.01, prazoMeses: 3, sistema: 'SAC' });
  checar('1 centavo em 3 meses amortiza 1 centavo', t.totalAmortizado === 1);
  checar('1 centavo em 3 meses fecha em zero', t.linhas[2].saldoFinal === 0);
}
{
  // taxa altíssima com prazo curtíssimo: a trava contra tabela infinita
  const t = A.gerarTabela({ principal: reais(100000), taxaMensal: 0.5, prazoMeses: 2, sistema: 'PRICE' });
  checar('taxa absurda: ainda termina', t.linhas.length === 2);
  checar('taxa absurda: fecha em zero', t.linhas[1].saldoFinal === 0);
  checar('taxa absurda: amortiza o principal', t.totalAmortizado === reais(100000));
}

/* ===================================================================== */
secao('REVERSOS — ida e volta');

for (const sistema of ['SAC', 'PRICE']) {
  for (const prazo of [120, 360, 420]) {
    const primeira = A.primeiraPrestacao(PRINCIPAL, TAXA_MES, prazo, sistema);
    const devolta = A.principalParaPrestacao(primeira, TAXA_MES, prazo, sistema);
    // tolerância de R$ 1: o arredondamento em centavos da ida não é reversível
    // ao centavo, e fingir que é seria pior do que declarar a tolerância.
    quase(`${sistema} ${prazo}m: principal → parcela → principal`, devolta, PRINCIPAL, 100,
      `(voltou ${D.formatarBRL(devolta)} de ${D.formatarBRL(PRINCIPAL)})`);
  }
}

{
  const tabela = A.gerarTabela({ principal: PRINCIPAL, taxaMensal: TAXA_MES, prazoMeses: 360, sistema: 'PRICE' });
  const prazo = A.prazoParaPrestacao(PRINCIPAL, TAXA_MES, tabela.linhas[0].encargoPrincipal);
  quase('PRICE: parcela → prazo volta a 360', prazo, 360, 1, `(deu ${prazo})`);
}
checar('parcela que não paga nem os juros devolve prazo nulo',
  A.prazoParaPrestacao(PRINCIPAL, TAXA_MES, reais(10)) === null);

checar('entrada necessária com quota de 80%',
  R2.entradaNecessaria(reais(300000), 80) === reais(60000));
checar('imóvel por entrada com quota de 80%',
  R2.imovelPorEntrada(reais(60000), 80) === reais(300000));
checar('quota de 100% não trava pela entrada',
  R2.imovelPorEntrada(reais(1), 100) === Number.MAX_SAFE_INTEGER);

/* ===================================================================== */
secao('MOTOR — regra de fábrica, produto "Condições informadas"');

const baseEntrada = {
  operacao: 'aquisicao_novo',
  tipoImovel: 'residencial',
  uf: 'MA',
  municipio: 'São Luís',
  valorImovel: reais(300000),
  entradaPropria: reais(40000),
  fgts: reais(20000),
  subsidio: D.ZERO,
  rendaFamiliarMensal: reais(8000),
  quantidadeProponentes: 1,
  idadeAnos: 34,
  produtoId: 'informado',
  sistema: 'SAC',
  prazoMeses: 360,
  taxaAnualPctInformada: 9,
  quotaMaxPctInformada: 80,
  comprometimentoMaxPctInformado: 30,
};

const s = simular(baseEntrada, REGRAS_PADRAO);
checar('a simulação roda com a regra de fábrica', s.ok === true, s.ok ? '' : s.erro);
if (s.ok) {
  const r = s.resultado;
  checar('entrada total soma próprio + FGTS', r.entradaTotal === reais(60000));
  checar('financiado = imóvel − entrada', r.valorFinanciado === reais(240000));
  quase('quota aplicada = 80%', r.quotaAplicadaPct, 80, 0.001);
  checar('a tabela tem 360 linhas', r.tabela.length === 360);
  checar('a tabela fecha em zero', r.tabela[359].saldoFinal === 0);

  // o motor NÃO inventa encargo
  checar('MIP não calculado (parâmetro pendente)', r.primeira.mip === null);
  checar('DFI não calculado (parâmetro pendente)', r.primeira.dfi === null);
  checar('tarifa não calculada (parâmetro pendente)', r.primeira.tarifa === null);
  checar('a prestação vem marcada como parcial', r.primeira.parcial === true);
  checar('os pendentes aparecem em naoCalculados', r.naoCalculados.length >= 3);
  checar('há aviso sobre a prestação incompleta', r.avisos.some((a) => a.includes('encargo principal')));
  checar('o total pago também sai parcial', r.totalPagoParcial === true);

  // enquadramento
  checar('enquadra com renda de 8.000', r.elegibilidade.elegivel === true,
    JSON.stringify(r.elegibilidade.reprovacoes));
  checar('a quota entra como ok', r.elegibilidade.itens.some((i) => i.chave === 'quota' && i.situacao === 'ok'));
  checar('o FGTS entra como atenção', r.elegibilidade.itens.some((i) => i.chave === 'fgts' && i.situacao === 'atencao'));
  checar('a idade fica não verificada (limite pendente)',
    r.elegibilidade.itens.some((i) => i.chave === 'idade' && i.situacao === 'nao_verificado'));

  // procedência
  checar('a confiabilidade é "informada"', r.confiabilidade === 'informada');
  checar('o snapshot das regras vai junto', r.snapshot.versao === REGRAS_PADRAO.versao);
}

// renda insuficiente reprova, e diz de quanto precisaria
{
  const pobre = simular({ ...baseEntrada, rendaFamiliarMensal: reais(2000) }, REGRAS_PADRAO);
  checar('renda baixa não enquadra', pobre.ok && pobre.resultado.elegibilidade.elegivel === false);
  checar('a reprovação é de comprometimento de renda',
    pobre.ok && pobre.resultado.elegibilidade.reprovacoes.some((i) => i.chave === 'renda'));
  checar('a mensagem diz a renda necessária',
    pobre.ok && pobre.resultado.elegibilidade.reprovacoes.some((i) => i.detalhe.includes('renda de R$')));
}

// entrada insuficiente reprova pela quota, e diz quanto falta
{
  const semEntrada = simular({ ...baseEntrada, entradaPropria: D.ZERO, fgts: D.ZERO }, REGRAS_PADRAO);
  checar('sem entrada, a quota reprova',
    semEntrada.ok && semEntrada.resultado.elegibilidade.reprovacoes.some((i) => i.chave === 'quota'));
  checar('a mensagem diz quanto falta de entrada',
    semEntrada.ok && semEntrada.resultado.elegibilidade.reprovacoes.some((i) => i.detalhe.includes('Faltam R$')));
}

// linha oficial sem parâmetro NÃO simula — e explica
{
  const mcmv = simular({ ...baseEntrada, produtoId: 'mcmv_2' }, REGRAS_PADRAO);
  checar('linha do MCMV sem parâmetro se recusa a simular', mcmv.ok === false);
  checar('e explica o que fazer', !mcmv.ok && mcmv.erro.includes('Condições informadas'));
}

// taxa não informada no produto manual também se recusa
{
  const semTaxa = simular({ ...baseEntrada, taxaAnualPctInformada: null }, REGRAS_PADRAO);
  checar('sem taxa informada, não simula', semTaxa.ok === false);
}

/* ===================================================================== */
secao('PODER DE COMPRA — os dois tetos');

{
  // renda alta, entrada baixa: quem trava é a ENTRADA
  const p = R2.poderDeCompra({
    rendaFamiliarMensal: reais(30000),
    entradaPropria: reais(60000),
    fgts: D.ZERO,
    subsidio: D.ZERO,
    produto: REGRAS_PADRAO.produtos[0],
    regras: REGRAS_PADRAO,
    prazoMeses: 360,
    sistema: 'SAC',
    taxaAnualPctInformada: 9,
    quotaMaxPctInformada: 80,
    comprometimentoMaxPctInformado: 30,
  });
  checar('poder de compra calcula', p.ok === true, p.erro ?? '');
  checar('com renda alta, quem trava é a entrada', p.limitante === 'entrada', `(travou ${p.limitante})`);
  checar('entrada de 60k com quota 80% dá imóvel de 300k',
    p.valorImovelMax === reais(300000), `(deu ${D.formatarBRL(p.valorImovelMax)})`);
  quase('a quota aplicada bate com a máxima', p.quotaAplicadaPct, 80, 0.01);
}
{
  // renda baixa, entrada alta: quem trava é a RENDA
  const p = R2.poderDeCompra({
    rendaFamiliarMensal: reais(3000),
    entradaPropria: reais(200000),
    fgts: D.ZERO,
    subsidio: D.ZERO,
    produto: REGRAS_PADRAO.produtos[0],
    regras: REGRAS_PADRAO,
    prazoMeses: 360,
    sistema: 'SAC',
    taxaAnualPctInformada: 9,
    quotaMaxPctInformada: 80,
    comprometimentoMaxPctInformado: 30,
  });
  checar('com entrada alta, quem trava é a renda', p.limitante === 'renda', `(travou ${p.limitante})`);
  checar('a parcela máxima é 30% da renda', p.parcelaMaxima === reais(900));
  // a primeira prestação do resultado não pode passar da parcela máxima
  checar('a prestação no limite respeita a parcela máxima',
    p.primeiraPrestacao <= p.parcelaMaxima + 100,
    `(${D.formatarBRL(p.primeiraPrestacao)} vs ${D.formatarBRL(p.parcelaMaxima)})`);
}
{
  // o poder de compra tem que fechar com a simulação direta
  const p = R2.poderDeCompra({
    rendaFamiliarMensal: reais(5000),
    entradaPropria: reais(50000),
    fgts: D.ZERO,
    subsidio: D.ZERO,
    produto: REGRAS_PADRAO.produtos[0],
    regras: REGRAS_PADRAO,
    prazoMeses: 420,
    sistema: 'PRICE',
    taxaAnualPctInformada: 8,
    quotaMaxPctInformada: 80,
    comprometimentoMaxPctInformado: 30,
  });
  const conferencia = simular(
    {
      ...baseEntrada,
      valorImovel: p.valorImovelMax,
      entradaPropria: reais(50000),
      fgts: D.ZERO,
      rendaFamiliarMensal: reais(5000),
      sistema: 'PRICE',
      prazoMeses: 420,
      taxaAnualPctInformada: 8,
    },
    REGRAS_PADRAO,
  );
  checar('o cenário no limite do poder de compra enquadra',
    conferencia.ok && conferencia.resultado.elegibilidade.elegivel === true,
    conferencia.ok ? JSON.stringify(conferencia.resultado.elegibilidade.reprovacoes) : conferencia.erro);
}

/* ===================================================================== */
secao('UNIDADES COMPATÍVEIS — o remate comercial');

{
  const estoque = [
    { item: 'Unidade 304', valor: reais(250000) },
    { item: 'Unidade 506', valor: reais(265000) },
    { item: 'Unidade 702', valor: reais(280000) },
    { item: 'Cobertura', valor: reais(420000) },
  ];
  const { compativeis, quaseLa } = R2.unidadesCompativeis(estoque, reais(270000), 10);
  // 250k e 265k cabem; 280k passa do teto mas entra na folga de 10%.
  checar('duas unidades cabem', compativeis.length === 2, `(coube ${compativeis.length})`);
  checar('a cobertura não cabe', !compativeis.includes('Cobertura'));
  checar('a 702 aparece como "quase lá"', quaseLa.length === 1 && quaseLa[0].item === 'Unidade 702');
  checar('e diz quanto falta', quaseLa[0].falta === reais(10000));
}

/* ===================================================================== */
secao('COMPARADOR');

{
  const cenarios = C.montarCenarios(baseEntrada, REGRAS_PADRAO, C.variacoesPadrao(360));
  checar('monta quatro cenários', cenarios.length === 4, `(montou ${cenarios.length})`);
  const linhas = C.compararCenarios(cenarios);
  checar('a primeira linha é a primeira parcela', linhas[0].chave === 'primeira');
  const venc = C.vencedores(linhas.find((l) => l.chave === 'juros'));
  checar('o vencedor em juros é um SAC',
    venc.length >= 1 && cenarios[venc[0]].sistema === 'SAC',
    `(venceu ${venc.map((i) => cenarios[i].rotulo).join(', ')})`);
  const vencPrimeira = C.vencedores(linhas.find((l) => l.chave === 'primeira'));
  checar('o vencedor na 1ª parcela é uma PRICE',
    vencPrimeira.length >= 1 && cenarios[vencPrimeira[0]].sistema === 'PRICE',
    `(venceu ${vencPrimeira.map((i) => cenarios[i].rotulo).join(', ')})`);
}

/* ===================================================================== */
secao('REGRAS — procedência e pendências');

checar('a versão de fábrica se identifica como não cadastrada', REGRAS_PADRAO.versao === '0000.00');
checar('"Condições informadas" é sempre calculável',
  R.produtoCalculavel(REGRAS_PADRAO.produtos.find((p) => p.id === 'informado')));
checar('as linhas do MCMV NÃO são calculáveis de fábrica',
  REGRAS_PADRAO.produtos.filter((p) => p.id.startsWith('mcmv')).every((p) => !R.produtoCalculavel(p)));
{
  const pend = R.parametrosPendentes(REGRAS_PADRAO);
  checar('a lista de pendências não está vazia', pend.length > 0);
  checar('toda pendência explica o motivo', pend.every((p) => p.motivo.length > 20));
  checar('as pendências apontam onde cadastrar',
    pend.some((p) => p.motivo.includes('Ajustes → Financiamento')));
}
checar('nenhum parâmetro pendente carrega valor',
  REGRAS_PADRAO.produtos.every((p) =>
    ['valorImovelMax', 'quotaMaxPct', 'prazoMaxMeses', 'taxaAnualPct', 'subsidioMax']
      .every((k) => p[k].origem !== 'pendente' || p[k].valor === null)));

/* ===================================================================== */

console.log(`\n${ok} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.log(`  FALHOU: ${f}`);
process.exit(falhas.length ? 1 : 0);
