/* Somente recursos do aplicativo. Arquivos Excel não são armazenados pelo service worker. */
const CACHE = 'valefinance-shell-20261123-v1';
const ASSETS = ['./index.html','./style.css','./polish.css','./excel.js','./billing.js','./app.js','./calendar.js','./report.js','./persist.js','./pwa.js','./icon.svg','./logotipo.jpeg','./manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('valefinance-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request, {ignoreSearch:true}).then(hit => hit || fetch(event.request)));
});
