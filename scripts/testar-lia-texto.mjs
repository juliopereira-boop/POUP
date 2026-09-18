// Exercita o provider real com hooks e rede controlados; não acessa produção.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('src/features/lia/LiaProvider.tsx', 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
let slots = [],
  cursor = 0,
  effects = [],
  pending = [],
  context;
let consent = true,
  listener,
  user = { id: 'owner' },
  requests = [],
  writes = [];
let extract = async () => ({
  campos: [{ chave: 'renda', valor: '3000', trecho: 'renda 3000', confianca: 'alta' }],
  remover: [],
  observacao: null,
});
const react = {
  createContext: () => ({ Provider: 'provider' }),
  useContext: () => context,
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [
      slots[i],
      (value) => {
        slots[i] = typeof value === 'function' ? value(slots[i]) : value;
      },
    ];
  },
  useRef(initial) {
    const i = cursor++;
    return (slots[i] ??= { current: initial });
  },
  useCallback(fn, deps) {
    const i = cursor++;
    const old = slots[i];
    if (!old || deps.some((d, j) => d !== old.deps[j])) slots[i] = { deps, fn };
    return slots[i].fn;
  },
  useMemo: (fn) => fn(),
  useEffect(fn, deps) {
    const i = cursor++;
    const old = effects[i];
    if (!old || deps.some((d, j) => d !== old.deps[j])) {
      pending.push(() => {
        old?.cleanup?.();
        effects[i] = { deps, cleanup: fn() };
      });
    }
  },
};
const exports = {};
vm.runInNewContext(source, {
  exports,
  console,
  Date,
  require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime')
      return {
        jsx: (_, props) => {
          context = props.value;
        },
      };
    if (name.includes('AuthProvider')) return { useAuth: () => ({ user }) };
    if (name === '@/data')
      return {
        db: {
          companies: { list: async () => [], listCorrespondents: async () => [] },
          developments: { list: async () => [] },
        },
      };
    if (name === '@/lib/storage')
      return { sessionStorage: { setItem: async (...args) => writes.push(args) } };
    if (name.includes('SimuladorProvider')) return { PREFILL_KEY: 'prefill' };
    if (name === './campos')
      return {
        CAMPOS_POR_CHAVE: { renda: { tipo: 'numero' } },
        CHAVES_ESSENCIAIS: ['renda'],
        exibirValor: (_, v) => v,
        paraSimulador: (v) => v,
      };
    if (name === './catalogo') return { resolverDoCatalogo: () => ({}) };
    if (name === './extrair')
      return {
        extrair: async (p) => {
          requests.push(p);
          return extract(p);
        },
      };
    if (name === './consentimento')
      return {
        temConsentimentoLia: async () => consent,
        aoRevogarConsentimentoLia: (fn) => {
          listener = fn;
          return () => {};
        },
      };
    throw Error(name);
  },
});
function render() {
  cursor = 0;
  exports.LiaProvider({ children: null });
  const jobs = pending;
  pending = [];
  jobs.forEach((fn) => fn());
}
render();
render();
assert.equal(await context.enviarTexto('  '), false);
assert.equal(requests.length, 0);
consent = false;
assert.equal(await context.enviarTexto('renda 3000'), false);
assert.equal(requests.length, 0);
consent = true;
assert.equal(await context.enviarTexto('renda 3000'), true);
render();
assert.equal(context.capturados.renda.valor, '3000');
assert.equal(requests[0].agora, 'renda 3000');
assert.equal(requests[0].modo, 'final');
extract = async () => ({
  campos: [{ chave: 'renda', valor: '4000', trecho: 'corrigir', confianca: 'alta' }],
  remover: [],
  observacao: null,
});
await context.enviarTexto('corrigir renda para 4000');
render();
assert.equal(requests[1].estado.renda, '3000');
assert.equal(context.capturados.renda.valor, '4000');
assert.equal(context.capturados.renda.corrigido, true);
context.descartar('renda');
render();
assert.equal(Object.keys(context.capturados).length, 0);
await context.enviarTexto('renda 4000');
render();
const before = requests.length;
assert.equal(await context.levarParaSimulador(), true);
assert.equal(requests.length, before, 'transferir não chama IA novamente');
assert.equal(JSON.parse(writes[0][1]).estado.renda, '4000');
render();
assert.equal(Object.keys(context.capturados).length, 0);

let release;
extract = () =>
  new Promise((resolve) => {
    release = resolve;
  });
const response = {
  campos: [{ chave: 'renda', valor: '9000', trecho: 'teste', confianca: 'alta' }],
  remover: [],
  observacao: null,
};
const inflight = context.enviarTexto('renda 9000');
while (!release) await new Promise((resolve) => setImmediate(resolve));
assert.equal(await context.enviarTexto('duplo clique'), false);
context.encerrar();
release(response);
assert.equal(await inflight, false);
render();
assert.equal(Object.keys(context.capturados).length, 0);
release = null;
const revoked = context.enviarTexto('renda 9000');
while (!release) await new Promise((resolve) => setImmediate(resolve));
consent = false;
listener();
release(response);
assert.equal(await revoked, false);
render();
assert.equal(Object.keys(context.capturados).length, 0);
consent = true;
extract = async () => {
  throw Error('offline');
};
assert.equal(await context.enviarTexto('teste'), false);
render();
assert.equal(context.status, 'erro');
user = { id: 'other' };
render();
render();
assert.equal(context.erro, null);

for (const dir of ['src/features/lia', 'src/components/lia']) {
  for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
    assert.doesNotMatch(
      readFileSync(dir + '/' + file, 'utf8'),
      /getUserMedia|webkitSpeechRecognition|SpeechRecognition|criarEscuta/,
    );
  }
}
for (const file of ['LiaPainel', 'LiaAgendaChat', 'LiaMaterialChat']) {
  assert.match(readFileSync('src/components/lia/' + file + '.tsx', 'utf8'), /<TextInput/);
}
console.log(
  'LIA texto: envio, correção, descarte, transferência, consentimento, concorrência, encerramento e ausência de captura de áudio passaram.',
);
