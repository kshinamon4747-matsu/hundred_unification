const CACHE = 'hundred-tile-unification-v61';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=61',
  './game-state.js?v=61',
  './game-ui.js?v=61',
  './game-rules.js?v=61',
  './game-ai.js?v=61',
  './app.js?v=61',
  './apple-touch-icon.png?v=61',
  './icons/icon-192.png?v=61',
  './icons/icon-512.png?v=61',
  './manifest.webmanifest',
];
self.addEventListener('install', (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) =>
        Promise.all(clients.map((client) => client.navigate(client.url).catch(() => null))),
      ),
  ),
);
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return r;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return r;
        }),
    ),
  );
});
