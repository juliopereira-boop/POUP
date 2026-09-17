// Executa o handler real com banco/IA simulados, sem rede ou alteração de dados.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('supabase/functions/lia-extract/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let passed = 0;
async function check(subscription, expected, { dbError = null, user = { id: 'owner' }, mode = 'parcial' } = {}) {
  let handler;
  let queries = 0;
  let usage = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      queries++;
      assert.equal(table, 'subscriptions');
      return {
        select(columns) { assert.equal(columns, 'plan_tier, status'); return this; },
        eq(column, id) { assert.equal(column, 'user_id'); assert.equal(id, 'owner'); return this; },
        async maybeSingle() { return { data: subscription, error: dbError }; },
      };
    },
    rpc: async () => { usage++; throw Error('Não deve consumir cota neste teste'); },
  };
  vm.runInNewContext(source, {
    exports: {}, Request, Response, console,
    require: () => ({ createClient: () => client }),
    Deno: { env: { get: () => '' }, serve: fn => { handler = fn; } },
    fetch: () => { throw Error('Rede real proibida'); },
  });
  // Tentativa de forjar Pro no corpo não altera o resultado do banco.
  const response = await handler(new Request('https://test.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer test-user' },
    body: JSON.stringify({ modo: mode, agora: '', plan_tier: 'pro', status: 'active' }),
  }));
  assert.equal(response.status, expected, `${JSON.stringify(subscription)} / ${mode}`);
  assert.equal(usage, 0);
  assert.equal(queries, user ? 1 : 0);
  passed++;
}
for (const mode of ['parcial', 'final', 'agendamento']) {
  for (const tier of ['start', 'intermed', 'pro', null]) {
    for (const status of ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired']) {
      if (tier === 'pro' && status === 'active') continue;
      await check({ plan_tier: tier, status }, 403, { mode });
    }
  }
  await check(null, 403, { mode });
  await check(null, 503, { mode, dbError: { message: 'indisponível' } });
  await check(null, 401, { mode, user: null });
}
// Pro chega ao fluxo normal; texto vazio retorna sem custo.
await check({ plan_tier: 'pro', status: 'active' }, 200);
await check({ plan_tier: 'pro', status: 'active' }, 200, { mode: 'final' });
// Agenda sem frase também retorna sem custo, após a autorização Pro.
await check({ plan_tier: 'pro', status: 'active' }, 200, { mode: 'agendamento' });
console.log(`${passed} cenários de autorização da LIA passaram.`);
