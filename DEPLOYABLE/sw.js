const CACHE = 'edsora-shell-v1';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const u = new URL(event.request.url);
  if (event.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/webhook/')) return;
  if (u.pathname === '/' || u.pathname === '/index.html') event.respondWith(fetch(event.request).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put('/', r.clone())); return r; }).catch(() => caches.match('/')));
  else if (SHELL.includes(u.pathname)) event.respondWith(caches.match(event.request).then(r => r || fetch(event.request)));
});
