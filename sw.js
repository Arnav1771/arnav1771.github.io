/* Portfolio service worker: network first, cache fallback for offline.
   This address also serves other sites (/arcade/, /galleries/, project pages), and
   caches are shared by the whole address: so it only touches its own pages and only
   clears its own old caches. */
const PREFIX = 'arnav-portfolio-root-';
const CACHE = PREFIX + 'v1';
const BASE = new URL('./', self.location).pathname;          // "/" or "/Arnav_Bhargava/"
const OWN = ['', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'].map((f) => BASE + f);
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin || !OWN.includes(u.pathname)) return;  // not ours: leave it alone
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const clone = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, clone)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match(BASE + 'index.html')))
  );
});
