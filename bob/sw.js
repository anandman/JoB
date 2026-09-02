/**
 * Bettor or Bust — service worker
 *
 * Scoped to /bob/, so this app's cache is entirely its own: installing it
 * doesn't pull in Jacks or Bettor, and a deploy of one doesn't invalidate
 * the other.
 *
 * Navigations are network-first so a deploy shows up as soon as there's signal;
 * assets are stale-while-revalidate so the app opens instantly and refreshes
 * itself in the background. Bumping VERSION purges everything.
 */

const VERSION = "64f10ee4";
const CACHE = "bob-" + VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=64f10ee4",
  "./js/rules.js?v=64f10ee4",
  "./js/engine.js?v=64f10ee4",
  "./js/strategy.js?v=64f10ee4",
  "./js/analyzer.js?v=64f10ee4",
  "./js/game.js?v=64f10ee4",
  "./js/risk.js?v=64f10ee4",
  "./js/app.js?v=64f10ee4",
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
