/**
 * NENHUM TEXTO COM A FONTE MAIOR QUE A LINHA.
 *
 * Os estilos do app partem de `typography.*` (que traz fonte E altura de
 * linha) e às vezes aumentam só a fonte: `{ ...typography.title, fontSize: 34 }`.
 * A altura de linha continua a do título (28), menor que a letra, e o iPhone
 * corta o topo dos números — foi o que aconteceu com o "TOTAL A RECEBER" da
 * Comissão. Este teste varre as telas e recusa qualquer estilo que aumente a
 * fonte além da altura de linha herdada sem informar uma `lineHeight` nova.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const RAIZ = process.cwd();
const tema = readFileSync(path.join(RAIZ, 'src/theme/index.ts'), 'utf8');
const LINHA = {};
for (const m of tema.matchAll(/(\w+):\s*\{\s*fontSize:\s*\d+[^}]*lineHeight:\s*(\d+)/g)) LINHA[m[1]] = Number(m[2]);
if (!LINHA.title || !LINHA.caption) {
  console.error('Não foi possível ler typography em src/theme/index.ts.');
  process.exit(1);
}

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : arquivos(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

const problemas = [];
let conferidos = 0;
for (const arquivo of [...arquivos(path.join(RAIZ, 'app')), ...arquivos(path.join(RAIZ, 'src'))]) {
  const s = readFileSync(arquivo, 'utf8');
  for (const m of s.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
    const corpo = m[2];
    const base = /\.\.\.typography\.(\w+)/.exec(corpo)?.[1];
    const fonte = /fontSize:\s*([\d.]+)/.exec(corpo)?.[1];
    if (!base || !fonte || !LINHA[base]) continue;
    conferidos++;
    if (/lineHeight\s*:/.test(corpo)) continue;
    if (Number(fonte) > LINHA[base]) {
      const linha = s.slice(0, m.index).split('\n').length;
      problemas.push(`${path.relative(RAIZ, arquivo)}:${linha} ${m[1]}: fonte ${fonte} com a linha ${LINHA[base]} de typography.${base}`);
    }
  }
}

if (problemas.length) {
  console.error('Texto com a fonte maior que a linha (o iPhone corta o topo). Informe lineHeight:');
  for (const p of problemas) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`tipografia: ${conferidos} estilos com fonte ajustada conferidos, nenhum com a fonte maior que a linha.`);
