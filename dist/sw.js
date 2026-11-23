/* PWA isolado: NUNCA armazena planilhas Excel. */
const CACHE_NAME = 'valefinance-pwa-20261123-nav3';
const SHELL = [
  './index.html', './style.css', './welcome.css', './dark-teal.css',
  './excel.js', './billing.js', './app.js', './calendar.js',
  './report.js', './pwa.js', './logotipo.jpeg', './manifest.webmanifest'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(name => name.startsWith('valefinance-pwa-') && name !== CACHE_NAME)
        .map(name => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin ||
      !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  // Network-first evita que versões antigas de HTML e JavaScript sejam misturadas.
  event.respondWith(
    fetch(req).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {}));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(req, {ignoreSearch:true});
      if (cached) return cached;
      if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
      return Response.error();
    })
  );
});
