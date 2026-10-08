// Keeps compiler toolchain files in Cache Storage. Their URLs carry a sha256,
// so a stored copy never goes stale. The engine downloads each file once to
// report progress and then loads it again, relying on the HTTP cache; private
// windows keep that cache in memory and skip a 27 MB file, so without this
// worker the compiler is downloaded twice. Every other request passes through.
const CACHE = "myriad-toolchains-v1";
const stores = new Map();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("myriad-toolchains-") && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method === "GET" &&
    url.origin === location.origin &&
    url.pathname.startsWith("/toolchains/") &&
    url.searchParams.has("sha256")
  )
    event.respondWith(serve(event.request));
});

async function serve(request) {
  const key = request.url;
  // A request arriving while the same file is being stored waits for it.
  const storing = stores.get(key);
  if (storing) await storing;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  let settle;
  stores.set(key, new Promise((resolve) => (settle = resolve)));
  const finish = () => {
    stores.delete(key);
    settle();
  };
  try {
    const response = await fetch(request);
    if (!response.ok) {
      finish();
      return response;
    }
    cache
      .put(key, response.clone())
      .catch(() => {})
      .finally(finish);
    return response;
  } catch (error) {
    finish();
    throw error;
  }
}
