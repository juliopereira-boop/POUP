// Executa os handlers reais sem rede, credenciais ou dados de produção.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const consentTexto = 'Autorizo o corretor a entrar em contato comigo pelos dados informados, para falar sobre ' +
  'imóveis. Posso pedir a exclusão dos meus dados a qualquer momento.';
function fixture() {
  return { calls: [], user: { id: 'owner', identities: [{ provider: 'apple', identity_data: { sub: 'apple-owner' } }] },
    quota: { permitido: true }, appleSub: 'apple-owner', simOwner: 'owner',
    env: { APPLE_TEAM_ID: 'team', APPLE_KEY_ID: 'key', APPLE_CLIENT_ID: 'br.com.poup.app' } };
}
function load(name, f) {
  let handler;
  const admin = {
    auth: { getUser: async token => { f.calls.push(['getUser', token]); return { data: { user: f.user } }; } },
    rpc: async (name, args) => { f.calls.push(['rpc', name, args]); return { data: f.quota, error: f.quotaError }; },
    from: table => {
      const filters = {};
      return {
        select() { return this; }, eq(k, v) { filters[k] = v; return this; },
        async maybeSingle() {
          f.calls.push(['select', table, filters]);
          const data = table === 'profiles' ? { id: 'owner', full_name: 'Teste' }
            : table === 'apple_credentials' ? f.appleCredential ?? null
            : table === 'financing_share_tokens' ? { id: 'link', simulation_id: 'sim', user_id: 'owner', expires_at: '2099-01-01', views: 0 }
            : table === 'financing_simulations' && filters.user_id === f.simOwner ? { user_id: f.simOwner, result: {}, input: { income: 'PRIVATE' } } : null;
          return { data, error: f.readError };
        },
        async insert(data) { f.calls.push(['insert', table, data]); return {}; },
        async upsert(data) { f.calls.push(['upsert', table, data]); return {}; },
        update() { return this; },
      };
    },
  };
  const context = vm.createContext({ exports: {}, Request, Response, TextEncoder, URL, URLSearchParams, AbortSignal,
    atob, btoa, crypto: webcrypto, console: { error() {}, warn() {} },
    Deno: { env: { get: k => f.env[k] }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: (...args) => { f.calls.push(['client', args[2]]); return admin; } }),
    fetch: async url => {
      assert.equal(url, 'https://appleid.apple.com/auth/token');
      const claims = { sub: f.appleSub, aud: f.env.APPLE_CLIENT_ID, iss: 'https://appleid.apple.com', exp: Date.now() / 1000 + 600 };
      return Response.json({ refresh_token: 'test-only', id_token: `test.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test` });
    },
  });
  vm.runInContext(ts.transpileModule(readFileSync(`supabase/functions/${name}/index.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const call = body => handler(new Request('https://example.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer test-jwt', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  call.charge = vm.runInContext('typeof cobrarUso === "function" ? cobrarUso : null', context);
  return call;
}

let count = 0;
async function test(name, run) { await run(); count++; console.log(`ok ${name}`); }
const body = { brokerUserId: '11111111-1111-4111-8111-111111111111', name: 'Teste', phone: '85999999999', consentVersao: 1, consentTexto };
await test('consentimento ausente, incompleto ou adulterado não grava lead', async () => {
  for (const patch of [{ consentVersao: null }, { consentTexto: '' }, { consentVersao: 2 }, { consentTexto: 'outro' }]) {
    const f = fixture(); assert.equal((await load('capture-lead', f)({ ...body, ...patch })).status, 400);
    assert.equal(f.calls.some(c => c[0] === 'insert'), false);
  }
});
await test('limitador indisponível ou excedido não grava lead', async () => {
  for (const [quota, status] of [[null, 503], [{ permitido: false }, 429]]) {
    const f = fixture(); f.quota = quota;
    assert.equal((await load('capture-lead', f)(body)).status, status);
    assert.equal(f.calls.some(c => c[0] === 'insert'), false);
  }
});
await test('captação válida congela texto, versão e horário do servidor', async () => {
  const f = fixture(); assert.equal((await load('capture-lead', f)(body)).status, 200);
  const lead = f.calls.find(c => c[0] === 'insert')[2];
  assert.equal(lead.consent_texto, consentTexto); assert.equal(lead.consent_versao, 1);
  assert.ok(Date.parse(lead.consent_at));
});
await test('link de outro dono nunca revela simulação', async () => {
  const f = fixture(); f.simOwner = 'other';
  assert.equal((await load('get-financing-simulation', f)({ token: 'a'.repeat(48) })).status, 404);
});
await test('link do dono revela resumo, não entrada financeira', async () => {
  const res = await load('get-financing-simulation', fixture())({ token: 'a'.repeat(48) });
  assert.equal(res.status, 200); assert.equal((await res.text()).includes('PRIVATE'), false);
});
const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']);
const pem = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
await test('Apple vincula credencial apenas à identidade autenticada', async () => {
  for (const sub of ['apple-owner', 'someone-else']) {
    const f = fixture(); f.env.APPLE_PRIVATE_KEY = pem; f.appleSub = sub;
    const res = await load('apple-link', f)({ authorizationCode: 'test-code' });
    assert.equal(res.status, sub === 'apple-owner' ? 200 : 403);
    assert.equal(f.calls.some(c => c[0] === 'upsert'), sub === 'apple-owner');
    assert.equal(f.calls.find(c => c[0] === 'client')[1].global, undefined);
    assert.equal(f.calls.find(c => c[0] === 'getUser')[1], 'test-jwt');
  }
});
await test('Apple sem secrets não declara sucesso', async () => {
  const f = fixture(); const res = await load('apple-link', f)({ authorizationCode: 'test' });
  assert.equal((await res.json()).vinculado, false); assert.equal(f.calls.some(c => c[0] === 'upsert'), false);
});
await test('status Apple autenticado retorna só presença/configuração, sem trocar código', async () => {
  for (const hasCredential of [false, true]) {
    const f = fixture(); f.env.APPLE_PRIVATE_KEY = pem;
    if (hasCredential) f.appleCredential = { user_id: 'owner', refresh_token: 'PRIVATE-TOKEN' };
    const res = await load('apple-link', f)({ action: 'status' });
    assert.deepEqual(await res.json(), { configurado: true, vinculado: hasCredential });
    assert.equal(f.calls.some(c => c[0] === 'upsert'), false);
    assert.equal(f.calls.find(c => c[0] === 'select')[2].user_id, 'owner');
  }
});
await test('status Apple recusa sessão ausente, identidade ausente e erro de banco', async () => {
  for (const [mode, expected] of [['user', 401], ['identity', 403], ['db', 503]]) {
    const f = fixture();
    if (mode === 'user') f.user = null;
    if (mode === 'identity') f.user.identities = [];
    if (mode === 'db') f.readError = { message: 'offline' };
    assert.equal((await load('apple-link', f)({ action: 'status' })).status, expected);
    assert.equal(f.calls.some(c => c[0] === 'upsert'), false);
  }
});
await test('prospecção antiga retorna 410 sem rede ou banco', async () => {
  const f = fixture(); assert.equal((await load('prospect-leads', f)({})).status, 410); assert.equal(f.calls.length, 0);
});
await test('estorno nas quatro funções usa service role e dono validado', async () => {
  for (const name of ['lia-extract','scan-document','generate-invite','generate-pitch']) {
    const f = fixture();
    const caller = { rpc: async () => ({ data: { permitido: true } }),
      auth: { getUser: async () => ({ data: { user: { id: 'verified-owner' } } }) } };
    const quota = await load(name,f).charge(caller,'convite',1);
    await quota.estornar();
    const refund = f.calls.find(c => c[0] === 'rpc');
    assert.equal(refund[1], 'estornar_ia_servico'); assert.equal(refund[2].p_user, 'verified-owner');
    assert.equal(f.calls.find(c => c[0] === 'client')[1].global, undefined);
  }
});
console.log(`${count} grupos de testes de segurança passaram.`);
