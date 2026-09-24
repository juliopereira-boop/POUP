/**
 * GERA O ARQUIVO NO MODELO POUP A PARTIR DO TEXTO DE UMA TABELA.
 *
 *   node scripts/gerar-modelo-tabela.mjs <texto.txt> "<Empreendimento>" [saida.csv]
 *
 * O texto é o que sai do PDF da construtora (o mesmo que a Edge Function
 * `ler-tabela-preco` devolve). A leitura é a do aplicativo
 * (`src/features/tabelaPreco/importar.ts`), então o arquivo gerado é
 * exatamente o que o aplicativo teria entendido — só que agora num formato que
 * o corretor pode abrir no Excel, conferir e enviar.
 *
 * Para tabelas em outro formato, o caminho é montar o CSV direto no modelo
 * (ver o cabeçalho de `src/features/tabelaPreco/modelo.ts`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const RAIZ = process.cwd();
const cache = new Map();
function carregar(relativo) {
  const arquivo = path.join(RAIZ, relativo);
  if (cache.has(arquivo)) return cache.get(arquivo);
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  cache.set(arquivo, m.exports);
  m.require = (spec) => {
    if (spec === '../unidades/gerador') return carregar('src/features/unidades/gerador.ts');
    if (spec === './chaves') return carregar('src/features/tabelaPreco/chaves.ts');
    if (spec === './preco') return carregar('src/features/tabelaPreco/preco.ts');
    if (spec === './importar') return carregar('src/features/tabelaPreco/importar.ts');
    return require(spec);
  };
  m._compile(js, arquivo);
  cache.set(arquivo, m.exports);
  return m.exports;
}

const [entrada, empreendimento, saidaInformada] = process.argv.slice(2);
if (!entrada || !empreendimento) {
  console.error('uso: node scripts/gerar-modelo-tabela.mjs <texto.txt> "<Empreendimento>" [saida.csv]');
  process.exit(1);
}
const I = carregar('src/features/tabelaPreco/importar.ts');
const MOD = carregar('src/features/tabelaPreco/modelo.ts');

const leitura = I.lerTextoDaTabela(readFileSync(entrada, 'utf8'));
const csv = MOD.gerarModelo(leitura, empreendimento);
const saida = saidaInformada ?? MOD.nomeDoArquivoDoModelo(empreendimento, leitura.referencia ?? '');
writeFileSync(saida, csv, 'utf8');

console.log(`${saida}`);
console.log(`  referência: ${leitura.referencia ?? '(não encontrada)'}`);
console.log(`  linhas de preço: ${leitura.regras.length}`);
console.log(`  lista de vagas: ${leitura.vagas ? `${leitura.vagas.unidades.length} unidades com vaga de ${leitura.vagas.vagaDaLista}` : '(nenhuma)'}`);
if (leitura.avisos.length) console.log(`  avisos:\n    ${leitura.avisos.join('\n    ')}`);
