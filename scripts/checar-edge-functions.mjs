/**
 * Checagem de sintaxe das Edge Functions.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * `tsconfig.json` **exclui** `supabase/functions` — e com razão: aquele código
 * é Deno, importa por URL e não compila contra as libs do aplicativo. O efeito
 * colateral é que `npx tsc --noEmit` passa verde com uma Edge Function
 * sintaticamente quebrada dentro do repositório.
 *
 * Foi exatamente o que aconteceu: uma crase dentro de um template literal
 * (`` `data` `` no meio do prompt da LIA) **fechou a string no meio**. O
 * arquivo virou lixo sintático, `tsc` não reclamou porque nem olhou, o lint não
 * reclamou porque também não olha, e o build da web passou porque a função nem
 * entra no bundle. O erro só apareceria na hora de publicar — ou pior, num
 * deploy que falha em silêncio e deixa a versão velha no ar.
 *
 * Esta checagem usa o próprio parser do TypeScript, sem verificar tipos: ela
 * não sabe nada de Deno e não precisa saber. Ela responde uma pergunta só, que
 * é a que faltava: **este arquivo é um TypeScript válido?**
 *
 * Uso: `npm run checar:funcoes`
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const RAIZ = 'supabase/functions';

if (!existsSync(RAIZ)) {
  console.log('Sem supabase/functions — nada a checar.');
  process.exit(0);
}

const pastas = readdirSync(RAIZ, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

/*
 * Cada função é `<pasta>/index.ts`. Pastas com `_` na frente são a exceção: o
 * Supabase não as publica como função, seriam código compartilhado importado
 * pelas outras.
 *
 * Hoje não existe nenhuma, e é deliberado — o deploy deste projeto é feito
 * colando o `index.ts` no Dashboard, que envia UM arquivo só, e qualquer import
 * relativo para fora da pasta falha no bundler do lado de lá com
 * `Module not found`. Ver o bloco de cota duplicado em `scan-document`.
 *
 * O suporte fica porque, no dia em que a publicação passar para a CLI
 * (`supabase functions deploy`), o compartilhado volta a valer — e um erro de
 * sintaxe nele quebraria todas as funções que importam, o que é pior do que
 * quebrar uma.
 */
const arquivos = pastas
  .flatMap((nome) =>
    nome.startsWith('_')
      ? readdirSync(join(RAIZ, nome))
          .filter((f) => f.endsWith('.ts'))
          .map((f) => join(RAIZ, nome, f))
      : [join(RAIZ, nome, 'index.ts')],
  )
  .filter((p) => existsSync(p));

let falhas = 0;

for (const caminho of arquivos) {
  const fonte = readFileSync(caminho, 'utf8');
  const sf = ts.createSourceFile(caminho, fonte, ts.ScriptTarget.ES2022, true);
  // `parseDiagnostics` não é público, mas é o único jeito de ler os erros de
  // sintaxe sem montar um Program inteiro (que exigiria resolver os imports
  // por URL do Deno, justamente o que não queremos).
  const erros = sf.parseDiagnostics ?? [];

  if (erros.length === 0) {
    console.log(`ok    ${caminho}`);
    continue;
  }

  falhas += 1;
  console.error(`ERRO  ${caminho}`);
  for (const d of erros.slice(0, 5)) {
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
    const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    console.error(`        linha ${line + 1}, coluna ${character + 1}: ${msg}`);
  }
}

if (falhas > 0) {
  console.error(`\n${falhas} Edge Function com erro de sintaxe. Não publique assim.`);
  process.exit(1);
}

console.log(`\n${arquivos.length} arquivos de Edge Function, todos com sintaxe válida.`);
