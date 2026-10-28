const CACHE_NAME = "team-matcher-v1";
const APP_ROOT = new URL("./", self.registration.scope).href;
const STATIC_DESTINATIONS = new Set(["script", "style", "image", "font"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellResponse = await fetch(APP_ROOT);
      if (!shellResponse.ok) {
        throw new Error(`Unable to precache app shell: ${shellResponse.status}`);
      }

      const shellHtml = await shellResponse.clone().text();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(APP_ROOT, shellResponse);

      const assetUrls = [
        new URL("manifest.json", APP_ROOT).href,
        new URL("icons/icon-192.png", APP_ROOT).href,
        new URL("icons/icon-512.png", APP_ROOT).href,
        new URL("icons/icon-maskable-512.png", APP_ROOT).href,
        ...[...shellHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)]
          .map((match) => new URL(match[1], APP_ROOT).href)
          .filter((url) => new URL(url).origin === self.location.origin),
      ];
      await Promise.all(assetUrls.map((url) => cache.add(url)));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("team-matcher-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            return caches.open(CACHE_NAME).then((cache) =>
              cache.put(request, response.clone()).then(() => response),
            );
          }
          return response;
        })
          .catch(async () => {
            const cache = await caches.open(CACHE_NAME);
            return (await cache.match(request)) ?? (await cache.match(APP_ROOT));
          }),
    );
    return;
  }

  if (!STATIC_DESTINATIONS.has(request.destination)) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
