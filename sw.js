// ponytail: оболочка кэшируется для офлайна. HTML — network-first (свежая версия онлайн,
// кэш только если сети нет), статика — stale-while-revalidate (отдаём из кэша, но всегда
// тянем свежее в фоне и обновляем кэш — иначе CSS/JS залипают навсегда). Данные/карта — сеть.
const CACHE = 'te-v17'; // бамп обязателен при смене статики: активация чистит старые кэши
const SHELL = ['./', './index.html', './polish.css', './vibe.js', './manifest.json', './icon.svg',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // supabase / yandex → сеть, не трогаем
  // Гостевая страница объекта — всегда сеть, НИКОГДА не подменять приложением (иначе гость увидит логин).
  if (url.pathname.endsWith('/share.html')) { e.respondWith(fetch(e.request)); return; }
  const isDoc = e.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  if (isDoc) {
    e.respondWith(fetch(e.request).then(r => {
      caches.open(CACHE).then(c => c.put(e.request, r.clone()));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
  } else {
    // stale-while-revalidate: отдать из кэша сразу, но обновить кэш свежим ответом в фоне
    e.respondWith(caches.match(e.request).then(cached => {
      const fetching = fetch(e.request).then(r => {
        if (r && r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      }).catch(() => cached);
      return cached || fetching;
    }));
  }
});
