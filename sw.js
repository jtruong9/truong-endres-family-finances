// Offline support. Keeps a copy of every app file so the app opens with no internet.
// Your financial data is NOT stored here: it stays in the Google Drive folder.
//
// When you change any app file, bump VERSION (and the ?v=N numbers in index.html). That makes
// browsers download the new copy the next time they're online.
const VERSION = "v37";
const CACHE = `truong-finance-${VERSION}`;
const FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./icon.svg",
  "./css/app.css?v=37", "./css/summary.css?v=37",
  "./js/icons.js?v=37", "./js/store.js?v=37", "./js/model.js?v=37", "./js/importers.js?v=37", "./js/app.js?v=37", "./js/help.js?v=37",
  "./js/review.js?v=37", "./js/attention.js?v=37", "./js/reorg.js?v=37", "./js/reorg-ui.js?v=37", "./js/features.js?v=37", "./js/summary.js?v=37", "./js/flow.js?v=37", "./js/app2.js?v=37", "./js/offline.js?v=37",
  "./vendor/chart.umd.min.js", "./vendor/xlsx.full.min.js",
  "./vendor/fonts/inter-400.woff2", "./vendor/fonts/inter-500.woff2", "./vendor/fonts/inter-600.woff2", "./vendor/fonts/inter-700.woff2",
];

self.addEventListener("install", (e) => {
  // Download everything up front; if any file fails, the old version stays in charge
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("truong-finance-") && k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// The page asks to switch to a new version once it's downloaded
self.addEventListener("message", (e) => { if (e.data === "activate-now") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // Page loads: use the network when online (so updates show up), fall back to the saved copy offline
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("./index.html", { ignoreSearch: true })));
    return;
  }
  // Everything else: saved copy first (fast, works offline), network if it's not saved
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
