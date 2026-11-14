// SoundDrop Service Worker: offline use after the first visit.
// The app shell is cached on install. Every later request is answered from the
// cache straight away and refreshed from the network in the background, so the
// app opens in airplane mode and still picks up new versions when online.
const CACHE = "sounddrop-v1.1.0";
const SHELL = ["./", "./index.html", "./assets/app.js", "./assets/app.css", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const key = req.mode === "navigate" ? "./index.html" : req;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: req.mode === "navigate" });
      const fresh = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(key, res.clone()); return res; })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
