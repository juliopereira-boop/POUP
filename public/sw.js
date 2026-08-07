/*
 * Service worker do POUP — deliberadamente minúsculo.
 *
 * ------------------------------------------------------------------
 * POR QUE ELE EXISTE
 * ------------------------------------------------------------------
 * O Chrome do Android só oferece o botão "Instalar aplicativo" para sites que
 * têm service worker respondendo offline. Sem este arquivo, o convite da tela
 * inicial nunca vira um toque só: sobra o passo a passo manual, que é
 * exatamente o que quase ninguém sabe fazer.
 *
 * ------------------------------------------------------------------
 * POR QUE ELE NÃO GUARDA O APP
 * ------------------------------------------------------------------
 * Service worker que guarda JS e HTML é a causa clássica de "o app não
 * atualiza": o corretor abre e continua vendo a versão da semana passada,
 * mesmo depois do deploy. Aqui NADA do app é guardado. A única coisa em cache
 * é a página de "sem internet", e ela só aparece quando a rede realmente
 * falha. Requisição de app, foto ou API passa direto, sem interferência.
 */

/** Muda junto com o conteúdo do offline.html, para o cache antigo ser jogado fora. */
const CACHE = 'poup-offline-v1';
const OFFLINE_URL = '/offline.html';

/**
 * Guarda a página de "sem internet".
 *
 * A resposta é REMONTADA antes de ir para o cache. Motivo: a hospedagem
 * redireciona `/offline.html` para `/offline`, e uma resposta que veio de
 * redirecionamento não pode ser devolvida numa navegação — o navegador recusa
 * e a tela fica em branco, que é justamente o que se quer evitar. Copiando o
 * corpo para uma resposta nova, a marca de redirecionamento some.
 */
async function cacheOfflinePage() {
  const res = await fetch(OFFLINE_URL, { cache: 'reload' });
  if (!res.ok) return;
  const cache = await caches.open(CACHE);
  await cache.put(
    OFFLINE_URL,
    new Response(await res.blob(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    // Se a página offline não baixar, o service worker ainda instala: ele vale
    // só por existir. Falhar aqui derrubaria a instalação inteira.
    cacheOfflinePage()
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só a navegação (abrir uma tela) é interceptada. Todo o resto — bundle,
  // imagem, chamada ao Supabase — segue o caminho normal do navegador.
  if (request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return (
        cached ??
        new Response('Sem conexão.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      );
    }),
  );
});
