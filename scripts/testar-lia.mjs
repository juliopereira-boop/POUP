/**
 * TESTES DA LIA — a parte que é lógica pura.
 *
 * `npm run testar:lia`
 *
 * ===========================================================================
 * O QUE ENTRA AQUI, E O QUE NÃO ENTRA
 * ===========================================================================
 * Só o que roda sem rede e sem modelo: o casamento de nome por voz
 * (`materialPorVoz.ts`, `catalogo.ts`) e o gatilho local do agendamento
 * (`agendamento.ts`). A extração de campos e a extração de agendamento em si
 * dependem da Anthropic API — isso é smoke-testado manualmente, não aqui.
 *
 * Mesma técnica de `testar-financiamento.mjs`: os `.ts` são transpilados na
 * hora pelo TypeScript que já está em `node_modules`, sem passo de build.
 * `@/lib/supabase` é trocado por um toco — os módulos testados não chamam a
 * rede na hora de importar, só dentro de funções async que este arquivo nunca
 * invoca.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const RAIZ = path.join(process.cwd(), 'src/features/lia');

const SUPABASE_TOCO = {
  supabase: {
    functions: { invoke: async () => ({ data: null, error: new Error('não usado nos testes') }) },
  },
};

/**
 * `agendamento.ts` importa a camada de dados para CRIAR o compromisso. Nada do
 * que este arquivo testa chega lá — `pareceAgendamento` e o casamento de nome
 * são puros —, mas o import precisa resolver na hora de compilar o módulo.
 */
const DB_TOCO = {
  db: { appointments: { create: async () => ({ ok: false, error: 'não usado nos testes' }) } },
};

const cache = new Map();
function compilar(arquivo, resolverImport) {
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  m.require = resolverImport;
  m._compile(js, arquivo);
  return m.exports;
}

/** `campos.ts` (puxado por `extrair.ts`) usa `@/lib/masks`. Vai real, não mockado. */
const masks = compilar(path.join(process.cwd(), 'src/lib/masks.ts'), require);

/** `localISO` — puro, sem imports. Vai real: é ele que monta a data do compromisso. */
const datas = compilar(path.join(process.cwd(), 'src/features/agenda/dates.ts'), require);

/**
 * `mensagemDoErro` — puro. Vai real porque é ele que decide a frase de erro que
 * o corretor lê. Testado em `testar-limites.mjs`, que é onde moram as regras de
 * limite; aqui ele só precisa resolver o import.
 */
const edgeError = compilar(path.join(process.cwd(), 'src/lib/edgeError.ts'), require);

function carregar(nome) {
  if (cache.has(nome)) return cache.get(nome);
  const arquivo = path.join(RAIZ, `${nome}.ts`);
  cache.set(nome, {});
  const exports = compilar(arquivo, (spec) => {
    if (spec.startsWith('./')) return carregar(spec.slice(2));
    if (spec === '@/lib/supabase') return SUPABASE_TOCO;
    if (spec === '@/lib/masks') return masks;
    if (spec === '@/data') return DB_TOCO;
    if (spec === '@/features/agenda/dates') return datas;
    if (spec === '@/lib/edgeError') return edgeError;
    return require(spec);
  });
  cache.set(nome, exports);
  return exports;
}

const MPV = carregar('materialPorVoz');
const CAT = carregar('catalogo');
const AG = carregar('agendamento');

let ok = 0;
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  if (condicao) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}
function secao(t) {
  console.log(`\n${t}`);
}

/* ===========================================================================
 * GATILHO DO AGENDAMENTO — pareceAgendamento
 * ======================================================================= */
{
  secao('GATILHO — pareceAgendamento');

  checar('"agenda pro dia 25 às 10" dispara', AG.pareceAgendamento('agenda pro dia 25 as 10 horas'));
  checar('"pode agendar uma visita" dispara', AG.pareceAgendamento('pode agendar uma visita amanha'));
  checar('"agendado" sozinho dispara', AG.pareceAgendamento('ja ta agendado'));
  checar(
    '"marca" com hora dispara',
    AG.pareceAgendamento('marca pra sexta as 15 horas apresentar a aurora'),
  );
  checar('"marque" com data dispara', AG.pareceAgendamento('marque para o dia 10'));

  checar('"marca" sozinho, sem pista de tempo, NÃO dispara', !AG.pareceAgendamento('essa e a marca do carro dela'));
  checar('conversa comum não dispara', !AG.pareceAgendamento('e ai como vai a familia tudo bem'));
  checar('falar de preço não dispara', !AG.pareceAgendamento('duzentos e dez mil reais o apartamento'));
  checar('frase vazia não dispara', !AG.pareceAgendamento(''));
  checar('só espaço não dispara', !AG.pareceAgendamento('   '));

  // Acentuação e maiúsculas não podem mudar o resultado — é voz transcrita.
  checar('funciona com acento e maiúscula', AG.pareceAgendamento('AGENDA para AMANHÃ às 9h'));
}

/* ===========================================================================
 * CASAMENTO POR VOZ — a base de tudo que resolve nome falado
 * ======================================================================= */
{
  secao('CASAMENTO POR VOZ — reaproveitado pelo agendamento');

  const leads = [
    { id: 'lead-1', nome: 'Maria da Silva' },
    { id: 'lead-2', nome: 'João Souza' },
    { id: 'lead-3', nome: 'Mariana Costa' },
  ];

  checar('nome exato casa', CAT.resolverDoCatalogo('João Souza', leads).id === 'lead-2');
  checar('nome parcial claro casa', CAT.resolverDoCatalogo('Silva', leads).id === 'lead-1');
  checar(
    '"Maria" sozinho é ambíguo (Maria da Silva vs Mariana) e não chuta',
    CAT.resolverDoCatalogo('Maria', leads).id === null,
  );
  checar('nome que não existe não casa', CAT.resolverDoCatalogo('Pedro Alves', leads).id === null);
  checar('lista vazia nunca chuta', CAT.resolverDoCatalogo('Maria', []).id === null);
  checar('texto vazio não casa nem avisa', CAT.resolverDoCatalogo('', leads).id === null);

  const emps = [{ id: 'dev-1', nome: 'Residencial Aurora' }, { id: 'dev-2', nome: 'Parque das Águas' }];
  checar('"a aurora" casa por palavra em comum', CAT.resolverDoCatalogo('a aurora', emps).id === 'dev-1');
  checar('erro de transcrição próximo ainda casa', CAT.resolverDoCatalogo('aurora', emps).id === 'dev-1');
  checar(
    '"parque aguas" sem acento casa com "Parque das Águas"',
    CAT.resolverDoCatalogo('parque aguas', emps).id === 'dev-2',
  );
}

console.log(`\n${ok} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.log(`  FALHOU: ${f}`);
process.exit(falhas.length ? 1 : 0);
