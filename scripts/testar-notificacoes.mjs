/**
 * LEMBRETES DA AGENDA NO CELULAR.
 *
 * `npm run testar:notificacoes`
 *
 * No TestFlight, um agendamento criado não avisou nada: o app não tinha
 * notificação nenhuma. Este teste segura as peças que fazem o celular tocar:
 *
 *   1. a conta de QUANDO tocar (`planejar.ts`) — antecedências, o que já
 *      passou, agendamento encerrado, o limite do iPhone;
 *   2. as preferências de Configurações → Notificações;
 *   3. toda gravação na agenda avisa quem remarca os lembretes, e só quando
 *      deu certo;
 *   4. a ligação com o app: a biblioteca, o plugin do build e o layout.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
let passou = 0;
async function teste(nome, fn) {
  await fn();
  passou++;
  console.log(`ok ${nome}`);
}
function carregar(arquivo, mocks = {}) {
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  m.require = (spec) => (spec in mocks ? mocks[spec] : require(spec));
  m._compile(js, arquivo);
  return m.exports;
}

const P = carregar('src/features/notificacoes/planejar.ts');
const A = carregar('src/data/mudancasDaAgenda.ts');

const AGORA = new Date('2026-09-27T12:00:00Z').getTime();
const min = (n) => n * 60_000;
function ag(extra = {}) {
  return {
    id: 'a1',
    title: 'Visita decorado',
    statusId: 'agendado',
    startAt: new Date(AGORA + min(180)).toISOString(),
    leadName: 'Maria',
    developmentName: 'Village das Estrelas',
    location: null,
    ...extra,
  };
}

// ------------------------------------------------------------------ 1. quando
await teste('um lembrete por antecedência, na ordem de tocar', () => {
  const l = P.planejarLembretes([ag()], P.PREFERENCIAS_PADRAO, AGORA);
  assert.deepEqual(l.map((x) => (x.quando - AGORA) / 60_000), [120, 165, 180]);
  assert.deepEqual(l.map((x) => x.chave), ['a1:60', 'a1:15', 'a1:0']);
});
await teste('o texto diz o que é, quando, com quem e onde', () => {
  const [um, , agora] = P.planejarLembretes([ag({ location: 'Rua 1' })], P.PREFERENCIAS_PADRAO, AGORA);
  assert.match(um.titulo, /^Em 1 hora: Visita decorado$/);
  assert.match(um.corpo, /^Às \d\d:\d\d · Maria · Village das Estrelas · Rua 1$/);
  assert.match(agora.titulo, /^Agora: /);
});
await teste('agendamento em 10 minutos: não perde o aviso (toca na hora)', () => {
  const l = P.planejarLembretes([ag({ startAt: new Date(AGORA + min(10)).toISOString() })], P.PREFERENCIAS_PADRAO, AGORA);
  assert.deepEqual(l.map((x) => x.chave), ['a1:0']);
});
await teste('passado, concluído, cancelado e "não compareceu" não tocam', () => {
  const lista = [
    ag({ id: 'p', startAt: new Date(AGORA - min(5)).toISOString() }),
    ag({ id: 'c', statusId: 'concluido' }),
    ag({ id: 'x', statusId: 'cancelado' }),
    ag({ id: 'n', statusId: 'nao_compareceu' }),
    ag({ id: 'ok', statusId: 'confirmado' }),
  ];
  const l = P.planejarLembretes(lista, P.PREFERENCIAS_PADRAO, AGORA);
  assert.deepEqual([...new Set(l.map((x) => x.appointmentId))], ['ok']);
});
await teste('desligado ou sem antecedência: nada', () => {
  assert.equal(P.planejarLembretes([ag()], { ...P.PREFERENCIAS_PADRAO, ativadas: false }, AGORA).length, 0);
  assert.equal(P.planejarLembretes([ag()], { ...P.PREFERENCIAS_PADRAO, antecedencias: [] }, AGORA).length, 0);
});
await teste('limite do iPhone: ficam os mais próximos', () => {
  const muitos = Array.from({ length: 40 }, (_, i) => ag({ id: `a${i}`, startAt: new Date(AGORA + min(120 + i * 60)).toISOString() }));
  const l = P.planejarLembretes(muitos, P.PREFERENCIAS_PADRAO, AGORA);
  assert.equal(l.length, P.LIMITE_DE_LEMBRETES);
  assert.ok(P.LIMITE_DE_LEMBRETES < 64);
  assert.ok(l.every((x, i) => i === 0 || x.quando >= l[i - 1].quando));
  assert.equal(l[0].appointmentId, 'a0');
});
await teste('"1 dia antes" avisa com o horário de amanhã', () => {
  const l = P.planejarLembretes([ag({ startAt: new Date(AGORA + min(2000)).toISOString() })], { ...P.PREFERENCIAS_PADRAO, antecedencias: [1440] }, AGORA);
  assert.match(l[0].titulo, /^Amanhã: /);
  assert.match(l[0].corpo, /^Amanhã às /);
});

// ------------------------------------------------------------ 2. preferências
await teste('preferências: padrão, guardadas e estragadas', () => {
  assert.deepEqual(P.lerPreferencias(null), P.PREFERENCIAS_PADRAO);
  assert.deepEqual(P.lerPreferencias('{isso não é json'), P.PREFERENCIAS_PADRAO);
  const p = P.lerPreferencias(JSON.stringify({ ativadas: false, som: false, antecedencias: [15, 999, 15, 60] }));
  assert.deepEqual(p, { ativadas: false, som: false, antecedencias: [60, 15] });
});

// -------------------------------------------------- 3. a agenda avisa que mudou
await teste('toda gravação que deu certo avisa; a que falhou, não; leitura, nunca', async () => {
  let avisos = 0;
  const parar = A.ouvirMudancasDaAgenda(() => avisos++);
  class Repo {
    constructor() { this.tabela = 'appointments'; }
    async get() { return { tabela: this.tabela }; }
    async listRange() { return []; }
    async create() { return { ok: true, data: {} }; }
    async update() { return { ok: false, error: 'x' }; }
    async setStatus() { return { ok: true, data: undefined }; }
    async reschedule() { return { ok: true, data: undefined }; }
    async remove() { return { ok: true, data: undefined }; }
  }
  const r = A.comAvisoDeMudanca(new Repo());
  assert.deepEqual(await r.get(), { tabela: 'appointments' }, 'os métodos de leitura continuam com o `this` do repositório');
  await r.listRange();
  assert.equal(avisos, 0);
  await r.create(); await r.setStatus(); await r.reschedule(); await r.remove();
  assert.equal(avisos, 4);
  await r.update();
  assert.equal(avisos, 4, 'gravação que falhou não remarca');
  parar();
  await r.create();
  assert.equal(avisos, 4, 'quem parou de ouvir não recebe mais');
});
await teste('um ouvinte com erro não quebra a gravação', async () => {
  const parar = A.ouvirMudancasDaAgenda(() => { throw new Error('boom'); });
  const r = A.comAvisoDeMudanca({ create: async () => ({ ok: true, data: 1 }), update: async () => ({ ok: true }), setStatus: async () => ({ ok: true }), reschedule: async () => ({ ok: true }), remove: async () => ({ ok: true }) });
  assert.deepEqual(await r.create(), { ok: true, data: 1 });
  parar();
});

// -------------------------------------------------------------- 4. a ligação
await teste('o app está ligado: biblioteca, plugin do build, layout, Configurações', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(pkg.dependencies['expo-notifications'], 'expo-notifications instalado');
  const plugins = JSON.parse(readFileSync('app.json', 'utf8')).expo.plugins;
  assert.ok(plugins.some((p) => (Array.isArray(p) ? p[0] : p) === 'expo-notifications'), 'plugin no app.json');
  assert.match(readFileSync('src/data/index.ts', 'utf8'), /appointments: comAvisoDeMudanca\(new SupabaseAppointmentRepository\(\)\)/);
  assert.match(readFileSync('app/(app)/_layout.tsx', 'utf8'), /useLembretesDaAgenda\(/);
  assert.match(readFileSync('app/(app)/configuracoes.tsx', 'utf8'), /<ConfiguracoesDeNotificacao \/>/);
  const l = readFileSync('src/features/notificacoes/lembretes.ts', 'utf8');
  assert.match(l, /sound: prefs\.som \? 'default' : false/);
  assert.match(l, /AndroidImportance\.MAX/);
});

await teste('na web o app não quebra: nada da biblioteca roda fora do celular', () => {
  // `useLastNotificationResponse` chama uma função que não existe na web e
  // derrubava todas as telas do app logado (pego no teste de ponta a ponta).
  const h = readFileSync('src/features/notificacoes/useLembretesDaAgenda.ts', 'utf8');
  assert.doesNotMatch(h, /useLastNotificationResponse/);
  const efeitos = h.split('useEffect(() => {').slice(1);
  assert.equal(efeitos.length, 2);
  for (const e of efeitos) assert.match(e.trimStart(), /^if \(!LEMBRETES_DISPONIVEIS \|\| !userId\) return;/);
  const l = readFileSync('src/features/notificacoes/lembretes.ts', 'utf8');
  for (const fn of ['configurarNotificacoes', 'lerPermissao', 'pedirPermissao', 'sincronizarAgora']) {
    const corpo = l.split(`function ${fn}(`)[1].split('\n}\n')[0];
    assert.match(corpo, /if \(!LEMBRETES_DISPONIVEIS/, `${fn} precisa sair cedo na web`);
  }
});

console.log(`\n${passou} verificações de notificações passaram.`);
