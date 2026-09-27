/**
 * COMISSÃO POR TIPO DE CORRETOR (House/Imob) E A VENDA PRÉ-PREENCHIDA.
 *
 * `npm run testar:comissao`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const cache = new Map();
function carregar(rel) {
  const arquivo = path.join(process.cwd(), rel);
  if (cache.has(arquivo)) return cache.get(arquivo);
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  cache.set(arquivo, m.exports);
  m.require = (spec) => {
    if (spec === '@/data/types') return carregar('src/data/types.ts');
    if (spec.startsWith('./')) return carregar(path.join(path.dirname(rel), `${spec.slice(2)}.ts`));
    if (spec.startsWith('@/')) return carregar(`src/${spec.slice(2)}.ts`);
    return require(spec);
  };
  m._compile(js, arquivo);
  cache.set(arquivo, m.exports);
  return m.exports;
}
const E = carregar('src/features/comissao/engine.ts');
let passou = 0;
function teste(nome, fn) {
  fn();
  passou++;
  console.log(`ok ${nome}`);
}

const regra = { companyId: 'c1', defaultPct: 5, pctImob: 4, installmentsCount: 1, installmentsSplit: null, firstPaymentDays: 30, intervalDays: 30, notes: null, updatedAt: '' };
const venda = (extra = {}) => ({ id: 's1', companyId: 'c1', companyName: 'Canopus', developmentName: 'Estrelas', clientName: 'Maria', saleValue: 241400, saleDate: '2026-09-20', commissionPct: null, commissionValue: null, ...extra });

teste('House usa o percentual padrão', () => assert.equal(E.pctDoCorretor(regra, 'house'), 5));
teste('Imob usa o percentual Imob', () => assert.equal(E.pctDoCorretor(regra, 'imob'), 4));
teste('Imob sem percentual próprio cai no House', () => assert.equal(E.pctDoCorretor({ ...regra, pctImob: null }, 'imob'), 5));
teste('sem tipo escolhido vale o House', () => assert.equal(E.pctDoCorretor(regra, null), 5));
teste('campanha vigente vale para os dois tipos', () => {
  const camp = [{ id: 'k', companyId: 'c1', name: 'Setembro', pct: 6, startsOn: '2026-09-01', endsOn: '2026-09-30', createdAt: '' }];
  assert.equal(E.resolveRate(regra, camp, '2026-09-20', 'imob').pct, 6);
  assert.equal(E.resolveRate(regra, camp, '2026-10-05', 'imob').pct, 4);
});
teste('venda de corretor Imob lança a comissão com 4%', () => {
  const { commission } = E.buildCommissionForSale(venda(), regra, [], 'imob');
  assert.equal(commission.totalValue, 9656);
  assert.equal(commission.source, 'padrao');
});
teste('venda que veio PRÉ-PREENCHIDA pela regra não vira "manual"', () => {
  const { commission } = E.buildCommissionForSale(venda({ commissionPct: 5, commissionValue: 12070 }), regra, [], 'house');
  assert.equal(commission.source, 'padrao');
  assert.equal(commission.totalValue, 12070);
});
teste('valor mudado pelo corretor vira "manual" e é respeitado', () => {
  const { commission } = E.buildCommissionForSale(venda({ commissionValue: 10000 }), regra, [], 'house');
  assert.equal(commission.source, 'manual');
  assert.equal(commission.totalValue, 10000);
});

console.log(`\n${passou} verificações de comissão passaram.`);
