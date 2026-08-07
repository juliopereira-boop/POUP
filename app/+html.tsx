import { ScrollViewStyleReset } from 'expo-router/html';
import { type ReactNode } from 'react';

/**
 * Registra o service worker (veja `public/sw.js`).
 *
 * Vai inline no HTML, e não num módulo do app, porque precisa rodar antes do
 * bundle carregar: o Chrome só considera o site instalável depois que o worker
 * está ativo, e o corretor não fica na tela inicial esperando.
 *
 * `load` em vez de imediato para não disputar banda com o bundle na primeira
 * abertura — a instalação pode esperar meio segundo, a tela não.
 */
const REGISTER_SW = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
`;

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <meta name="theme-color" content="#FF751F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="POUP" />
        <meta name="application-name" content="POUP" />
        <meta name="description" content="A ferramenta do corretor de sucesso." />

        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />

        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: REGISTER_SW }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
