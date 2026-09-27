/**
 * TRILHA E EFEITOS DO VÍDEO — sintetizados aqui, sem banco de áudio.
 *
 * `npm run audio` → `public/audio/*.wav` (44,1 kHz, 16 bits).
 *
 * Tudo a 120 BPM: uma batida = 0,5 s = 15 quadros a 30 fps. É isso que faz os
 * cortes de 30 e de 15 quadros da montagem caírem no tempo, e o pulso do botão
 * do CTA bater junto com o bumbo.
 *
 *   trilha-tensa.wav — do quadro 75 ao 304: drone grave, bumbo abafado, relógio;
 *                      acelera no fim (bumbo a cada meia batida).
 *   trilha-drop.wav  — do quadro 345 ao 900: bumbo 4/4, palmas, baixo pulsando,
 *                      acordes brilhantes, arpejo; acaba num acorde com cauda.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SR = 44100;
const OUT = path.join(process.cwd(), 'public', 'audio');
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------ utilitários
let semente = 12345;
const ruido = () => {
  semente = (semente * 1664525 + 1013904223) >>> 0;
  return semente / 2147483648 - 1;
};
const buf = (seg) => new Float32Array(Math.ceil(seg * SR));
const hz = (nota) => 440 * 2 ** ((nota - 69) / 12); // MIDI → Hz
const TAU = Math.PI * 2;

function misturar(dest, fonte, inicioSeg, ganho = 1) {
  const o = Math.round(inicioSeg * SR);
  for (let i = 0; i < fonte.length && o + i < dest.length; i++) if (o + i >= 0) dest[o + i] += fonte[i] * ganho;
}
function passaBaixa(x, corte) {
  const y = new Float32Array(x.length);
  let a = 0;
  for (let i = 0; i < x.length; i++) {
    const c = typeof corte === 'function' ? corte(i / SR) : corte;
    const k = 1 - Math.exp((-TAU * c) / SR);
    a += k * (x[i] - a);
    y[i] = a;
  }
  return y;
}
function passaAlta(x, corte) {
  const baixa = passaBaixa(x, corte);
  return x.map((v, i) => v - baixa[i]);
}
function normalizar(x, pico = 0.89) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m > 0 ? x.map((v) => (v / m) * pico) : x;
}
function saturar(x, drive = 1.5) {
  return x.map((v) => Math.tanh(v * drive));
}
/** Eco simples (dá corpo e "sala" sem reverb de verdade). */
function eco(x, atrasoSeg, retorno, vezes = 4) {
  const y = Float32Array.from(x);
  const d = Math.round(atrasoSeg * SR);
  for (let n = 1; n <= vezes; n++) for (let i = 0; i + n * d < y.length; i++) y[i + n * d] += x[i] * retorno ** n;
  return y;
}
function salvar(nome, x) {
  const dados = normalizar(x);
  const b = Buffer.alloc(44 + dados.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + dados.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(dados.length * 2, 40);
  for (let i = 0; i < dados.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, dados[i])) * 32767), 44 + i * 2);
  writeFileSync(path.join(OUT, nome), b);
  console.log(`${nome.padEnd(22)} ${(dados.length / SR).toFixed(2)} s`);
}

// ---------------------------------------------------------- instrumentos
function bumbo(seg = 0.45, f0 = 150, f1 = 45, clique = 0.4) {
  const x = buf(seg);
  let fase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t * 28);
    fase += (TAU * f) / SR;
    x[i] = Math.sin(fase) * Math.exp(-t * 7) + (t < 0.004 ? ruido() * clique : 0);
  }
  return saturar(x, 1.8);
}
function palma() {
  const x = buf(0.25);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const rajadas = [0, 0.01, 0.02].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) * 60) : 0), 0);
    x[i] = ruido() * (rajadas * 0.4 + Math.exp(-t * 18) * 0.5);
  }
  return passaAlta(passaBaixa(x, 5000), 900);
}
function chimbal(seg = 0.05, aberto = false) {
  const x = buf(aberto ? 0.22 : seg);
  for (let i = 0; i < x.length; i++) x[i] = ruido() * Math.exp(-(i / SR) * (aberto ? 14 : 70));
  return passaAlta(x, 7000);
}
/** Nota de "serra" com envelope e filtro (baixo, acorde, arpejo). */
function serra(freq, seg, { ataque = 0.005, queda = 4, corte = 2500, detune = 0.004, vozes = 2 } = {}) {
  const x = buf(seg);
  for (let v = 0; v < vozes; v++) {
    const f = freq * (1 + (v - (vozes - 1) / 2) * detune);
    let fase = (ruido() + 1) / 2;
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      fase = (fase + f / SR) % 1;
      const env = Math.min(1, t / ataque) * Math.exp(-t * queda);
      x[i] += (fase * 2 - 1) * env / vozes;
    }
  }
  return passaBaixa(x, corte);
}
function seno(freq, seg, queda = 6, ataque = 0.002) {
  const x = buf(seg);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = Math.sin(TAU * freq * t) * Math.min(1, t / ataque) * Math.exp(-t * queda);
  }
  return x;
}

/** Piano elétrico (FM suave): quente, sem o brilho de serra. */
function epiano(freq, seg, queda = 1.8) {
  const x = buf(seg);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const indice = 1.6 * Math.exp(-t * 7) + 0.25;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * queda);
    x[i] =
      (Math.sin(TAU * freq * t + indice * Math.sin(TAU * freq * t)) * 0.8 +
        Math.sin(TAU * freq * 2.002 * t) * 0.12 * Math.exp(-t * 4)) *
      env;
  }
  return passaBaixa(x, 3200);
}
/** Pad: serras desafinadas, bem filtradas, ataque lento — o "ar" da trilha. */
function pad(notas, seg, corte = 900) {
  const x = buf(seg);
  for (const n of notas) misturar(x, serra(hz(n), seg, { ataque: 0.5, queda: 0.25, corte: 20000, vozes: 3, detune: 0.008 }), 0, 0.25);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] *= Math.min(1, (seg - t) / 0.3);
  }
  return passaBaixa(passaBaixa(x, corte), corte * 1.4);
}
/** Sub grave (seno + um pouco de 2º harmônico, levemente saturado). */
function sub(freq, seg) {
  const x = buf(seg);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.006) * Math.min(1, (seg - t) / 0.03);
    x[i] = (Math.sin(TAU * freq * t) + 0.25 * Math.sin(TAU * freq * 2 * t)) * env;
  }
  return saturar(x, 1.3);
}
/** Pluck suave para a melodia (triângulo com filtro fechando). */
function pluck(freq, seg = 0.45) {
  const x = buf(seg);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const fase = (freq * t) % 1;
    x[i] = (4 * Math.abs(fase - 0.5) - 1) * Math.min(1, t / 0.003) * Math.exp(-t * 7);
  }
  return passaBaixa(x, (t) => 600 + 3500 * Math.exp(-t * 10));
}
function caixa() {
  const x = buf(0.3);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = Math.sin(TAU * 185 * t) * Math.exp(-t * 30) * 0.6 + ruido() * Math.exp(-t * 16) * 0.7;
  }
  return passaAlta(passaBaixa(x, 7000), 150);
}
function palmaSeca() {
  const x = buf(0.22);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const rajadas = [0, 0.008, 0.017].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) * 90) : 0), 0);
    x[i] = ruido() * (rajadas * 0.5 + Math.exp(-t * 24) * 0.35);
  }
  return passaAlta(passaBaixa(x, 4200), 1100);
}
function prato(seg = 2.2) {
  const x = buf(seg);
  for (let i = 0; i < x.length; i++) x[i] = ruido() * Math.exp(-(i / SR) * 2.2);
  return passaAlta(x, 6000);
}
/** Reverb de Schroeder (4 pentes + 2 passa-tudo): dá sala sem banco de sons. */
function reverb(x, mistura = 0.25, tempo = 0.78) {
  const molhado = new Float32Array(x.length);
  for (const [d, g] of [[1557, tempo], [1617, tempo - 0.02], [1491, tempo + 0.01], [1422, tempo - 0.03]]) {
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = x[i] + (i >= d ? g * y[i - d] : 0);
    for (let i = 0; i < x.length; i++) molhado[i] += y[i] * 0.25;
  }
  let z = molhado;
  for (const d of [225, 556]) {
    const y = new Float32Array(z.length);
    for (let i = 0; i < z.length; i++) y[i] = -0.5 * z[i] + (i >= d ? z[i - d] + 0.5 * y[i - d] : 0);
    z = y;
  }
  const escuro = passaBaixa(z, 5000);
  return x.map((v, i) => v * (1 - mistura) + escuro[i] * mistura);
}

// ============================================================ EFEITOS
function tick() {
  const x = buf(0.06);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = (Math.sin(TAU * 2600 * t) * 0.6 + ruido() * 0.4) * Math.exp(-t * 180);
  }
  return passaAlta(x, 1200);
}
function papel() {
  const x = buf(0.32);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const crepita = ruido() > 0.96 ? 1 : 0.25;
    x[i] = ruido() * crepita * Math.exp(-t * 9) * (0.6 + 0.4 * Math.sin(TAU * 23 * t));
  }
  return passaBaixa(passaAlta(x, 1500), 6500);
}
function tecla() {
  const x = buf(0.05);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = (Math.sin(TAU * 1800 * t) * 0.5 + ruido() * 0.5) * Math.exp(-t * 140);
  }
  return passaAlta(x, 600);
}
function notificacao() {
  const x = buf(0.45);
  misturar(x, seno(988, 0.3, 14), 0, 0.8);
  misturar(x, seno(1319, 0.35, 11), 0.085, 0.9);
  misturar(x, seno(2638, 0.2, 25), 0.085, 0.15);
  return x;
}
function riser(seg = 1.5) {
  const x = buf(seg);
  let fase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const p = t / seg;
    fase += (TAU * (180 + 1800 * p * p)) / SR;
    x[i] = (ruido() * 0.55 + Math.sin(fase) * 0.45) * p ** 2.2;
  }
  return passaAlta(passaBaixa(x, (t) => 400 + 9000 * (t / seg) ** 2), 150);
}
function reverso(seg = 0.9) {
  const x = buf(seg);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = ruido() * (t / seg) ** 3;
  }
  return passaAlta(x, 3500);
}
function impacto(seg = 2.2, peso = 1) {
  const x = buf(seg);
  let fase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    fase += (TAU * (32 + 90 * Math.exp(-t * 9))) / SR;
    x[i] = Math.sin(fase) * Math.exp(-t * (2.2 / peso)) + ruido() * Math.exp(-t * 20) * 0.5;
  }
  return eco(saturar(x, 2.4), 0.11, 0.3, 5);
}
function whoosh(seg = 0.55) {
  const x = buf(seg);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const p = t / seg;
    x[i] = ruido() * Math.sin(Math.PI * p) ** 2;
  }
  return passaAlta(passaBaixa(x, (t) => 500 + 5000 * Math.sin(Math.PI * (t / seg))), 250);
}
function cliqueUi() {
  const x = buf(0.04);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = Math.sin(TAU * 3200 * t) * Math.exp(-t * 220) + ruido() * Math.exp(-t * 400) * 0.3;
  }
  return x;
}
/** "Toc" de interface: curto, grave e abafado (sem o "bloop" de desenho animado). */
function pop() {
  const x = buf(0.09);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = (Math.sin(TAU * 540 * t) * 0.8 + Math.sin(TAU * 1080 * t) * 0.15) * Math.exp(-t * 55) + ruido() * Math.exp(-t * 300) * 0.15;
  }
  return passaBaixa(x, 2500);
}
/** Confirmação: duas notas suaves (quinta) com cauda, sem arpejo de sininho. */
function dingPositivo() {
  const x = buf(1.2);
  misturar(x, epiano(hz(76), 1.1, 2.2), 0, 0.5);
  misturar(x, epiano(hz(83), 1.0, 2.4), 0.07, 0.4);
  return reverb(x, 0.35);
}

salvar('tick.wav', tick());
salvar('papel.wav', papel());
salvar('tecla.wav', tecla());
salvar('notificacao.wav', notificacao());
salvar('riser.wav', riser(1.5));
salvar('reverso.wav', reverso(0.9));
salvar('impacto.wav', impacto(2.4, 1.2));
salvar('impacto-medio.wav', impacto(1.2, 0.6));
salvar('impacto-suave.wav', passaBaixa(impacto(2.0, 0.9), 900));
salvar('whoosh.wav', whoosh());
salvar('clique-ui.wav', cliqueUi());
salvar('pop.wav', pop());
salvar('ding-positivo.wav', dingPositivo());

// ============================================================ TRILHAS
const BATIDA = 0.5; // 120 BPM

// ---------------- tensa: quadro 75 → 304 (7,63 s). Lá menor com a 2ª menor.
{
  const seg = 7.8;
  const x = buf(seg);
  // Drone: A1 + E2 + Bb2 (a dissonância que incomoda), abrindo o filtro devagar.
  const drone = buf(seg);
  for (const n of [33, 40, 46]) misturar(drone, serra(hz(n), seg, { ataque: 1.2, queda: 0.05, corte: 20000, vozes: 3, detune: 0.006 }), 0, 0.33);
  misturar(x, passaBaixa(drone, (t) => 220 + 520 * (t / seg)), 0, 0.9);
  // Bumbo abafado em toda batida; nos últimos 2,5 s (os cortes de 15 quadros), a cada meia.
  for (let t = 0; t < seg - 0.2; t += BATIDA) {
    misturar(x, passaBaixa(bumbo(0.4, 110, 40, 0.1), 900), t, 0.8);
    if (t >= 5.0) misturar(x, passaBaixa(bumbo(0.3, 110, 40, 0.1), 900), t + BATIDA / 2, 0.55);
  }
  // Chimbal fechado seco, entrando na metade.
  for (let t = 2.0; t < seg - 0.2; t += BATIDA / 2) misturar(x, chimbal(0.04), t, 0.12 + 0.1 * (t / seg));
  salvar('trilha-tensa.wav', x);
}

// ---------------- drop: quadro 345 → 1350 (33,5 s). Lá menor, deep house
// cinematográfico: sub grave, bumbo seco, palma com sala, chimbal fino, piano
// elétrico e pad respirando com o bumbo. Nada de acorde de serra agudo nem
// arpejo de videogame.
//
//   compassos 0–3   (345–585)   entra tudo, sem melodia
//   compassos 4–7   (585–825)   melodia suave (pluck com eco)
//   compassos 8–11  (825–1065)  variação: Dm9 – Am9 – Fmaj9 – E7sus4/E7
//   1065–1110                   quebra: bumbo sai, rufo de caixa → prova
//   1110–1320                   volta cheio, com melodia; 1320: acorde final
{
  const seg = 33.7;
  const compasso = BATIDA * 4;
  const fimMusica = 32.5;
  const quebra = [24.0, 25.5]; // quadros 1065–1110
  const bateria = buf(seg);
  const musica = buf(seg);
  const melodiaBus = buf(seg);

  // [pad/piano, baixo]
  const A = [
    [[60, 64, 67, 71], 33], // Am9 (sem a fundamental em cima)
    [[57, 60, 64, 67], 29], // Fmaj9
    [[64, 67, 71, 74], 36], // Cmaj9 / E
    [[62, 64, 67, 71], 31], // G6
  ];
  const B = [
    [[53, 57, 60, 64], 38], // Dm9
    [[60, 64, 67, 71], 33], // Am9
    [[57, 60, 64, 67], 29], // Fmaj9
    [[57, 59, 62, 64], 28], // E7sus4 (→ E7 no fim do compasso)
  ];
  const MELODIA = [
    [0, 76], [0.75, 72], [1.5, 74], [3, 71],
    [0, 72], [0.75, 69], [1.5, 71], [3, 67],
  ];

  const bumbos = [];
  for (let c = 0; c * compasso < fimMusica; c++) {
    const t0 = c * compasso;
    const [notas, baixo] = c >= 8 && c < 12 ? B[c % 4] : A[c % 4];
    const naQuebra = (t) => t >= quebra[0] && t < quebra[1];

    // Pad do compasso inteiro (abre o filtro na variação).
    misturar(musica, pad(notas, compasso + 0.2, c >= 8 && c < 12 ? 1400 : 950), t0, 0.35);

    for (let b = 0; b < 4; b++) {
      const t = t0 + b * BATIDA;
      if (t >= fimMusica) break;
      if (!naQuebra(t)) {
        misturar(bateria, bumbo(0.42, 130, 46, 0.35), t, 1.0);
        bumbos.push(t);
      }
      if (b % 2 === 1 && !naQuebra(t)) misturar(bateria, palmaSeca(), t, 0.5);
      // Chimbal em semicolcheias com dinâmica; aberto no contratempo.
      [0.35, 0.18, 0.6, 0.22].forEach((v, k) => misturar(bateria, chimbal(0.025), t + (k * BATIDA) / 4, v * 0.16));
      misturar(bateria, chimbal(0.12, true), t + BATIDA / 2, 0.1);
      // Baixo no contratempo + síncope no último tempo.
      const notaBaixo = c % 4 === 3 && b >= 2 && c >= 8 && c < 12 ? baixo : baixo;
      if (!naQuebra(t)) {
        misturar(musica, sub(hz(notaBaixo), 0.2), t + BATIDA / 2, 0.55);
        if (b === 3) misturar(musica, sub(hz(notaBaixo + 12), 0.1), t + BATIDA * 0.75, 0.25);
      }
    }
    // Piano elétrico em síncope.
    const notasPiano = c >= 8 && c < 12 && c % 4 === 3 ? [56, 59, 62, 64] : notas; // E7 no fim da variação
    for (const [off, dur] of [[0.5, 0.5], [1.75, 0.4], [2.5, 0.5], [3.5, 0.45]]) {
      const tt = t0 + off * BATIDA;
      if (tt >= fimMusica) break;
      const acorde = buf(dur + 0.6);
      for (const n of notasPiano) misturar(acorde, epiano(hz(n), dur + 0.6, 2.4), 0, 0.2);
      misturar(musica, acorde, tt, 0.6);
    }
    // Melodia suave nos compassos 4–7 e depois da prova.
    if ((c >= 4 && c < 8) || t0 >= quebra[1]) {
      for (let k = 0; k < 4; k++) {
        const [off, n] = MELODIA[(c % 2) * 4 + k];
        const tt = t0 + off * BATIDA;
        if (tt < fimMusica) misturar(melodiaBus, pluck(hz(n)), tt, 0.3);
      }
    }
    // Prato no começo de cada seção.
    if (c === 0 || c === 4 || c === 8) misturar(bateria, prato(), t0, 0.12);
  }
  // Quebra: rufo de caixa crescendo até a prova, e o prato na volta.
  for (let t = quebra[0] + 0.5, k = 0; t < quebra[1]; t += BATIDA / 4, k++) misturar(bateria, caixa(), t, 0.12 + k * 0.035);
  misturar(bateria, prato(2.6), quebra[1], 0.2);
  misturar(bateria, bumbo(0.5, 140, 44, 0.4), quebra[1], 1.0);
  bumbos.push(quebra[1]);

  // Final: Am9 aberto com cauda longa + sub.
  const final = buf(2.0);
  for (const n of [45, 57, 60, 64, 67, 71]) misturar(final, epiano(hz(n), 2.0, 1.1), 0, 0.2);
  misturar(final, pad([57, 60, 64, 71], 2.0, 1100), 0, 0.5);
  misturar(musica, final, fimMusica, 0.55);
  misturar(musica, sub(hz(33), 1.2), fimMusica, 0.4);
  misturar(bateria, bumbo(0.6, 130, 44, 0.35), fimMusica, 0.8);
  misturar(bateria, prato(2.4), fimMusica, 0.1);

  // Sidechain: a música "respira" com o bumbo.
  bumbos.sort((a, b) => a - b);
  let k = 0;
  for (let i = 0; i < musica.length; i++) {
    const t = i / SR;
    while (k + 1 < bumbos.length && bumbos[k + 1] <= t) k++;
    const desde = bumbos[k] <= t ? t - bumbos[k] : 99;
    musica[i] *= 1 - 0.55 * Math.exp(-desde * 9);
  }

  const x = buf(seg);
  misturar(x, reverb(musica, 0.22), 0, 1);
  misturar(x, eco(reverb(melodiaBus, 0.3), BATIDA * 0.75, 0.32, 4), 0, 1);
  misturar(x, reverb(bateria, 0.08), 0, 1);
  salvar('trilha-drop.wav', saturar(x, 1.15));
}

