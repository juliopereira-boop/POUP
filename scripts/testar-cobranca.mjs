// Handlers reais; Stripe/Supabase simulados. Não faz rede nem cobra/apaga contas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`ok ${name}`); }
function fixture() {
  return {
    env: { STRIPE_PRICE_START: 'price_start', STRIPE_PRICE_PRO: 'price_pro' },
    user: { id: 'owner', email: 'test@example.invalid', identities: [] },
    existing: null, dbError: null, rpcError: null, signatureError: false,
    sub: { id: 'sub_test', status: 'active', customer: 'cus_test', metadata: { supabase_user_id: 'owner' },
      items: { data: [{ price: { id: 'price_pro' } }] }, current_period_end: 1800000000 },
    event: { type: 'customer.subscription.updated', created: 100, data: { object: { id: 'sub_test', status: 'active' } } },
    price: { active: true, currency: 'brl', unit_amount: 6990, recurring: { interval: 'month', interval_count: 1 } },
    subscriptions: [], openSessions: [], calls: [], apple: null, storageCalls: 0,
  };
}
function load(name, f) {
  let handler;
  const stripe = {
    prices: { retrieve: async id => { f.calls.push(['price', id]); return f.price; } },
    customers: { create: async (data, options) => { f.calls.push(['customer', data, options]); return { id: 'cus_test' }; } },
    subscriptions: {
      retrieve: async id => { f.calls.push(['retrieve', id]); return f.sub; },
      list: async () => ({ data: f.subscriptions, has_more: f.hasMore ?? false }),
      cancel: async id => { f.calls.push(['cancel', id]); if (f.cancelError) throw f.cancelError; },
    },
    checkout: { sessions: {
      list: async () => ({ data: f.openSessions }),
      create: async (data, options) => { f.calls.push(['checkout', data, options]); return { url: 'https://checkout.stripe.com/test' }; },
    } },
    webhooks: { constructEventAsync: async () => { if (f.signatureError) throw new Error('signature'); return f.event; } },
  };
  class Stripe { constructor() { return stripe; } static createFetchHttpClient() { return {}; } }
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: f.user } }),
      admin: {
        signOut: async (jwt, scope) => { f.calls.push(['signout', jwt, scope]); return { error: f.signOutError }; },
        deleteUser: async id => { f.calls.push(['delete', id]); return { error: f.deleteError }; },
      },
    },
    rpc: async (name, args) => {
      f.calls.push(['rpc', name, args]);
      return { data: name === 'assign_billing_customer' ? 'cus_test' : true, error: f.rpcError };
    },
    from: table => ({
      select() { return this; },
      eq() { return this; },
      delete() { return this; },
      async maybeSingle() {
        return { data: table === 'subscriptions' ? f.existing
          : table === 'apple_credentials' ? f.apple : null, error: f.dbError };
      },
    }),
    storage: { from: () => ({
      list: async (prefix, options) => {
        f.storageCalls++;
        f.calls.push(['list', prefix, options]);
        if (f.storageResponse) return f.storageResponse(prefix, options, f.storageCalls);
        return { data: [], error: null };
      },
      remove: async paths => { f.calls.push(['remove', paths]); return { error: f.removeError }; },
    }) },
  };
  const exports = {};
  const context = vm.createContext({
    exports, Request, Response, URL, URLSearchParams, AbortSignal, TextEncoder,
    console: { log() {}, error() {} },
    fetch: () => { throw Error('Rede real proibida nos testes'); },
    Deno: { env: { get: key => f.env[key] }, serve: fn => { handler = fn; } },
    require: spec => spec.includes('/stripe@') ? { default: Stripe } : { createClient: () => admin },
  });
  vm.runInContext(ts.transpileModule(readFileSync(`supabase/functions/${name}/index.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return {
    exports,
    call: (body = {}, auth = true, method = 'POST') => handler(new Request('https://test.invalid', {
      method,
      headers: { ...(auth ? { Authorization: 'Bearer jwt-owner' } : {}), 'stripe-signature': 'test' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    })),
  };
}
const has = (f, operation) => f.calls.some(c => c[0] === operation);
const checkoutBody = { priceId: 'price_pro', successUrl: 'https://poup.example/sucesso', cancelUrl: 'https://poup.example/planos' };

for (const env of [{}, { STRIPE_PRICE_START: 'price_same', STRIPE_PRICE_PRO: 'price_same' }]) {
  await test('checkout sem configuração válida falha fechado', async () => {
    const f = fixture(); f.env = env;
    assert.equal((await load('create-checkout-session', f).call(checkoutBody)).status, 503);
    assert.equal(has(f, 'checkout'), false);
  });
}
await test('checkout exige autenticação e método POST', async () => {
  const api = load('create-checkout-session', fixture());
  assert.equal((await api.call(checkoutBody, false)).status, 401);
  assert.equal((await api.call({}, true, 'GET')).status, 405);
});
for (const priceId of ['price_intermed', 'price_unknown']) {
  await test(`checkout rejeita ${priceId}`, async () => {
    const f = fixture();
    assert.equal((await load('create-checkout-session', f).call({ ...checkoutBody, priceId })).status, 400);
    assert.equal(has(f, 'price'), false);
  });
}
for (const patch of [{ unit_amount: 8990 }, { currency: 'usd' }, { active: false }, { recurring: { interval: 'year', interval_count: 1 } }]) {
  await test(`checkout rejeita divergência comercial ${JSON.stringify(patch)}`, async () => {
    const f = fixture(); Object.assign(f.price, patch);
    assert.equal((await load('create-checkout-session', f).call(checkoutBody)).status, 503);
    assert.equal(has(f, 'checkout'), false);
  });
}
await test('Start usa 2990 e Pro usa 6990; vincula cliente antes de cobrar', async () => {
  for (const [priceId, amount] of [['price_start', 2990], ['price_pro', 6990]]) {
    const f = fixture(); f.price.unit_amount = amount;
    assert.equal((await load('create-checkout-session', f).call({ ...checkoutBody, priceId })).status, 200);
    const created = f.calls.find(c => c[0] === 'checkout');
    assert.equal(created[1].line_items[0].price, priceId);
    assert.equal(created[1].subscription_data.metadata.supabase_user_id, 'owner');
    assert.match(created[2].idempotencyKey, /^poup-checkout-owner-/);
    assert.ok(f.calls.findIndex(c => c[0] === 'rpc') < f.calls.indexOf(created));
  }
});
await test('falha ao associar cliente impede cobrança', async () => {
  const f = fixture(); f.rpcError = { message: 'offline' };
  assert.equal((await load('create-checkout-session', f).call(checkoutBody)).status, 500);
  assert.equal(has(f, 'checkout'), false);
});
await test('assinatura existente e webhook atrasado não abrem nova assinatura', async () => {
  for (const origin of ['database', 'stripe', 'pagination']) {
    const f = fixture();
    if (origin === 'database') f.existing = { stripe_subscription_id: 'sub_test', stripe_customer_id: 'cus_test' };
    if (origin === 'stripe') f.subscriptions = [f.sub];
    if (origin === 'pagination') f.hasMore = true;
    assert.equal((await load('create-checkout-session', f).call(checkoutBody)).status, 409);
    assert.equal(has(f, 'checkout'), false);
  }
});
await test('checkout aberto compatível é reutilizado', async () => {
  const f = fixture(); f.openSessions = [{ metadata: { price_id: 'price_pro' }, url: 'https://checkout.stripe.com/existing' }];
  const response = await load('create-checkout-session', f).call(checkoutBody);
  assert.equal((await response.json()).url, f.openSessions[0].url);
  assert.equal(has(f, 'checkout'), false);
});
await test('checkout aberto de outro plano não gera concorrência', async () => {
  const f = fixture(); f.openSessions = [{ metadata: { price_id: 'price_start' } }];
  assert.equal((await load('create-checkout-session', f).call(checkoutBody)).status, 409);
  assert.equal(has(f, 'checkout'), false);
});
await test('webhook sem assinatura válida não grava', async () => {
  const f = fixture(); f.signatureError = true;
  assert.equal((await load('stripe-webhook', f).call()).status, 400);
  assert.equal(has(f, 'rpc'), false);
});
await test('webhook desconhecido não faz downgrade para Start', async () => {
  const f = fixture(); f.sub.items.data[0].price.id = 'price_intermed';
  assert.equal((await load('stripe-webhook', f).call()).status, 500);
  assert.equal(has(f, 'rpc'), false);
});
await test('falha no banco produz retry, nunca confirmação falsa', async () => {
  const f = fixture(); f.rpcError = { message: 'offline' };
  assert.equal((await load('stripe-webhook', f).call()).status, 500);
});
await test('snapshot antigo consulta Stripe atual; cancelado não conserva cota', async () => {
  const f = fixture(); f.sub.status = 'canceled';
  assert.equal((await load('stripe-webhook', f).call()).status, 200);
  const args = f.calls.find(c => c[0] === 'rpc')[2];
  assert.equal(args.p_status, 'canceled');
  assert.equal(args.p_storage_limit, 0);
  assert.equal(args.p_event_created, 100);
});
await test('todos os eventos de assinatura e checkout usam a RPC', async () => {
  for (const type of ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']) {
    const f = fixture(); f.event.type = type; f.event.data.object.subscription = 'sub_test';
    assert.equal((await load('stripe-webhook', f).call()).status, 200);
    const args = f.calls.find(c => c[0] === 'rpc')[2];
    assert.equal(args.p_user_id, 'owner');
    assert.equal(args.p_tier, 'pro');
    assert.equal(args.p_storage_limit, 25 * 1024 ** 3);
  }
});

await test('exclusão exige confirmação/autenticação; nunca aceita dono do corpo', async () => {
  const f = fixture(); const api = load('delete-account', f);
  assert.equal((await api.call({ confirm: 'EXCLUIR' }, false)).status, 401);
  assert.equal((await api.call({ confirm: 'sim' })).status, 400);
  assert.equal((await api.call({ confirm: 'EXCLUIR', userId: 'outra-pessoa' })).status, 200);
  assert.equal(f.calls.find(c => c[0] === 'delete')[1], 'owner');
  assert.ok(f.calls.findIndex(c => c[0] === 'signout') < f.calls.findIndex(c => c[0] === 'delete'));
  assert.equal(f.calls.find(c => c[0] === 'signout')[2], 'global');
});
for (const stage of ['arquivos', 'conferencia']) {
  await test(`erro de listagem em ${stage} não apaga a conta`, async () => {
    const f = fixture();
    f.storageResponse = (_, __, call) => ({ data: [], error: call === (stage === 'arquivos' ? 1 : 2) ? { message: 'offline' } : null });
    assert.equal((await load('delete-account', f).call({ confirm: 'EXCLUIR' })).status, 503);
    assert.equal(has(f, 'delete'), false);
    assert.equal(f.calls.find(c => c[0] === 'rpc')[2].p_etapa, stage);
  });
}
await test('fila indisponível não promete pedido registrado', async () => {
  const f = fixture(); f.rpcError = { message: 'offline' };
  f.storageResponse = () => ({ data: null, error: { message: 'offline' } });
  const response = await load('delete-account', f).call({ confirm: 'EXCLUIR' });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /nem registrar/);
  assert.equal(has(f, 'delete'), false);
});
await test('Apple sem token/configuração não declara revogação concluída', async () => {
  for (const credentials of [null, { refresh_token: 'fake-token' }]) {
    const f = fixture(); f.user.identities = [{ provider: 'apple' }]; f.apple = credentials;
    f.existing = { stripe_subscription_id: 'sub_test' };
    assert.equal((await load('delete-account', f).call({ confirm: 'EXCLUIR' })).status, 503);
    assert.equal(has(f, 'delete'), false);
    assert.equal(has(f, 'cancel'), false);
    assert.equal(f.calls.find(c => c[0] === 'rpc')[2].p_etapa, 'apple');
  }
});
await test('sessões não revogadas impedem sucesso da exclusão', async () => {
  const f = fixture(); f.signOutError = { message: 'offline' };
  assert.equal((await load('delete-account', f).call({ confirm: 'EXCLUIR' })).status, 503);
  assert.equal(has(f, 'delete'), false);
});
await test('Stripe indisponível impede exclusão e registra pendência', async () => {
  const f = fixture(); f.existing = { stripe_subscription_id: 'sub_test' }; f.cancelError = new Error('offline');
  assert.equal((await load('delete-account', f).call({ confirm: 'EXCLUIR' })).status, 503);
  assert.equal(has(f, 'delete'), false);
  assert.equal(f.calls.find(c => c[0] === 'rpc')[2].p_etapa, 'stripe');
});
await test('Storage percorre subpastas antes de excluir usuário', async () => {
  const f = fixture();
  f.storageResponse = (prefix, _, call) => ({ error: null, data: call === 1 ? [{ name: 'pasta' }, { id: '1', name: 'arquivo.pdf' }]
    : call === 2 ? [{ id: '2', name: 'foto.jpg' }] : [] });
  assert.equal((await load('delete-account', f).call({ confirm: 'EXCLUIR' })).status, 200);
  const paths = f.calls.find(c => c[0] === 'remove')[1];
  assert.equal(paths.join(','), 'owner/arquivo.pdf,owner/pasta/foto.jpg');
});
console.log(`\n${passed} cenários de cobrança/exclusão passaram (APIs simuladas).`);
