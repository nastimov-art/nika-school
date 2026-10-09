// Офлайн: оболочка из кэша сразу (обновляется в фоне), уроки из сети с запасным кэшем.
// ponytail: при изменении app.js/styles.css поднимай VERSION, иначе Кира увидит новое только со второго открытия.
const VERSION = 'nika-v4';
const CORE = ['./', 'index.html', 'styles.css', 'app.js', 'chars.js', 'manifest.webmanifest',
  'assets/fonts/fonts.css', 'assets/fonts/nunito-cyrillic.woff2', 'assets/fonts/nunito-latin.woff2', 'assets/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  const isContent = path.includes('/content/') || path.endsWith('data.enc');
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
    if (isContent) {
      // уроки: свежие из сети, но не дольше 4 секунд (GitHub в России бывает медленным)
      const timeout = new Promise((r) => setTimeout(() => r(hit), 4000));
      return Promise.race([net.catch(() => hit), timeout]).then((r) => r || net);
    }
    return hit || net.catch(() => cache.match('index.html'));
  }));
});
