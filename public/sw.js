const CACHE_NAME = "backlog-static-v3";

// Only ever caches content-hashed or otherwise clearly-static files, plus the one navigation
// below. Everything else — client-side RSC data fetches, other paths — passes straight through
// untouched: this is an RSC app (vinext), where the same URL can be requested in different shapes
// (full HTML vs. a flight/data payload) depending on headers the Cache API can't reliably replay.
// An earlier version cached those indiscriminately, which meant an offline page load could get
// served a mismatched response and crash to a blank screen — worse than just not caching it.
// Static assets are already served from the browser's own HTTP cache via immutable Cache-Control
// headers, so this SW isn't even load-bearing for them; it only exists so the manifest/icons are
// available the moment the app is installed.
const STATIC_PATTERN = /^\/(assets\/|icons\/|favicon\.svg$|manifest\.webmanifest$)/;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The app shell: network-first, falling back to the last cached copy. "/" is the PWA's
  // start_url and renders the same generic AppShell/Providers wrapper every time (auth and data
  // are resolved client-side, not baked in server-side per user) — so replaying an old copy of it
  // is safe. This is what lets launching the installed app offline boot the real app — which then
  // reads your data from the IndexedDB-persisted query cache — instead of the browser's own
  // placeholder "no connection" page.
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch (error) {
          const cached = await cache.match(request);
          if (cached) return cached;
          throw error;
        }
      }),
    );
    return;
  }

  if (!STATIC_PATTERN.test(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
