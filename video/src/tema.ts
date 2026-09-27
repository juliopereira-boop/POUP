/**
 * O CONCEITO DO VÍDEO É O CONTRASTE: antes (frio, sem cor) × depois (a marca).
 * Nenhuma cor da marca aparece antes do quadro 345, e nenhuma cor fria depois
 * dele — a não ser o lado "Antes" da prova, que é justamente a lembrança.
 */
export const FPS = 30;
export const LARGURA = 1080;
export const ALTURA = 1920;
export const DURACAO = 900;

/** Os quadros do roteiro. */
export const Q = {
  hook: 0,
  sofrimento: 75,
  congela: 300,
  escuro: 330,
  drop: 345,
  solucao: 360,
  whatsapp: 460,
  relatorios: 560,
  prova: 660,
  cta: 780,
  fim: 900,
} as const;

/** 120 BPM: uma batida a cada 15 quadros, contando do drop. */
export const BATIDA = 15;

export const FRIO = {
  fundo: '#0f141b',
  painel: '#1b222c',
  meio: '#2c3643',
  borda: '#3b4756',
  apagado: '#6b7888',
  claro: '#98a4b3',
  papel: '#c7ccd3',
  papelSombra: '#9aa1ab',
  texto: '#d5dbe3',
  azul: '#4d6680',
  erro: '#b14b4b',
} as const;

/** As cores do app (src/theme/colors.ts do POUP). */
export const MARCA = {
  laranja: '#FF751F',
  laranjaEscuro: '#E25F0E',
  laranjaClaro: '#FFB26B',
  laranjaSuave: '#FFF3EA',
  tinta: '#111827',
  tintaSuave: '#6B7280',
  borda: '#E5E7EB',
  fundoApp: '#F3F4F6',
  branco: '#FFFFFF',
  verde: '#16A34A',
  verdeSuave: '#ECFDF5',
} as const;

export const FONTE = "'Inter', 'Noto Color Emoji', sans-serif";
