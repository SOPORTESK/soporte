const CACHE_NAME = "sekunet-app-v2";
const PRECACHE = [
  "/",
  "/login",
  "/inbox",
  "/iSoTiendaHD.png",
  "/iSoTienda3D.png",
  "/logoTienda3D.png",
  "/manifest-app.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && event.request.url.startsWith("http")) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => 
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          return new Response("Network error", { status: 503, statusText: "Service Unavailable" });
        })
      )
  );
});
