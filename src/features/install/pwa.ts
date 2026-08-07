/**
 * Instalar o POUP na tela de início.
 *
 * ------------------------------------------------------------------
 * POR QUE ISSO EXISTE
 * ------------------------------------------------------------------
 * O corretor abre o app pelo navegador, fecha a aba e some. Na prática ele
 * perde o POUP de vista — e "adicionar à tela de início" é um caminho que
 * quase ninguém conhece sozinho. Enquanto o app não está nas lojas, este é o
 * jeito de ele virar ícone no celular.
 *
 * ------------------------------------------------------------------
 * OS DOIS MUNDOS
 * ------------------------------------------------------------------
 * - **Android/Chrome**: o navegador avisa que dá para instalar
 *   (`beforeinstallprompt`), e o app pode abrir a caixa oficial. Um toque.
 * - **iPhone/Safari**: a Apple NÃO expõe nada disso. Não existe botão possível:
 *   só dá para ENSINAR o caminho (Compartilhar → Adicionar à Tela de Início).
 *
 * Por isso o resultado é diferente em cada um: no Android é um botão de
 * verdade, no iPhone é uma instrução ilustrada. Fingir que existe um botão
 * único seria mentir para o corretor.
 */
import { sessionStorage } from '@/lib/storage';

/** Quem pergunta ao navegador se dá para instalar. */
interface InstallPromptEvent {
  preventDefault: () => void;
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaGlobal {
  addEventListener?: (type: string, cb: (e: unknown) => void) => void;
  removeEventListener?: (type: string, cb: (e: unknown) => void) => void;
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: { standalone?: boolean; userAgent?: string };
}

export type InstallPlatform = 'android' | 'ios' | 'desktop' | 'unsupported';

const DISMISS_KEY = 'poup.install.dismissed.v1';

/** Guardado só quando o navegador oferece a instalação de verdade. */
let deferredPrompt: InstallPromptEvent | null = null;

function g(): PwaGlobal {
  return globalThis as unknown as PwaGlobal;
}

/**
 * O app JÁ está instalado (abriu pelo ícone, não pelo navegador).
 *
 * Duas checagens porque cada mundo responde de um jeito: `display-mode` é o
 * padrão, e `navigator.standalone` é o jeito antigo do Safari.
 */
export function isInstalled(): boolean {
  const w = g();
  try {
    if (w.matchMedia?.('(display-mode: standalone)').matches) return true;
    if (w.matchMedia?.('(display-mode: fullscreen)').matches) return true;
    return w.navigator?.standalone === true;
  } catch {
    return false;
  }
}

export function detectPlatform(): InstallPlatform {
  const ua = (g().navigator?.userAgent ?? '').toLowerCase();
  if (!ua) return 'unsupported';
  // iPad moderno se apresenta como Mac; o toque é o que o denuncia.
  const isIOS = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && 'ontouchend' in globalThis);
  if (isIOS) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

/**
 * Começa a escutar o convite de instalação do navegador.
 *
 * `preventDefault` evita o banner padrão feio do Chrome: guardamos o convite
 * para disparar no NOSSO botão, no momento em que o corretor decidir.
 *
 * @returns função para parar de escutar.
 */
export function watchInstallPrompt(onAvailable: (available: boolean) => void): () => void {
  const w = g();
  if (!w.addEventListener) return () => undefined;

  const onPrompt = (e: unknown) => {
    const evt = e as InstallPromptEvent;
    evt.preventDefault?.();
    deferredPrompt = evt;
    onAvailable(true);
  };
  const onInstalled = () => {
    deferredPrompt = null;
    onAvailable(false);
  };

  w.addEventListener('beforeinstallprompt', onPrompt);
  w.addEventListener('appinstalled', onInstalled);
  return () => {
    w.removeEventListener?.('beforeinstallprompt', onPrompt);
    w.removeEventListener?.('appinstalled', onInstalled);
  };
}

/** Existe convite guardado para abrir a caixa oficial de instalação. */
export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/**
 * Abre a caixa de instalação do navegador.
 *
 * @returns `true` quando o corretor aceitou instalar.
 */
export async function promptInstall(): Promise<boolean> {
  const evt = deferredPrompt;
  if (!evt) return false;
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    // O convite é de uso único: depois de usado, o navegador não devolve outro.
    deferredPrompt = null;
    return choice?.outcome === 'accepted';
  } catch {
    deferredPrompt = null;
    return false;
  }
}

/* --- "não quero ver isso agora" --------------------------------------- */

export async function isDismissed(): Promise<boolean> {
  try {
    return (await sessionStorage.getItem(DISMISS_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function dismiss(): Promise<void> {
  try {
    await sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Sem armazenamento o aviso volta na próxima vez. Chato, não quebrado.
  }
}

/** Usado pelo atalho em Ajustes, para o corretor rever o passo a passo. */
export async function undismiss(): Promise<void> {
  try {
    await sessionStorage.removeItem(DISMISS_KEY);
  } catch {
    // Idem.
  }
}
