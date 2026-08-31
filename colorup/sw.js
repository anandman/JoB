/**
 * Color Up — service worker
 *
 * Offline is not a nicety here. A session is logged at the machine, and a
 * casino floor is the one place a phone reliably has no signal; a ledger that
 * cannot be written when you stand up is a ledger you will not keep.
 *
 * Navigations are network-first so a deploy appears as soon as there is a
 * signal; assets are served from cache and refreshed behind you. Bumping
 * VERSION purges everything.
 */

const VERSION = "63b1c6eb";
const CACHE = "colorup-" + VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=63b1c6eb",
  "./js/xlsx.js?v=63b1c6eb",
  "./js/store.js?v=63b1c6eb",
  "./js/export.js?v=63b1c6eb",
  "./js/analysis.js?v=63b1c6eb",
  "./js/dropbox.js?v=63b1c6eb",
  "./js/app.js?v=63b1c6eb",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: "reload" bypasses the HTTP cache so a precache cannot inherit a
      // stale copy. allSettled so one 404 does not abort the whole install.
      .then((c) => Promise.allSettled(
        SHELL.map((u) => c.add(new Request(u, { cache: "reload" })))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
