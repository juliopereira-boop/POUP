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
function pop() {
  const x = buf(0.12);
  let fase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    fase += (TAU * (900 * Math.exp(-t * 30) + 220)) / SR;
    x[i] = Math.sin(fase) * Math.exp(-t * 35);
  }
  return x;
}
function dingPositivo() {
  const x = buf(0.9);
  [84, 88, 91, 96].forEach((n, k) => misturar(x, seno(hz(n), 0.8, 5), k * 0.06, 0.6));
  return eco(x, 0.12, 0.25, 3);
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

// ---------------- drop: quadro 345 → 1350 (33,5 s). Dó maior, energética.
{
  const seg = 33.7;
  const x = buf(seg);
  const compasso = BATIDA * 4;
  // C – G – Am – F (acordes em MIDI)
  const acordes = [
    [60, 64, 67, 72],
    [55, 59, 62, 67],
    [57, 60, 64, 69],
    [53, 57, 60, 65],
  ];
  const baixos = [36, 43, 45, 41];
  const fimMusica = 32.5; // último acorde no quadro 1320; depois, cauda até o 1350
  for (let c = 0; c * compasso < fimMusica; c++) {
    const t0 = c * compasso;
    // Compassos 8–11 trocam a ordem (Am F C G): variação no meio do uso do app.
    const i = c >= 8 && c < 12 ? [2, 3, 0, 1][c % 4] : c % 4;
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * BATIDA;
      if (t >= fimMusica) break;
      misturar(x, bumbo(0.45, 160, 48, 0.5), t, 1.0);
      if (b % 2 === 1) misturar(x, palma(), t, 0.45);
      misturar(x, chimbal(0.2, true), t + BATIDA / 2, 0.16);
      misturar(x, chimbal(0.03), t + BATIDA / 4, 0.08);
      misturar(x, chimbal(0.03), t + (3 * BATIDA) / 4, 0.08);
      // Baixo em colcheias, "respirando" com o bumbo.
      misturar(x, serra(hz(baixos[i]), BATIDA / 2 - 0.02, { queda: 6, corte: 700 }), t + BATIDA / 2, 0.55);
      misturar(x, serra(hz(baixos[i] + 12), BATIDA / 4, { queda: 12, corte: 900 }), t + (3 * BATIDA) / 4, 0.25);
    }
    // Acorde brilhante em síncope.
    for (const off of [0, 0.75, 1.5]) {
      const acorde = buf(0.5);
      for (const n of acordes[i]) misturar(acorde, serra(hz(n + 12), 0.5, { queda: 6, corte: 4200, vozes: 3 }), 0, 0.22);
      misturar(x, acorde, t0 + off, 0.5);
    }
    // Arpejo a partir do 3º compasso (dá subida de energia).
    if (c >= 2) {
      for (let s = 0; s < 8; s++) {
        const n = acordes[i][s % 4] + 24;
        misturar(x, serra(hz(n), 0.18, { queda: 14, corte: 5000, vozes: 1 }), t0 + s * (BATIDA / 2), 0.14);
      }
    }
  }
  // Rufo de caixa subindo para a prova (quadro 1080 → 1110).
  for (let t = 24.5, k = 0; t < 25.5; t += BATIDA / 4, k++) misturar(x, palma(), t, 0.15 + k * 0.03);
  // Final: acorde de Dó com cauda longa e um bumbo.
  const final = buf(1.6);
  for (const n of [48, 60, 64, 67, 72, 76]) misturar(final, serra(hz(n), 1.6, { queda: 1.6, corte: 3500, vozes: 3 }), 0, 0.2);
  misturar(x, eco(final, 0.18, 0.35, 4), fimMusica, 0.9);
  misturar(x, bumbo(0.6, 160, 45, 0.5), fimMusica, 1.0);
  salvar('trilha-drop.wav', eco(x, 0.25, 0.12, 2));
}
