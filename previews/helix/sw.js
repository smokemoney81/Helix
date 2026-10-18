// Change RELEASE for every published software update.
const RELEASE = '1.2.0';
const CACHE_NAME = `helix-app-${RELEASE}`;
const APP_FILES = ['./index.html', './styles.css', './scene.js', './app.js', './manifest.webmanifest', './helix-icon.svg', './assets/helix-scene.png'];
const scope = new URL('./', self.location.href);
const appURLs = new Set(APP_FILES.map(path => new URL(path, scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Do not use the browser's previous HTTP cache to construct a new release.
    await cache.addAll(APP_FILES.map(path => new Request(new URL(path, scope), { cache: 'reload' })));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('helix-app-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== scope.origin) return;
  const appDocument = event.request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`);
  if (!appDocument && !appURLs.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(appDocument ? new URL('./index.html', scope).href : event.request);
    return cached || fetch(event.request);
  })());
});
