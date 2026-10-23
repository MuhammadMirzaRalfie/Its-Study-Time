// Service worker: bikin Study Timer bisa di-install dan tetap jalan offline.
//
// File aplikasi pakai "network dulu": selama server jalan, selalu ambil versi terbaru
// (jadi perubahan langsung kelihatan), dan salinan di cache hanya dipakai saat offline
// atau server mati. Karena itu CACHE tidak perlu dinaikkan tiap kali kode berubah,
// cukup kalau daftar SHELL di bawah berubah.

const CACHE = 'study-timer-v1';
const FONT_CACHE = 'study-timer-fonts';

const SHELL = [
  './',
  'index.html',
  'style.css',
  'manifest.json',
  'js/util.js',
  'js/audio.js',
  'js/clock.js',
  'js/media.js',
  'js/progress.js',
  'js/pip.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('index.html');
    throw new Error('offline');
  }
}

// Font Google jarang berubah: pakai cache dulu, ambil dari internet kalau belum ada.
async function cacheFirst(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const { request: req } = e;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(networkFirst(req));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(cacheFirst(req));
  // Selain itu (YouTube, background dari link) dibiarkan lewat seperti biasa.
});
