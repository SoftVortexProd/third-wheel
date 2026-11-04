/* Third Wheel service worker: lets the app install, opens instantly, and shows push notifications.
   Nothing from /api is ever cached (messages and files stay private and fresh); only the app's own scripts, styles and icons are kept for offline start. */
const CACHE = 'tw-shell-v1';
const SHELL = ['/', '/index.html', '/icon.svg', '/icon-192.png', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;   // the network handles everything else
  // network first (so updates show up straight away), the saved copy when you're offline
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});

self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { /* plain text */ }
  e.waitUntil((async () => {
    // if you're already looking at the app, the app itself shows it: skip the system notification
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(d.title || 'Third Wheel', {
      body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/#/feed' }
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '/#/feed', location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if ('focus' in w) { await w.focus(); try { await w.navigate(target); } catch { /* same page */ } return; } }
    await self.clients.openWindow(target);
  })());
});
