// Offline support: cache the app shell, serve it when there's no signal.
// Bump VERSION whenever app files change so phones pick up the new copy.
const VERSION = 'v52';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/athlete.js', 'js/coach.js', 'js/calc.js', 'js/config.js', 'js/seed.js',
  'js/store.js', 'js/summary.js', 'js/sync.js', 'js/templates.js', 'js/ui.js', 'js/progression.js', 'js/video.js',
  'js/libimport.js', 'js/library.js', 'js/plan.js', 'js/timer.js', 'js/countdown.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first for app files (so updates show up), cache when offline.
// Gym signal is often "connected but crawling": if the network hasn't
// answered within SLOW_MS and there's a saved copy, use the saved copy
// (the download carries on and refreshes the cache for next time).
// Supabase API calls are never cached.
const SLOW_MS = 3000;
const CACHED_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;
  let stored = null;
  const net = fetch(e.request).then((res) => {
    if (res.ok && (url.origin === location.origin || CACHED_HOSTS.includes(url.hostname))) {
      const copy = res.clone();
      stored = caches.open(VERSION).then((c) => c.put(e.request, copy));
    }
    return res;
  });
  // Keep the worker alive until the fresh copy is saved, even if the saved copy answered first.
  e.waitUntil(net.then(() => stored).catch(() => {}));
  // Only a page load may fall back to the app's start page; a missing script or
  // picture shouldn't be answered with HTML.
  const saved = () => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined));
  e.respondWith(new Promise((resolve, reject) => {
    let settled = false;
    const done = (r) => { if (!settled && r) { settled = true; resolve(r); } };
    const timer = setTimeout(() => saved().then(done), SLOW_MS);
    net.then((r) => { clearTimeout(timer); done(r); }, () => {
      clearTimeout(timer);
      saved().then((r) => { if (r) done(r); else if (!settled) { settled = true; reject(new TypeError('offline')); } });
    });
  }));
});
