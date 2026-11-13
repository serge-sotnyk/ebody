// Service worker of the built site (written into dist/ by tools/pwa/plugin.ts,
// which fills in VERSION and FILES). It keeps the whole game in the browser's
// cache so it starts and plays without a network.
//
// Each build is one cache, filled in full before it is used, so a page never
// mixes files of two versions. A new version waits until the page asks for it
// (main.ts: at the next start, or "Update" in the menu); then the old cache
// is dropped.

const VERSION = '__VERSION__';
/** Every file of the build, relative to this script (the site's base). */
const FILES = __FILES__;
const CACHE = `ebody-${VERSION}`;

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache, which may still hold the previous version's files.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('ebody-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'update') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request);
    })(),
  );
});
