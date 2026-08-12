try {
  importScripts("/precache-manifest.js");
} catch {
  // The checked-in development manifest is intentionally optional; production builds always
  // generate it and the build fails if no application assets were discovered.
}

const CACHE_NAME = `backlog-${self.__BACKLOG_CACHE_VERSION ?? "fallback-v5"}`;

/**
 * Caching strategy, per request kind.
 *
 * The load-bearing detail is how vinext navigates: every in-app navigation (including back/
 * forward) fetches an RSC payload at `/<path>.rsc?<hash>`, and if that fetch *rejects* the router
 * falls back to `window.location.href = target` — a hard browser navigation. Offline that means
 * the browser's own "no connection" page, and the app is gone. So both navigations and `.rsc`
 * requests must be served from cache when the network is unavailable.
 *
 * Those `.rsc` URLs are safe to key by URL alone: vinext appends a SHA-256 of the request headers
 * that would otherwise vary the response (see app-rsc-cache-busting.js), so the URL already
 * encodes the variation the Cache API can't see.
 *
 * Everything here is network-first except content-hashed `/assets/*`, so a redeploy is picked up
 * immediately and the cache only ever acts as an offline fallback. An earlier version served
 * navigations cache-first, which pinned stale HTML pointing at since-replaced asset hashes and
 * blanked the screen.
 */
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon.png",
  "/icons/logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  ...(self.__BACKLOG_PRECACHE ?? []),
].filter((url, index, all) => all.indexOf(url) === index);

const isImmutableAsset = (pathname) => pathname.startsWith("/assets/");
const isRscRequest = (url) => url.pathname.endsWith(".rsc");
const isStaticAsset = (pathname) =>
  /^\/(icons\/|favicon\.(?:ico|png)$|manifest\.webmanifest$|og\.png$)/.test(pathname) || pathname.endsWith(".svg");

/** Only store responses that are actually replayable. */
const isCacheable = (response) => response && response.ok && !response.redirected && response.type !== "opaqueredirect";

self.addEventListener("install", (event) => {
  // Install atomically. If any hashed application asset is unavailable, the previous worker and
  // its known-good cache remain active instead of publishing a partially usable offline build.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Every match here ignores `Vary`. The server sends a deliberately wide one on documents and RSC
 * payloads (`RSC, Accept, Next-Router-*, X-Vinext-*`), so an exact-match lookup misses whenever a
 * replayed request's headers differ even slightly from the one that populated the cache — which
 * offline means falling through to the browser's error page despite holding the page. Ignoring it
 * is sound because the URL alone already identifies the content: RSC payloads live in their own
 * `.rsc` URL space, and vinext hashes precisely those varying headers into their query string.
 */
const MATCH = { ignoreVary: true };

/** Network-first documents retain fresh metadata online; the route-independent root document is
 * the final offline fallback. ClientRouter reads the real address after hydration, so the shell
 * and address bar remain consistent even for a route that has never been opened before. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) await cache.put(request, response.clone());
    else if (response.status >= 500) {
      const fallback = await cache.match(request, MATCH);
      if (fallback) return fallback;
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, MATCH);
    if (cached) return cached;
    // Every document contains the same client router. Replaying the root document under the
    // requested URL is therefore safe: after hydration it renders directly from location.
    if (request.mode === "navigate") {
      const shell = await cache.match("/", MATCH);
      if (shell) return shell;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, MATCH);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // React Query owns API data (persisted to IndexedDB); caching it here would serve two sources
  // of truth that can disagree.
  if (url.pathname.startsWith("/api/")) return;

  // Documents and the RSC payloads the router fetches for every navigation.
  if (request.mode === "navigate" || isRscRequest(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isImmutableAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(networkFirst(request));
  }
});
