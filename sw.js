const CACHE_NAME = "static-cache-v2";

/** Assets same-origin only — never cache API / cross-origin / non-GET. */
function shouldCache(request, response) {
  if (request.method !== "GET") return false;
  if (!response || !response.ok) return false;
  if (response.type !== "basic") return false;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api")) return false;
  return true;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const {request} = event;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (shouldCache(request, response)) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
