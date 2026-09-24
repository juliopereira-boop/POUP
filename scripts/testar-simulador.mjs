/**
 * TESTES DO SIMULADOR DE POUPANÇA — as regras, sem tela.
 *
 * `npm run testar:simulador`
 *
 * O simulador virou dois blocos (valores primeiro, unidade e cliente depois), e
 * as regras que antes moravam em cinco botões "Avançar" passaram a ser uma
 * função só (`pendencias.ts`). Estes testes cravam que nenhuma regra antiga se
 * perdeu na mudança, e que cada pendência aponta o bloco certo — é o bloco que
 * decide para onde o botão leva o corretor.
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  cache.set(arquivo, m.exports);
  m.require = (spec) => {
    if (spec === '@/lib/masks') return carregar('src/lib/masks.ts');
    if (spec === './calc') return carregar('src/features/simulador/calc.ts');
    if (spec === './estado') return carregar('src/features/simulador/estado.ts');
    return require(spec);
  };
  m._compile(js, arquivo);
  cache.set(arquivo, m.exports);
  return m.exports;
}

const E = carregar('src/features/simulador/estado.ts');
const P = carregar('src/features/simulador/pendencias.ts');
const C = carregar('src/features/simulador/calc.ts');
const M = carregar('src/lib/masks.ts');

let ok = 0;
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  if (condicao) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}
function secao(t) {
  console.log(`\n${t}`);
}

const brl = (reais) => M.formatCurrencyBRL(String(Math.round(reais * 100)));
const cliente = {
  name: 'Maria da Silva',
  cpf: '123.456.789-09',
  email: 'maria@example.com',
  contact: '(98) 99999-0000',
  rendaBruta: brl(5000),
};

/** Uma simulação pronta para gerar: é a base de cada teste, que tira uma peça. */
function completa(extra = {}) {
  return {
    ...E.INITIAL_SIMULADOR_STATE,
    companyId: 'empresa-1',
    developmentId: 'dev-1',
    unit: '104',
    unitValue: brl(250000),
    financingApproved: brl(180000),
    subsidy: brl(20000),
    fgts: brl(10000),
    ato: brl(4000),
    atoDueDate: '2026-10-10',
    mensaisCount: '36',
    proponent1: { ...cliente },
    ...extra,
  };
}
const SEM_CORRESPONDENTE = { exigeCorrespondente: false };
const mensagens = (lista) => lista.map((p) => p.mensagem).join(' | ');

/* ======================================================================== */
secao('A CONTA — o caso de referência, de ponta a ponta');
{
  const sim = completa();
  checar('poupança = venda − financiamento − subsídio − FGTS', C.computePoupanca(sim) === 40000);
  const fluxo = C.buildFlow(sim);
  checar('(40.000 − 4.000 de ato) ÷ 36 = R$ 1.000 por mês', Math.abs(fluxo.monthlyValue - 1000) < 1e-9);
  checar('e o saldo a distribuir fecha em zero', Math.abs(fluxo.saldo) < 1e-6);
  checar('a primeira mensal vence um mês depois do ato', fluxo.mensalFirstDue === '2026-11-10');
}

/* ======================================================================== */
secao('PRONTA — uma simulação completa não tem pendência');
{
  checar('nada falta', P.pendencias(completa(), SEM_CORRESPONDENTE).length === 0,
    mensagens(P.pendencias(completa(), SEM_CORRESPONDENTE)));
}

/* ======================================================================== */
secao('BLOCO 1 — VALORES');
{
  const p1 = (extra) => P.pendencias(completa(extra), SEM_CORRESPONDENTE);

  const semValor = p1({ unitValue: '' });
  checar('sem valor de venda: pede o valor', /valor de venda/.test(mensagens(semValor)));
  checar('e aponta o bloco 1', semValor.every((p) => p.bloco === 1));

  checar('sem vencimento do ato: pede o vencimento', /vencimento do ato/.test(mensagens(p1({ atoDueDate: null }))));
  checar('sem mensais: pede as mensais', /parcelas mensais/.test(mensagens(p1({ mensaisCount: '' }))));
  checar('zero mensais conta como sem mensais', /parcelas mensais/.test(mensagens(p1({ mensaisCount: '0' }))));

  const acimaDoMax = p1({ companyMaxInstallments: 24 });
  checar('36 mensais numa construtora de 24: recusa e diz o limite', /no máximo 24 parcelas/.test(mensagens(acimaDoMax)));
  checar('no limite exato passa', p1({ companyMaxInstallments: 36 }).length === 0);
  checar('sem limite cadastrado não trava', p1({ companyMaxInstallments: null }).length === 0);

  checar(
    'semestrais acima do limite: recusa',
    /no máximo 2 semestrais/.test(mensagens(p1({
      semestralEnabled: true, semestralCount: '4', semestralValue: brl(1000), companyMaxSemiannual: 2,
    }))),
  );
  checar(
    'semestrais desligadas não contam, mesmo com número antigo no campo',
    p1({ semestralEnabled: false, semestralCount: '9', companyMaxSemiannual: 2 }).length === 0,
  );
  checar(
    'anuais acima do limite: recusa',
    /no máximo 1 anuais/.test(mensagens(p1({
      anualEnabled: true, anualCount: '3', anualValue: brl(1000), companyMaxAnnual: 1,
    }))),
  );

  // A regra nova: ato maior que a poupança deixaria a mensal negativa no PDF.
  const negativa = p1({ ato: brl(50000) });
  checar('ato maior que a poupança: recusa a parcela negativa', /negativa/.test(mensagens(negativa)));
  checar('ato igual à poupança (mensal zero) ainda passa', p1({ ato: brl(40000) }).length === 0);
}

/* ======================================================================== */
secao('BLOCO 2 — UNIDADE E CLIENTE');
{
  const p2 = (extra, ctx = SEM_CORRESPONDENTE) => P.pendencias(completa(extra), ctx);

  checar('sem construtora', /construtora/.test(mensagens(p2({ companyId: null }))));
  checar('sem empreendimento', /empreendimento/.test(mensagens(p2({ developmentId: null }))));
  checar('sem unidade', /unidade/.test(mensagens(p2({ unit: '  ' }))));
  checar('tudo isso aponta o bloco 2', p2({ companyId: null, unit: '' }).every((p) => p.bloco === 2));

  checar(
    'correspondente só é exigido quando a construtora tem algum',
    p2({ correspondentId: null }).length === 0 &&
      /correspondente/.test(mensagens(p2({ correspondentId: null }, { exigeCorrespondente: true }))),
  );

  for (const campo of ['name', 'cpf', 'email', 'contact', 'rendaBruta']) {
    checar(
      `1º proponente sem ${campo}: pede os dados`,
      /1º proponente/.test(mensagens(p2({ proponent1: { ...cliente, [campo]: '' } }))),
    );
  }

  const segundo = p2({ hasSecondProponent: true });
  checar('2º proponente ligado e vazio: pede a associação', /associação/.test(mensagens(segundo)));
  checar('e os dados dele', /2º proponente/.test(mensagens(segundo)));
  checar(
    '2º proponente completo passa',
    p2({ hasSecondProponent: true, association: 'conjuge', proponent2: { ...cliente, name: 'João' } }).length === 0,
  );
  checar('2º proponente desligado não conta', p2({ hasSecondProponent: false, association: null }).length === 0);
}

/* ======================================================================== */
secao('ORDEM — o corretor é levado primeiro ao que vem primeiro');
{
  const tudo = P.pendencias(E.INITIAL_SIMULADOR_STATE, SEM_CORRESPONDENTE);
  const primeiroDo2 = tudo.findIndex((p) => p.bloco === 2);
  checar('o estado vazio tem pendência nos dois blocos', tudo.some((p) => p.bloco === 1) && primeiroDo2 > 0);
  checar('as do bloco 1 vêm antes das do bloco 2', tudo.slice(primeiroDo2).every((p) => p.bloco === 2));
}

/* ======================================================================== */
secao('BLOCO NA PROPOSTA — nome do cadastro, número digitado, simulação antiga');
{
  checar('o nome do cadastro vence', E.nomeDoBloco({ block: 2, blockName: 'Torre A' }) === 'Torre A');
  checar('sem nome, sai o número', E.nomeDoBloco({ block: 3, blockName: '' }) === '3');
  checar('bloco zero sem nome sai vazio', E.nomeDoBloco({ block: 0, blockName: '' }) === '');
  // Simulação salva antes desta versão: o campo nem existe.
  checar('simulação antiga, sem blockName, não quebra', E.nomeDoBloco({ block: 5 }) === '5');
  checar('e sem nada, também não', E.nomeDoBloco({}) === '');
}

/* ======================================================================== */
secao('RASCUNHO ANTIGO — o estado novo continua abrindo o de antes');
{
  const antigo = { unit: '101', block: 2, unitValue: brl(200000) };
  const hidratado = { ...E.INITIAL_SIMULADOR_STATE, ...antigo };
  checar('campos novos nascem vazios', hidratado.blockId === null && hidratado.unitId === null && hidratado.blockName === '');
  checar('e os antigos ficam como estavam', hidratado.unit === '101' && hidratado.block === 2);
}

console.log(`\n${ok} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.log(`  FALHOU: ${f}`);
process.exit(falhas.length ? 1 : 0);
