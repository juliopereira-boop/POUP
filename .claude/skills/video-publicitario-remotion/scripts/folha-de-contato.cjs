/**
 * Folha de contato: junta stills (q###.png) numa grade 4×N com o número do
 * quadro, para revisar o vídeo de uma olhada.
 *
 *   NODE_PATH=<node_modules do playwright> node folha-de-contato.cjs <pasta> <saida.png> 340 345 348 355
 *
 * Por que não ffmpeg: o ffmpeg que vem com o Remotion é mínimo (sem drawtext
 * e sem xstack). O Chromium faz a grade com HTML. As imagens precisam ser
 * abertas com page.goto(file://...) — setContent (about:blank) bloqueia file://.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const [dir, nome, ...quadros] = process.argv.slice(2);
const chrome = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
(async () => {
  const b = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const html = `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(4,270px);gap:4px;font:bold 20px sans-serif;color:#ff0">${quadros
    .map((q) => `<div style="position:relative"><img src="q${q.padStart(3, '0')}.png" style="width:270px;height:480px;display:block"><span style="position:absolute;top:4px;left:6px;background:#000">${q}</span></div>`)
    .join('')}</body>`;
  const arquivo = path.join(dir, '_folha.html');
  fs.writeFileSync(arquivo, html);
  await p.goto('file://' + arquivo);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(dir, nome), fullPage: true });
  await b.close();
})();
