import { Easing, interpolate, random } from 'remotion';

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** R$ no formato brasileiro (todos os valores do vídeo são ilustrativos). */
export const brl = (v: number) => brlFmt.format(v).replace(/ /g, ' ');

/** 0→1 entre dois quadros, sem sair da faixa. */
export const faixa = (f: number, de: number, ate: number, easing: (t: number) => number = Easing.out(Easing.cubic)) =>
  interpolate(f, [de, ate], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });

/** Tremor de câmera determinístico (o mesmo a cada render). */
export function tremor(f: number, amplitude: number): { x: number; y: number; r: number } {
  if (amplitude <= 0) return { x: 0, y: 0, r: 0 };
  const a = (s: string) => (random(`${s}-${f}`) * 2 - 1) * amplitude;
  return { x: a('x'), y: a('y'), r: a('r') * 0.02 };
}

/** Texto digitado letra por letra: quantas letras aparecem no quadro f. */
export const letras = (texto: string, f: number, inicio: number, porQuadro = 1) =>
  texto.slice(0, Math.max(0, Math.floor((f - inicio) * porQuadro)));
