// Regressões locais: executa os módulos reais com adaptadores externos simulados.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import ts from 'typescript';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`ok ${name}`);
}
const cache = new Map();
const stored = new Map([['poup.lia.consentimento', '{"versao":2}']]);
let profileRow = { id: 'owner', agency: 'Imobiliária existente', cnpj: '12345678000190', full_name: 'Teste' };
let profileError = null;
let lastChanges;
let calls = 0;
let createdAppointments = 0;
let subscription = { tier: 'pro', status: 'active' };
let invoke = async () => { calls++; return { data: null, error: new Error('mock sem resposta') }; };
function profileQuery() {
  let changes;
  let insert = false;
  return {
    update(patch) { changes = patch; lastChanges = patch; return this; },
    insert(patch) { changes = patch; insert = true; return this; },
    eq(column, value) { assert.equal(column, 'id'); assert.equal(value, 'owner'); return this; },
    select() { return this; },
    async maybeSingle() {
      if (!profileError && changes && (profileRow || insert)) profileRow = { ...profileRow, ...changes };
      return { data: profileRow, error: profileError };
    },
    async single() { return this.maybeSingle(); },
  };
}
const mocks = {
  react: { useCallback: fn => fn, useMemo: fn => fn() },
  '@/providers/SubscriptionProvider': { useSubscription: () => ({
    tier: subscription?.tier, subscription,
    trialDaysLeft: subscription?.status === 'trialing' ? 7 : null,
  }) },
'@/lib/supabase': { supabase: {
  from: () => profileQuery(), functions: { invoke: (...args) => invoke(...args) },
} },
'@/lib/storage': { sessionStorage: {
  getItem: async k => stored.get(k), setItem: async (k, v) => stored.set(k, v),
  removeItem: async k => stored.delete(k),
} },
'@/data': { db: { appointments: { create: async () => { createdAppointments++; return { /* ... */ }; } } } },

'react-native': { Platform: { OS: 'web' } },
'expo-print': {},
'expo-sharing': {},
'@/features/pdf/imprimir': {},
};
function load(relative) {
  const file = path.resolve(relative);
  if (cache.has(file)) return cache.get(file);
  const mod = new Module(file);
  mod.filename = file;
  cache.set(file, mod.exports);
  mod.require = spec => {
    if (Object.hasOwn(mocks, spec)) return mocks[spec];
    if (spec === './remoteImage') return {};
    const target = spec.startsWith('@/')
  ? path.resolve('src', spec.slice(2))
  : path.resolve(path.dirname(file), spec);

const relativoAoSrc = path
  .relative(path.resolve('src'), target)
  .split(path.sep)
  .join('/');

const alias = '@/' + relativoAoSrc;

if (Object.hasOwn(mocks, alias)) return mocks[alias];

return load(`${target}.ts`);
  };
  mod._compile(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  cache.set(file, mod.exports);
  return mod.exports;
}
const types = load('src/data/types.ts');
Object.assign(mocks['@/data'], { ok: types.ok, err: types.err });
const plans = load('src/features/plans.ts');
const { useFeatureAccess } = load('src/features/useFeatureAccess.ts');
const proposal = load('src/features/simulador/proposal.ts');
const { SupabaseProfileRepository } = load('src/data/supabase/SupabaseProfileRepository.ts');
const consent = load('src/features/lia/consentimento.ts');
const extraction = load('src/features/lia/extrair.ts');
const agenda = load('src/features/lia/agendamento.ts');
const scanConsent = load('src/features/scan/consent.ts');
const scan = load('src/lib/documentScan.ts');

await test('somente Start/Pro, valores novos e vendas/comissões no Pro', () => {
  assert.deepEqual(plans.PLAN_ORDER, ['start', 'pro']);
  assert.deepEqual(Object.keys(plans.PLANS), ['start', 'pro']);
  assert.equal(plans.PLANS.start.priceLabel, 'R$ 29,90/mês');
  assert.equal(plans.PLANS.pro.priceLabel, 'R$ 59,90/mês');
  for (const key of ['vendas', 'comissao', 'ranking', 'lia']) {
    assert.deepEqual(plans.PLAN_FEATURES.find(f => f.key === key).includedIn, ['pro']);
    assert.equal(plans.planoMinimoPara(key).tier, 'pro');
  }
});
const baseProfile = { fullName: 'Corretor Teste', cpf: '12345678901', phone: '85999999999', uf: 'CE' };
await test('LIA exclusiva do Pro, sem exceção para teste gratuito', () => {
  for (const tier of ['start', 'intermed', null, undefined]) {
    assert.equal(plans.canUse('lia', tier), false);
    assert.equal(plans.canUse('lia', tier, true), false);
  }
  assert.equal(plans.canUse('lia', 'pro'), true);
  assert.equal(plans.canUse('lia', 'pro', true), false);
  assert.equal(plans.canUse('vendas', 'start', true), true);
});
await test('acesso efetivo à LIA exige Pro ativo, inclusive após mudança de assinatura', () => {
  for (const tier of ['start', 'pro', null]) {
    for (const status of ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired']) {
      subscription = { tier, status };
      assert.equal(useFeatureAccess().canUse('lia'), tier === 'pro' && status === 'active');
    }
  }
  subscription = null;
  assert.equal(useFeatureAccess().canUse('lia'), false);
});
await test('ranking: todos veem, disputar só com Pro pago (o teste registra venda, mas não disputa)', () => {
  for (const tier of ['start', null, undefined]) {
    assert.equal(plans.canUse('ranking', tier), false);
    assert.equal(plans.canUse('ranking', tier, true), false);
  }
  assert.equal(plans.canUse('ranking', 'pro'), true);
  assert.equal(plans.canUse('ranking', 'pro', true), false);
  for (const tier of ['start', 'pro', null]) {
    for (const status of ['active', 'trialing', 'past_due', 'canceled']) {
      subscription = { tier, status };
      assert.equal(useFeatureAccess().canUse('ranking'), tier === 'pro' && status === 'active');
    }
  }
  // O teste gratuito continua registrando venda (é o Pro completo, menos LIA e ranking).
  subscription = { tier: 'start', status: 'trialing' };
  assert.equal(useFeatureAccess().canUse('vendas'), true);
  subscription = null;
  assert.equal(useFeatureAccess().canUse('ranking'), false);
});
for (const [agency, cnpj] of [[null, null], ['Agência', null], [null, '12345678000190'], ['Agência', '12345678000190']]) {
  await test(`perfil completo e PDF: imobiliária=${Boolean(agency)}, CNPJ=${Boolean(cnpj)}`, () => {
    const profile = { ...baseProfile, agency, cnpj };
    assert.equal(types.isProfileComplete(profile), true);
    const html = proposal.agencyRowHtml(profile);
    assert.equal(html.includes('IMOBILIÁRIA:'), Boolean(agency));
    assert.equal(html.includes('CNPJ:'), Boolean(cnpj));
    assert.doesNotMatch(html, /null|undefined/);
    if (!agency && !cnpj) assert.equal(html, '');
    if (Boolean(agency) !== Boolean(cnpj)) assert.match(html, /colspan="5"/);
  });
}
await test('demais campos obrigatórios preservados e HTML escapado', () => {
  for (const key of Object.keys(baseProfile)) assert.equal(types.isProfileComplete({ ...baseProfile, [key]: ' ' }), false);
  assert.equal(types.isProfileComplete(null), false);
  assert.match(proposal.agencyRowHtml({ agency: '<script>Teste</script>' }), /&lt;script&gt;/);
});
const repo = new SupabaseProfileRepository();
await test('edição parcial preserva campos omitidos', async () => {
  assert.equal((await repo.upsert('owner', { fullName: 'Novo nome' })).ok, true);
  assert.equal(profileRow.agency, 'Imobiliária existente');
  assert.equal(profileRow.cnpj, '12345678000190');
  assert.equal(Object.hasOwn(lastChanges, 'agency'), false);
});
await test('limpar campos opcionais grava NULL', async () => {
  await repo.upsert('owner', { agency: '  ', cnpj: '' });
  assert.equal(profileRow.agency, null);
  assert.equal(profileRow.cnpj, null);
});
await test('perfil ausente é inserido sem apagar outros perfis', async () => {
  profileRow = null;
  assert.equal((await repo.upsert('owner', { fullName: 'Novo perfil' })).ok, true);
  assert.equal(profileRow.id, 'owner');
});
await test('erro de atualização não tenta inserção', async () => {
  profileError = { message: 'falha de rede' };
  const before = profileRow;
  assert.equal((await repo.upsert('owner', { agency: 'Não gravar' })).ok, false);
  assert.equal(profileRow, before);
});
await test('aceite persistido não autoriza outra sessão nem envio de dados', async () => {
  assert.equal(await consent.temConsentimentoLia(), false);
  assert.ok('erro' in await extraction.extrair({}));
  assert.ok('erro' in await agenda.extrairAgendamento({}));
  assert.equal(calls, 0);
});
await test('aceite permite envio e revogação bloqueia novas requisições', async () => {
  await consent.darConsentimentoLia();
  assert.equal(await consent.temConsentimentoLia(), true);
  await extraction.extrair({});
  await agenda.extrairAgendamento({});
  assert.equal(calls, 2);
  let stopped = 0;
  const unsub = consent.aoRevogarConsentimentoLia(() => stopped++);
  await consent.limparConsentimentoLia();
  assert.equal(stopped, 1);
  unsub();
  assert.equal(stored.size, 0);
  await extraction.extrair({});
  await agenda.extrairAgendamento({});
  assert.equal(calls, 2);
});
await test('revogar enquanto IA responde impede salvar compromisso', async () => {
  await consent.darConsentimentoLia();
  invoke = async (_, { body }) => {
    await consent.limparConsentimentoLia();
    return { error: null, data: { versao: body.versao, agendamento: {
      titulo: 'Visita de teste', data: '2026-10-01', hora: '10:00',
    } } };
  };
  const result = await agenda.agendarPorVoz('owner', 'agenda amanhã às 10', {
    empreendimentos: [], clientes: [], empresaDoEmpreendimento: {},
  });
  assert.equal(result.ok, false);
  assert.match(result.motivo, /autorização/);
  assert.equal(createdAppointments, 0);
});
await test('scan exige aviso e autorização do titular a cada chamada; revogação bloqueia envio', async () => {
  let uploads = 0;
  invoke = async () => { uploads++; return { data: { fullName: 'Teste' }, error: null }; };
  assert.equal((await scan.scanDocument('fake-image', 'image/jpeg', true)).ok, false);
  await scanConsent.darConsentimentoScan();
  assert.equal((await scan.scanDocument('fake-image', 'image/jpeg')).ok, false);
  assert.equal(uploads, 0);
  assert.equal((await scan.scanDocument('fake-image', 'image/jpeg', true)).ok, true);
  assert.equal(uploads, 1);
  assert.equal((await scan.scanDocument('another-image', 'image/jpeg')).ok, false);
  await scanConsent.revogarConsentimentoScan();
  assert.equal((await scan.scanDocument('fake-image', 'image/jpeg', true)).ok, false);
  assert.equal(uploads, 1);
});
console.log(`\n${passed} cenários de planos/cadastro/privacidade passaram.`);
