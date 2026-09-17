// Código real, APIs nativas simuladas. Não substitui teste de release no iPhone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks = {}) {
  const context = vm.createContext({ exports: {}, console, URL, URLSearchParams,
    require: name => {
      if (!(name in mocks)) throw Error(`Mock ausente: ${name}`);
      return mocks[name];
    } });
  vm.runInContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`ok ${name}`); }
function kv() {
  return { data: new Map(), fail: () => false, writes: [],
    async getItem(key) { if (this.fail('get', key)) throw Error('cofre bloqueado'); return this.data.get(key) ?? null; },
    async setItem(key, value) {
      if (this.fail('set', key)) throw Error('cofre bloqueado');
      assert.ok(Buffer.byteLength(value) <= 2000);
      this.writes.push(key); this.data.set(key, value);
    },
    async removeItem(key) { if (this.fail('remove', key)) throw Error('limpeza falhou'); this.data.delete(key); },
  };
}
const { createSecureTokenStorage } = load('src/lib/secureTokenStorage.ts');
function storage() {
  const secure = kv(); const legacy = kv();
  const fresh = () => createSecureTokenStorage(secure, legacy, randomUUID);
  return { secure, legacy, store: fresh(), fresh };
}
await test('sessão longa e Unicode só no cofre, inclusive após reabertura', async () => {
  const f = storage(); const value = JSON.stringify({ token: 'á🔒漢字'.repeat(2000) });
  await f.store.setItem('session', value);
  assert.equal(await f.fresh().getItem('session'), value);
  assert.equal(f.legacy.writes.length, 0); assert.equal(f.legacy.data.size, 0);
});
await test('refresh substitui geração antiga; não deixa fragmentos ativos antigos', async () => {
  const f = storage(); await f.store.setItem('s', 'a'.repeat(4000)); await f.store.setItem('s', 'nova');
  assert.equal(await f.fresh().getItem('s'), 'nova'); assert.equal(f.secure.data.size, 2);
});
await test('falha em fragmento ou publicação não substitui sessão completa anterior', async () => {
  for (const failHead of [false, true]) {
    const f = storage(); await f.store.setItem('s', 'anterior');
    f.secure.fail = (op, key) => op === 'set' && (failHead ? key === 's.secure-v2' : key.endsWith('.1'));
    await assert.rejects(f.store.setItem('s', 'nova'.repeat(1000)));
    f.secure.fail = () => false;
    assert.equal(await f.fresh().getItem('s'), 'anterior'); assert.equal(f.secure.data.size, 2);
    assert.equal(f.legacy.writes.length, 0);
  }
});
await test('migra legado do AsyncStorage, do cofre e cópias iguais', async () => {
  for (const source of ['plain', 'secure', 'both']) {
    const f = storage();
    if (source !== 'secure') f.legacy.data.set('s', 'sessão');
    if (source !== 'plain') f.secure.data.set('s', 'sessão');
    assert.equal(await f.store.getItem('s'), 'sessão');
    assert.equal(f.legacy.data.has('s'), false); assert.equal(f.secure.data.has('s'), false);
    assert.equal(await f.fresh().getItem('s'), 'sessão');
  }
});
await test('cópias legadas divergentes exigem novo login; não escolhe token antigo', async () => {
  const f = storage(); f.legacy.data.set('s', 'nova'); f.secure.data.set('s', 'antiga');
  assert.equal(await f.store.getItem('s'), null); assert.equal(f.legacy.data.size, 0);
  assert.equal(await f.fresh().getItem('s'), null);
  await f.store.setItem('s', 'login confirmado'); assert.equal(await f.store.getItem('s'), 'login confirmado');
});
await test('migração interrompida não apaga única cópia antes de persistir no cofre', async () => {
  const f = storage(); f.legacy.data.set('s', 'legado'); f.secure.fail = op => op === 'set';
  await assert.rejects(f.store.getItem('s')); assert.equal(f.legacy.data.get('s'), 'legado');
  f.secure.fail = () => false; assert.equal(await f.store.getItem('s'), 'legado');
});
await test('cofre bloqueado não lê nem grava fallback público', async () => {
  const f = storage(); f.legacy.data.set('s', 'legado'); f.secure.fail = () => true;
  await assert.rejects(f.store.getItem('s')); await assert.rejects(f.store.setItem('s', 'nova'));
  await assert.rejects(f.store.removeItem('s')); assert.equal(f.legacy.writes.length, 0);
});
await test('logout interrompido não ressuscita cópia antiga', async () => {
  const f = storage(); await f.store.setItem('s', 'nova'); f.legacy.data.set('s', 'velha');
  f.legacy.fail = op => op === 'remove'; await assert.rejects(f.store.removeItem('s'));
  f.legacy.fail = () => false; assert.equal(await f.fresh().getItem('s'), null);
  assert.equal(f.legacy.data.size, 0);
});
await test('operações concorrentes preservam ordem de refresh, logout e nova conta', async () => {
  const f = storage();
  await Promise.all([f.store.setItem('s', 'a'), f.store.setItem('s', 'b'), f.store.removeItem('s'), f.store.setItem('s', 'c')]);
  assert.equal(await f.fresh().getItem('s'), 'c'); assert.equal(f.secure.data.size, 2);
});
await test('fragmento ausente ou manifesto inválido não restaura legado', async () => {
  for (const corrupted of [false, true]) {
    const f = storage(); await f.store.setItem('s', 'nova'); f.legacy.data.set('s', 'velha');
    if (corrupted) f.secure.data.set('s.secure-v2', 'quebrado');
    else f.secure.data.delete([...f.secure.data.keys()].find(k => k.endsWith('.0')));
    assert.equal(await f.store.getItem('s'), null); assert.equal(f.legacy.data.size, 0);
    await f.store.setItem('s', 'login'); assert.equal(await f.store.getItem('s'), 'login');
  }
});
await test('sessão vazia, chaves independentes e limite de tamanho', async () => {
  const f = storage(); await f.store.setItem('a', ''); await f.store.setItem('b', 'outra');
  assert.equal(await f.store.getItem('a'), ''); await f.store.removeItem('a');
  assert.equal(await f.store.getItem('b'), 'outra');
  await assert.rejects(f.store.setItem('b', 'x'.repeat(102401)));
  assert.equal(await f.store.getItem('b'), 'outra');
});
await test('armazenamento web não acessa módulos nativos nem muda a persistência existente', async () => {
  const { tokenStorage, sessionStorage } = load('src/lib/storage.ts', {
    '@react-native-async-storage/async-storage': { default: kv() }, 'expo-secure-store': {},
    'expo-crypto': {}, 'react-native': { Platform: { OS: 'web' } },
    './secureTokenStorage': { createSecureTokenStorage: () => { throw Error('web não usa cofre nativo'); } },
  });
  assert.equal(tokenStorage, sessionStorage);
  await tokenStorage.setItem('s', 'sessão web'); assert.equal(await tokenStorage.getItem('s'), 'sessão web');
  await tokenStorage.removeItem('s'); assert.equal(await tokenStorage.getItem('s'), null);
});

const cryptoMock = { CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytesAsync: async n => randomBytes(n),
  digestStringAsync: async (algorithm, value) => {
    assert.equal(algorithm, 'SHA-256'); return createHash('sha256').update(value).digest('hex');
  } };
const resultMock = { ok: data => ({ ok: true, data }), err: error => ({ ok: false, error }) };
function authFixture() {
  const f = { calls: [], os: 'ios', vinculado: true, status: { configurado: true, vinculado: false },
    user: { id: 'owner', identities: [{ provider: 'apple' }] },
    credential: { identityToken: 'id-token', authorizationCode: 'code', fullName: { givenName: 'Nome' } } };
  f.supabase = { auth: {
    getUser: async () => ({ data: { user: f.user } }),
    signInWithIdToken: async args => { f.calls.push(['login', args]); return { error: f.loginError }; },
    updateUser: async args => { f.calls.push(['update', args]); return {}; },
    signOut: async () => { f.calls.push(['logout']); return {}; },
    signInWithOAuth: async () => ({ data: { url: 'https://test.invalid' } }),
    setSession: async () => { f.calls.push(['setSession']); return {}; },
  }, functions: { invoke: async (name, options) => {
    f.calls.push([name, options.body]);
    if (f.networkError) throw Error('offline');
    return { data: name === 'delete-account' ? { deleted: true }
      : options.body.action === 'status' ? f.status : { vinculado: f.vinculado }, error: f.linkError };
  } } };
  f.repo = () => new (load('src/data/supabase/SupabaseAuthRepository.ts', {
    'expo-linking': { createURL: () => 'poup:///' },
    'expo-web-browser': { openAuthSessionAsync: async () => ({ type: 'success', url: 'poup:///#nothing=1' }) },
    'react-native': { Platform: { OS: f.os }, Alert: { alert: (...args) => f.calls.push(['alert', ...args]) } },
    'expo-crypto': cryptoMock,
    'expo-apple-authentication': { AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
      isAvailableAsync: async () => true,
      signInAsync: async options => { f.calls.push(['apple', options]); if (f.appleError) throw f.appleError; return f.credential; } },
    '@/lib/supabase': { supabase: f.supabase }, '@/lib/appUrl': { getAppUrl: () => 'https://test.invalid' },
    '@/lib/edgeError': { mensagemDoErro: async () => 'Falha' }, '../types': resultMock,
  }).SupabaseAuthRepository)();
  return f;
}
await test('login Apple vincula nonce hash à requisição e nonce original ao Supabase', async () => {
  const f = authFixture(); assert.equal((await f.repo().signInWithApple()).ok, true);
  const nativeNonce = f.calls.find(c => c[0] === 'apple')[1].nonce;
  const raw = f.calls.find(c => c[0] === 'login')[1].nonce;
  assert.match(raw, /^[a-f0-9]{64}$/); assert.equal(nativeNonce, createHash('sha256').update(raw).digest('hex'));
  assert.equal(f.calls.some(c => c[0] === 'apple-link'), true); assert.equal(f.calls.some(c => c[0] === 'alert'), false);
});
await test('falha de vinculação Apple não fica silenciosa nem invalida login', async () => {
  for (const mode of ['false', 'transport', 'missing-code']) {
    const f = authFixture(); f.vinculado = false;
    if (mode === 'transport') f.networkError = true;
    if (mode === 'missing-code') f.credential.authorizationCode = null;
    assert.equal((await f.repo().signInWithApple()).ok, true);
    assert.equal(f.calls.filter(c => c[0] === 'alert').length, 1);
  }
});
await test('login cancelado ou sem identity token não instala sessão', async () => {
  for (const cancel of [true, false]) {
    const f = authFixture(); if (cancel) f.appleError = { code: 'ERR_REQUEST_CANCELED' }; else f.credential.identityToken = null;
    assert.equal((await f.repo().signInWithApple()).ok, false); assert.equal(f.calls.some(c => c[0] === 'login'), false);
  }
});
await test('exclusão recupera código Apple sem substituir sessão/identidade Supabase', async () => {
  const f = authFixture(); assert.equal((await f.repo().deleteAccount('EXCLUIR')).ok, true);
  assert.deepEqual(f.calls.filter(c => ['apple', 'apple-link', 'delete-account', 'logout'].includes(c[0])).map(c => c[0]),
    ['apple-link', 'apple', 'apple-link', 'delete-account', 'logout']);
  assert.equal(f.calls.some(c => c[0] === 'login' || c[0] === 'setSession'), false);
});
await test('cancelamento, identidade divergente ou falta de configuração não excluem', async () => {
  for (const mode of ['cancel', 'different', 'config', 'error']) {
    const f = authFixture();
    if (mode === 'cancel') f.appleError = { code: 'ERR_REQUEST_CANCELED' };
    if (mode === 'different') f.vinculado = false;
    if (mode === 'config') f.status.configurado = false;
    if (mode === 'error') f.linkError = { message: 'offline' };
    assert.equal((await f.repo().deleteAccount('EXCLUIR')).ok, false);
    assert.equal(f.calls.some(c => c[0] === 'delete-account'), false);
  }
});
await test('vínculo existente e conta sem Apple dispensam confirmação nativa', async () => {
  for (const apple of [true, false]) {
    const f = authFixture(); f.status.vinculado = true;
    if (!apple) f.user.identities = [];
    assert.equal((await f.repo().deleteAccount('EXCLUIR')).ok, true);
    assert.equal(f.calls.some(c => c[0] === 'apple'), false);
  }
});
await test('exclusão sem confirmação e callback OAuth sem tokens falham explicitamente', async () => {
  const f = authFixture(); assert.equal((await f.repo().deleteAccount('')).ok, false); assert.equal(f.calls.length, 0);
  assert.equal((await f.repo().signInWithGoogle()).ok, false); assert.equal(f.calls.some(c => c[0] === 'setSession'), false);
});
function financing(crypto = cryptoMock) {
  const f = { inserts: [] };
  const table = { insert(data) { f.inserts.push(data); return this; }, select() { return this; }, async single() { return { data: { id: 'share' } }; } };
  f.repo = new (load('src/data/supabase/SupabaseFinancingRepository.ts', {
    'expo-crypto': crypto, '@/lib/supabase': { supabase: { from: () => table } },
    './limites': { LIMITE_LISTA: 500 }, '@/lib/appUrl': { getAppUrl: () => 'https://test.invalid' }, '../types': resultMock,
  }).SupabaseFinancingRepository)();
  return f;
}
await test('compartilhamento funciona sem crypto global e preserva token/hash existentes', async () => {
  const f = financing(); const link = await f.repo.criarLink('owner', 'simulation', 7);
  assert.equal(link.ok, true); const token = link.data.url.split('/').at(-1); assert.match(token, /^[a-z0-9]{48}$/);
  assert.equal(f.inserts[0].token_hash, createHash('sha256').update(token).digest('hex'));
  assert.equal(JSON.stringify(f.inserts).includes(token), false);
});
await test('falha criptográfica não cria link nem usa aleatoriedade fraca', async () => {
  for (const method of ['getRandomBytesAsync', 'digestStringAsync']) {
    const f = financing({ ...cryptoMock, [method]: async () => { throw Error('indisponível'); } });
    assert.equal((await f.repo.criarLink('owner', 'simulation', 7)).ok, false); assert.equal(f.inserts.length, 0);
  }
});
console.log(`\n${passed} grupos de testes nativos passaram (APIs simuladas).`);
