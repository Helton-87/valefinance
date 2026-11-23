/* ValeFinance: network-first para manter HTML e scripts da mesma versão.
   Cache somente de arquivos estáticos; nunca armazena planilhas Excel. */
const CACHE = 'valefinance-shell-20261123-v4';
const ASSETS = ['./index.html','./style.css','./polish.css','./excel.js','./billing.js','./app.js','./calendar.js','./report.js','./pwa.js','./icon.svg','./logotipo.jpeg','./manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('valefinance-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // Não responder com scripts antigos após um deploy. Ao ficar offline,
  // somente a versão consistente do cache atual é usada.
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {}));
      }
      return response;
    }).catch(() => caches.match(request, {ignoreSearch:true}).then(cached => cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
