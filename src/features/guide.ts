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

/*
 * Depois do guia vem a sincronização das empresas (`features/catalog/sincronizar`).
 * O guia não sabe dela: ele só avisa que terminou e diz o que fazer depois
 * (abrir o simulador, se o corretor pediu). Quem ouve decide se abre a janela
 * antes; sem ninguém ouvindo, o "depois" acontece direto.
 */
let aoTerminar: ((depois?: () => void) => void) | null = null;

export function registrarAoTerminarOGuia(fn: ((depois?: () => void) => void) | null): void {
  aoTerminar = fn;
}

export function terminarOGuia(depois?: () => void): void {
  if (aoTerminar) aoTerminar(depois);
  else depois?.();
}
