// SoundDrop Service Worker: offline use after the first visit.
// Network first: when online, every request goes to the network so the newest
// version always loads, and a copy is saved. When the network is unavailable
// (airplane mode), the saved copy is used instead.
const CACHE = "sounddrop-v1.2.1";
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
    caches.open(CACHE).then((cache) =>
      fetch(req)
        .then((res) => { if (res && res.ok) cache.put(key, res.clone()); return res; })
        .catch(() => cache.match(key, { ignoreSearch: req.mode === "navigate" }).then((hit) => hit || Response.error()))
    )
  );
});
