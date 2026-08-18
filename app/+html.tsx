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

/**
 * O POUP nunca rola para o lado — e agora isso está declarado.
 *
 * O app é uma casca de tela cheia: todo conteúdo largo (tabela, gráfico, fluxo
 * de pagamento) rola dentro do próprio contêiner. A página em si deslizar na
 * horizontal é sempre acidente, e é um acidente que parece defeito grave no
 * celular: o usuário arrasta para rolar a lista e a tela inteira anda de lado.
 *
 * O acidente aqui veio do orbe da LIA, cuja nuvem se espalha para fora do botão
 * flutuante — que vive a 16 px da borda. Dá para calibrar cada camada da
 * animação para caber no milímetro, e foi o que se fez no modo `compacto`; mas
 * confiar só nisso é deixar a próxima animação (ou o próximo botão flutuante)
 * reintroduzir o problema em silêncio. Esta regra é a garantia estrutural, e
 * ela não esconde bug de layout nenhum: numa casca de tela cheia, não existe
 * conteúdo legítimo à direita da borda.
 */
const SEM_ROLAGEM_LATERAL = `
html, body { overflow-x: hidden; max-width: 100%; }
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
        <style dangerouslySetInnerHTML={{ __html: SEM_ROLAGEM_LATERAL }} />
        <script dangerouslySetInnerHTML={{ __html: REGISTER_SW }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
