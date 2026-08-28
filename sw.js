/**
 * Jacks or Betterment — service worker
 *
 * The point of offline here is practical: casino floors have poor reception
 * and this is a reference you need standing at a machine.
 *
 * Navigations are network-first so a deploy shows up as soon as there's signal;
 * assets are stale-while-revalidate so the app opens instantly and refreshes
 * itself in the background. Bumping VERSION purges everything.
 */

const VERSION = "b8b72c13";
const CACHE = "job-" + VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=b8b72c13",
  "./js/data.js?v=b8b72c13",
  "./js/poker.js?v=b8b72c13",
  "./js/strategy-engine.js?v=b8b72c13",
  "./js/casinos.js?v=b8b72c13",
  "./js/promo.js?v=b8b72c13",
  "./js/app.js?v=b8b72c13",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: "reload" bypasses the HTTP cache so a precache can't inherit a
      // stale copy. allSettled so one 404 doesn't abort the whole install.
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
