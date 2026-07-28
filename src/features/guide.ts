/**
 * Guia de boas-vindas: controle de abertura e de "já vi".
 *
 * O guia aparece sozinho no primeiro acesso e pode ser reaberto em Ajustes.
 * Como o botão de reabrir mora numa tela e o guia mora no layout, o opener
 * é registrado aqui em vez de criar um provider só para isso.
 */

let opener: (() => void) | null = null;

export function registerGuideOpener(fn: (() => void) | null): void {
  opener = fn;
}

export function openGuide(): void {
  opener?.();
}

export function guideSeenKey(userId: string): string {
  return `poup.guide.seen.${userId}`;
}
