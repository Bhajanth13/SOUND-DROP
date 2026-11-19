// SoundDrop Service Worker: lets the app open with no internet.
// Network first: when online the newest version loads and a copy is saved;
// when offline (airplane mode) the saved copy is used.
const CACHE = "sounddrop-v4";                    // change the name to replace old saved copies
const FILES = ["./", "./index.html", "./assets/app.js", "./assets/app.css", "./icon.svg", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

// install: save every file of the app
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

// activate: delete copies saved by older versions
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// fetch: try the network, fall back to the saved copy
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === "navigate" ? "./index.html" : req;      // every page load is index.html
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put(key, copy)); }
        return res;
      })
      .catch(() => caches.match(key, { ignoreSearch: true }))
  );
});
