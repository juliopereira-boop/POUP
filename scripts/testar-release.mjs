import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test-fixture',
  EXPO_PUBLIC_APP_URL: 'https://poup.example.com',
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_testfixture',
};
let count = 0;

function check(patch, expected, context = 'web') {
  const env = { ...process.env };

  for (const key of Object.keys(env)) {
    if (key.startsWith('EXPO_PUBLIC_')) delete env[key];
  }

  const result = spawnSync(
    process.execPath,
    ['scripts/checar-ambiente.mjs', context, '--exigir'],
    {
      env: { ...env, ...valid, ...patch },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, expected, result.stderr);
  count++;

  return result;
}

check({}, 0);

// Nem web nem app nativo precisam de Price IDs públicos do Stripe.
check({}, 0, 'loja');
check({ EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: '' }, 1, 'loja');
check({ EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'sk_secreta' }, 1, 'loja');

for (const url of [
  'http://localhost:8081',
  'https://127.0.0.1',
  'https://192.168.1.3',
  'invalid',
  'https://user:password@poup.com',
  'https://poup.com?token=abc',
]) {
  check({ EXPO_PUBLIC_APP_URL: url }, 1);
}

check(
  { EXPO_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co' },
  1,
);

const privateKey = 'sb_secret_should-never-be-printed';
const result = check({ EXPO_PUBLIC_SUPABASE_ANON_KEY: privateKey }, 1);
assert.equal((result.stdout + result.stderr).includes(privateKey), false);
const jwt = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
check({ EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role') }, 1);
check({ EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }, 0);
const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
assert.equal(eas.build.preview.environment, 'preview');
assert.equal(eas.build.preview.distribution, 'internal');
assert.equal(eas.build.preview.android.buildType, 'apk');
assert.equal(eas.build['preview-simulator'].extends, 'preview');
assert.equal(eas.build['preview-simulator'].ios.simulator, true);
assert.equal(eas.build.production.environment, 'production');
assert.equal(eas.build.production.distribution, 'store');
assert.equal(eas.build.production.android.buildType, 'app-bundle');
for (const profile of ['preview', 'production']) {
  assert.equal(eas.build[profile].env.EXPO_PUBLIC_STORE_BUILD, '1');
  assert.equal(eas.build[profile].ios.image, 'auto');
}
for (const permission of ['READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'RECORD_AUDIO', 'SYSTEM_ALERT_WINDOW']) {
  assert.ok(config.android.blockedPermissions.includes(`android.permission.${permission}`));
}
assert.equal(config.plugins.find(p => Array.isArray(p) && p[0] === 'expo-secure-store')[1].faceIDPermission, false);
assert.equal(readFileSync('src/features/files/pick.ts', 'utf8').includes('requestMediaLibraryPermissionsAsync'), false);
const rewrites = JSON.parse(readFileSync('vercel.json', 'utf8')).rewrites;
assert.ok(rewrites.some(r => r.source === '/simulacao/:token'));
const require = createRequire(import.meta.url);
const project = require('xcode').project('validation-only.pbxproj');
project.hash = { project: { objects: {} } };
assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const metroRequire = createRequire(expoRequire.resolve('@expo/metro-config'));
const postcss = metroRequire('postcss');
assert.equal(postcss.parse('.poup { color: orange }').toString(), '.poup { color: orange }');
console.log(`${count} cenários de ambiente + permissões e rota pública passaram.`);
