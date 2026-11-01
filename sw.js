const CACHE = 'hundred-tile-unification-v72';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=72',
  './game-state.js?v=72',
  './game-ui.js?v=72',
  './game-rules.js?v=72',
  './game-ai.js?v=72',
  './app.js?v=72',
  './apple-touch-icon.png?v=72',
  './icons/icon-192.png?v=72',
  './icons/icon-512.png?v=72',
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
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) {
    e.respondWith(new Response('External communication is disabled.', { status: 403 }));
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('./index.html'));
    return;
  }
  e.respondWith(
    caches
      .match(e.request, { ignoreSearch: true })
      .then((hit) => hit || new Response('Offline asset is unavailable.', { status: 503 })),
  );
});
