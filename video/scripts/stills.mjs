/**
 * Stills para conferir o vídeo sem renderizar tudo.
 * `npm run stills -- 340 345 348 355` (sem números: os quadros-chave).
 */
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const quadros = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const lista = quadros.length ? quadros : [40, 150, 262, 340, 345, 348, 355, 380, 440, 470, 490, 508, 525, 545, 570, 592, 606, 616, 632, 660, 676, 730, 762, 776, 792, 815, 838, 868, 886, 920, 948, 966, 1012, 1040, 1062, 1090, 1150, 1250, 1345];
const saida = path.join(process.cwd(), 'out', 'stills');
mkdirSync(saida, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(process.cwd(), 'src', 'index.ts') });
const browserExecutable = process.env.POUP_BROWSER ?? null;
const composition = await selectComposition({ serveUrl, id: 'PoupAnuncio', browserExecutable });
for (const frame of lista) {
  const output = path.join(saida, `q${String(frame).padStart(3, '0')}.png`);
  await renderStill({ composition, serveUrl, frame, output, browserExecutable, scale: 0.5 });
  console.log(output);
}
