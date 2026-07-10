// ponytail: оболочка кэшируется для офлайна. HTML — network-first (свежая версия онлайн,
// кэш только если сети нет), статика — cache-first. Данные/карта всегда из сети.
const CACHE = 'kampika-v11';
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
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
