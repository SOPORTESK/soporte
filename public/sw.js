const CACHE_NAME = 'sekunet-widget-v8';
const urlsToCache = [
  '/widget-standalone.html',
  '/iSoTiendaHD.png',
  '/iSoTienda3D.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // Ignorar completamente: Supabase, APIs, POST, PATCH, PUT
  if (
    event.request.method !== 'GET' ||
    url.includes('supabase.co') ||
    url.includes('/api/') ||
    url.includes('supabase.in')
  ) {
    return; // dejar pasar sin interceptar
  }
  // Solo cachear archivos estáticos locales
  const isStatic = urlsToCache.some(u => url.endsWith(u));
  if (!isStatic) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => fetch(event.request))
  );
});
