/**
 * Stills para conferir o vídeo sem renderizar tudo.
 * `npm run stills -- 340 345 348 355` (sem números: os quadros-chave).
 */
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const quadros = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const lista = quadros.length ? quadros : [40, 90, 120, 150, 180, 210, 240, 262, 292, 315, 340, 345, 348, 355, 364, 395, 430, 450, 480, 505, 530, 580, 600, 612, 640, 690, 745, 770, 800, 850, 895];
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
