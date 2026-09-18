// Handler real; Apple e banco simulados, sem tocar em contas reais.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto, createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pem = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
const source = ts.transpileModule(readFileSync('supabase/functions/apple-link/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup(overrides = {}) {
  const f = { user: { id: 'owner', identities: [{ provider: 'apple', identity_data: { sub: 'apple-owner' } }] },
    challenge: null, credential: null, calls: [], claims: {}, ...overrides };
  const env = { APPLE_TEAM_ID: 'team', APPLE_KEY_ID: 'key', APPLE_PRIVATE_KEY: pem,
    APPLE_CLIENT_ID: 'br.com.poup.app', APPLE_SERVICES_ID: 'br.com.poup.web',
    APP_URL: 'https://poup.example', SUPABASE_URL: 'https://test.supabase.co', ...f.env };
  const admin = { auth: { getUser: async () => ({ data: { user: f.user } }),
    admin: { getUserById: async id => { assert.equal(id, 'owner'); return { data: { user: f.user } }; } } },
    from(table) {
      const q = { filters: {}, deleting: false,
        select() { return this; }, eq(k,v) { this.filters[k] = v; return this; },
        gt(k,v) { this.after = v; return this; }, delete() { this.deleting = true; return this; },
        async lt(k,v) { if (f.challenge?.expires_at < v) f.challenge = null; return {}; },
        async maybeSingle() {
          if (table === 'apple_credentials') return { data: f.credential };
          assert.equal(this.deleting, true);
          const found = f.challenge && f.challenge.state_hash === this.filters.state_hash && f.challenge.expires_at > this.after;
          const data = found ? f.challenge : null;
          if (found) f.challenge = null;
          return { data, error: f.readError };
        },
        async upsert(data) {
          f.calls.push([table, data]);
          if (f.saveError) return { error: { message: 'offline' } };
          if (table === 'apple_credentials') f.credential = data; else f.challenge = data;
          return {};
        },
      }; return q;
    },
  };
  let handler;
  const context = vm.createContext({ exports: {}, Request, Response, URL, URLSearchParams, TextEncoder,
    AbortSignal, atob, btoa, crypto: webcrypto, console: { error() {}, warn() {} },
    Deno: { env: { get: k => env[k] }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => admin }),
    fetch: async (url, options) => {
      assert.equal(url, 'https://appleid.apple.com/auth/token');
      assert.equal(options.body.get('client_id'), env.APPLE_SERVICES_ID);
      assert.equal(options.body.get('redirect_uri'), `${env.SUPABASE_URL}/functions/v1/apple-link/callback`);
      f.calls.push(['apple']);
      if (f.appleError) return new Response('', { status: 400 });
      const claims = { sub: 'apple-owner', aud: env.APPLE_SERVICES_ID, iss: 'https://appleid.apple.com',
        nonce: f.nonce, exp: Date.now() / 1000 + 300, ...f.claims };
      return Response.json({ refresh_token: 'private-refresh', id_token: `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig` });
    },
  });
  vm.runInContext(source, context);
  f.request = (body, auth = true) => handler(new Request(`${env.SUPABASE_URL}/functions/v1/apple-link`, {
    method: 'POST', headers: auth ? { Authorization: 'Bearer session' } : {}, body: JSON.stringify(body),
  }));
  f.start = async (platform = 'web') => {
    const response = await f.request({ action: 'reauthorize', platform });
    assert.equal(response.status, 200);
    const url = new URL((await response.json()).url);
    f.state = url.searchParams.get('state'); f.nonce = url.searchParams.get('nonce');
    assert.equal(url.origin, 'https://appleid.apple.com');
    assert.equal(url.searchParams.get('response_mode'), 'form_post');
    assert.equal(f.state.length, 43);
    assert.equal(f.challenge.state_hash, createHash('sha256').update(f.state).digest('hex'));
    assert.equal(JSON.stringify(f.challenge).includes(f.state), false);
    return url;
  };
  f.callback = (params = {}) => handler(new Request(`${env.SUPABASE_URL}/functions/v1/apple-link/callback`, {
    method: 'POST', body: new URLSearchParams({ state: f.state ?? '', code: 'fresh-code', ...params }),
  }));
  return f;
}
let count = 0;
async function test(name, run) { await run(); count++; console.log(`ok ${name}`); }
await test('início exige sessão, identidade Apple, configuração e plataforma válida', async () => {
  assert.equal((await setup().request({ action: 'reauthorize' }, false)).status, 401);
  assert.equal((await setup({ user: null }).request({ action: 'reauthorize' })).status, 401);
  assert.equal((await setup({ user: { identities: [] } }).request({ action: 'reauthorize' })).status, 403);
  assert.equal((await setup({ env: { APPLE_SERVICES_ID: '' } }).request({ action: 'reauthorize', platform: 'web' })).status, 503);
  assert.equal((await setup().request({ action: 'reauthorize', platform: 'other' })).status, 400);
});
await test('callback válido vincula Services ID à conta existente; state não pode ser reutilizado', async () => {
  for (const platform of ['web', 'android']) {
    const f = setup(); await f.start(platform);
    const res = await f.callback(); assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), platform === 'web' ? 'https://poup.example/excluir-conta?apple=confirmed' : 'poup://apple-reauth?status=confirmed');
    assert.equal(f.credential.user_id, 'owner'); assert.equal(f.credential.client_id, 'br.com.poup.web');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal((await f.callback()).status, 400);
    assert.equal(f.calls.filter(c => c[0] === 'apple').length, 1);
  }
});
await test('callback simultâneo só consome uma vez', async () => {
  const f = setup(); await f.start();
  const results = await Promise.all([f.callback(), f.callback()]);
  assert.deepEqual(results.map(r => r.status).sort(), [303, 400]);
});
await test('state inválido, expirado ou substituído não troca código', async () => {
  for (const mode of ['absent', 'expired', 'replaced']) {
    const f = setup(); await f.start(); const old = f.state;
    if (mode === 'expired') f.challenge.expires_at = '2000-01-01T00:00:00.000Z';
    if (mode === 'replaced') await f.start();
    assert.equal((await f.callback({ state: mode === 'absent' ? '' : old })).status, 400);
    assert.equal(f.calls.some(c => c[0] === 'apple'), false);
  }
});
await test('cancelamento consome desafio sem salvar credencial', async () => {
  const f = setup(); await f.start();
  assert.match((await f.callback({ error: 'user_cancelled' })).headers.get('location'), /cancelled$/);
  assert.equal(f.credential, null); assert.equal(f.calls.some(c => c[0] === 'apple'), false);
});
await test('identidade, audience, issuer, nonce e expiração são vinculados ao desafio', async () => {
  for (const claims of [{ sub: 'other' }, { aud: 'other' }, { iss: 'other' }, { nonce: 'other' }, { exp: 0 }, { exp: '99999999999' }]) {
    const f = setup({ claims }); await f.start();
    assert.match((await f.callback()).headers.get('location'), /failed$/); assert.equal(f.credential, null);
  }
});
await test('falhas da Apple e da persistência não anunciam confirmação', async () => {
  for (const mode of ['appleError', 'saveError']) {
    const f = setup(); await f.start(); f[mode] = true;
    assert.match((await f.callback()).headers.get('location'), /failed$/); assert.equal(f.credential, null);
  }
});
await test('credencial de client desconhecido não libera exclusão', async () => {
  const f = setup({ credential: { user_id: 'owner', client_id: 'untrusted' } });
  assert.equal((await (await f.request({ action: 'status' })).json()).configurado, false);
});
console.log(`${count} grupos Apple web/Android passaram (serviços simulados).`);
