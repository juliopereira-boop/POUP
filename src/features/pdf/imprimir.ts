/**
 * IMPRIMIR HTML COMO PDF, NA WEB.
 *
 * ===========================================================================
 * ESTE ARQUIVO É CICATRIZ, NÃO ABSTRAÇÃO PREMATURA
 * ===========================================================================
 * Ele nasceu dentro de `simulador/proposal.ts` e saiu de lá quando o simulador
 * de financiamento passou a precisar do mesmo comportamento. A extração não foi
 * por elegância: **a proposta já saiu em branco duas vezes**, por motivos
 * diferentes, e cada correção está codificada aqui numa linha específica
 * (`opacity: 1` no iframe, a conferência de altura antes de imprimir, a
 * reescrita via `document.write`, a aba nova como último recurso).
 *
 * Copiar isso para o segundo módulo seria assinar embaixo de repetir os mesmos
 * dois bugs — e descobri-los de novo pelo mesmo caminho: um corretor entregando
 * uma folha vazia ao cliente.
 *
 * ===========================================================================
 * A REGRA QUE ORGANIZA TUDO AQUI
 * ===========================================================================
 * **Nada é impresso sem confirmar que o documento renderizou.** A conferência é
 * a altura de um seletor que quem chama informa (`seletorPronto`). Se o
 * `srcdoc` não pegar, reescrevemos o documento na marra; se ainda não vier,
 * abrimos numa aba nova; e se nem isso funcionar, a Promise REJEITA para a tela
 * poder avisar. Um erro visível é muito melhor que um PDF em branco.
 */

interface PrintIframeDoc {
  open?: () => void;
  write?: (html: string) => void;
  close?: () => void;
  querySelector?: (sel: string) => { getBoundingClientRect: () => { height: number } } | null;
}
interface PrintIframeWin {
  focus?: () => void;
  print?: () => void;
  onafterprint?: (() => void) | null;
  requestAnimationFrame?: (cb: () => void) => void;
}
interface PrintIframeEl {
  style: Record<string, string>;
  setAttribute: (k: string, v: string) => void;
  srcdoc: string;
  onload: (() => void) | null;
  contentWindow: PrintIframeWin | null;
  contentDocument: PrintIframeDoc | null;
}
interface PrintGlobal {
  document?: {
    createElement: (t: string) => PrintIframeEl;
    body: { appendChild: (n: unknown) => void; removeChild: (n: unknown) => void };
    title: string;
  };
  requestAnimationFrame?: (cb: () => void) => void;
  setTimeout: (cb: () => void, ms: number) => void;
  open?: (url?: string, target?: string) => PrintWindowLike | null;
}

/** Janela nova usada só como último recurso, quando o iframe não renderiza. */
interface PrintWindowLike {
  document?: { open?: () => void; write?: (html: string) => void; close?: () => void };
  focus?: () => void;
}

/** De quanto em quanto tempo conferimos se o documento já tem a proposta. */
const READY_POLL_MS = 100;
/** Quanto tempo esperamos no total antes de considerar que não renderizou. */
const READY_TIMEOUT_MS = 6000;
/** Altura mínima (px) que a folha precisa ter para valer como "tem conteúdo". */
const MIN_SHEET_HEIGHT = 50;

/**
 * Imprime `html` num iframe oculto e resolve quando a impressão termina.
 *
 * @param seletorPronto elemento que precisa existir e ter altura para o
 *   documento contar como renderizado. É o coração da proteção contra o PDF em
 *   branco: sem ele, `print()` sairia confiando na sorte.
 */
export function imprimirHtmlNaWeb(
  html: string,
  nomeArquivo: string,
  seletorPronto = '.sheet',
): Promise<void> {
  const g = globalThis as unknown as PrintGlobal;
  const doc = g.document;
  if (!doc) return Promise.resolve();
  const originalTitle = doc.title;
  doc.title = nomeArquivo;

  return new Promise<void>((resolve, reject) => {
    const iframe = doc.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    // Fora da tela, mas com tamanho real e VISÍVEL: `opacity: 0` ou
    // `display: none` fazem o navegador não renderizar — foi exatamente assim
    // que o PDF saiu em branco da primeira vez.
    iframe.style.position = 'fixed';
    iframe.style.left = '-10000px';
    iframe.style.top = '0';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    iframe.style.border = '0';
    iframe.style.opacity = '1';
    iframe.style.visibility = 'visible';

    let done = false;
    let printed = false;

    const finish = (fail?: Error) => {
      if (done) return;
      done = true;
      doc.title = originalTitle;
      g.setTimeout(() => {
        try {
          doc.body.removeChild(iframe);
        } catch {
          // O iframe já pode ter saído do DOM; não há o que desfazer.
        }
      }, 1000);
      if (fail) reject(fail);
      else resolve();
    };

    /** A folha da proposta existe e ocupa espaço? */
    const hasContent = (): boolean => {
      try {
        const cdoc = iframe.contentDocument;
        const sheet = cdoc?.querySelector?.(seletorPronto);
        if (!sheet) return false;
        return sheet.getBoundingClientRect().height > MIN_SHEET_HEIGHT;
      } catch {
        // Documento ainda não acessível: só não está pronto.
        return false;
      }
    };

    const doPrint = () => {
      if (printed) return;
      printed = true;
      const win = iframe.contentWindow;
      if (!win || !win.print) {
        finish(new Error('Este navegador não permite imprimir.'));
        return;
      }
      win.onafterprint = () => finish();
      const raf = win.requestAnimationFrame ?? g.requestAnimationFrame;
      const afterPaint = () => {
        g.setTimeout(() => {
          try {
            win.focus?.();
          } catch {
            // Focar é cortesia; não impede a impressão.
          }
          win.print?.();
          // Nem todo navegador dispara `onafterprint`: solta a Promise depois.
          g.setTimeout(() => finish(), 60000);
        }, 500);
      };
      if (raf) raf(afterPaint);
      else afterPaint();
    };

    /** Último recurso: aba nova com o documento, para o corretor imprimir de lá. */
    const openInNewTab = (): boolean => {
      try {
        const w = g.open?.('', '_blank');
        if (!w?.document?.write) return false;
        w.document.open?.();
        w.document.write(html);
        w.document.close?.();
        w.focus?.();
        return true;
      } catch {
        return false;
      }
    };

    let waited = 0;
    let rewritten = false;
    const waitForContent = () => {
      if (done || printed) return;
      if (hasContent()) {
        doPrint();
        return;
      }
      waited += READY_POLL_MS;

      // Na metade do tempo, o `srcdoc` claramente não pegou: reescreve o
      // documento na marra. Alguns navegadores engasgam com `srcdoc` grande
      // (imagens em data URI engordam muito o HTML).
      if (!rewritten && waited >= READY_TIMEOUT_MS / 2) {
        rewritten = true;
        const cdoc = iframe.contentDocument;
        if (cdoc?.open && cdoc.write && cdoc.close) {
          try {
            cdoc.open();
            cdoc.write(html);
            cdoc.close();
          } catch {
            // Sem acesso ao documento: sobra a aba nova, abaixo.
          }
        }
      }

      if (waited >= READY_TIMEOUT_MS) {
        if (openInNewTab()) {
          finish();
          return;
        }
        finish(new Error('Não foi possível montar o documento para impressão.'));
        return;
      }
      g.setTimeout(waitForContent, READY_POLL_MS);
    };

    // ORDEM IMPORTA: primeiro no DOM, depois o conteúdo. Um iframe recém-anexado
    // dispara um `load` do `about:blank` inicial; se o handler estivesse ligado
    // antes, ele imprimiria o documento vazio.
    doc.body.appendChild(iframe);
    iframe.srcdoc = html;
    iframe.onload = waitForContent;
    // A conferência roda de qualquer jeito: não dependemos do `load` chegar.
    g.setTimeout(waitForContent, READY_POLL_MS);
  });
}
