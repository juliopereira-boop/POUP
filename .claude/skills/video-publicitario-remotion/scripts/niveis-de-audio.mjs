/**
 * Volume (RMS em dB) de trechos do vídeo renderizado, por quadro.
 *
 *   node niveis-de-audio.mjs <video.mp4> 0-75:hook 330-345:silencio 345-352:drop
 *
 * Usa o ffmpeg que vem com o Remotion (node_modules/@remotion/compositor-*).
 * Referência: silêncio antes do drop < -30 dB; drop > -10 dB; trilha ~ -16 dB.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [video, ...trechos] = process.argv.slice(2);
const pasta = ['compositor-linux-x64-gnu', 'compositor-linux-x64-musl', 'compositor-darwin-arm64', 'compositor-darwin-x64']
  .map((p) => path.join(process.cwd(), 'node_modules', '@remotion', p))
  .find((p) => existsSync(path.join(p, 'ffmpeg')));
if (!pasta) throw new Error('ffmpeg do Remotion não encontrado: rode dentro do projeto do vídeo');
const wav = path.join(tmpdir(), `niveis-${Date.now()}.wav`);
execFileSync(path.join(pasta, 'ffmpeg'), ['-y', '-loglevel', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '44100', '-f', 'wav', wav], {
  env: { ...process.env, LD_LIBRARY_PATH: pasta },
});
const b = readFileSync(wav);
const d = b.indexOf('data') + 8;
const n = (b.length - d) / 2;
const FPS = Number(process.env.FPS || 30);
for (const t of trechos) {
  const [faixa, rotulo = ''] = t.split(':');
  const [q0, q1] = faixa.split('-').map(Number);
  let s = 0;
  let c = 0;
  for (let i = Math.floor((q0 / FPS) * 44100); i < Math.floor((q1 / FPS) * 44100) && i < n; i++) {
    const v = b.readInt16LE(d + i * 2) / 32768;
    s += v * v;
    c++;
  }
  console.log(`${rotulo.padEnd(14)} ${faixa.padEnd(11)} ${(20 * Math.log10(Math.sqrt(s / Math.max(1, c)) + 1e-9)).toFixed(1)} dB`);
}
