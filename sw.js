const CACHE = 'replog-v22';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './coach-rep.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ── PUSH NOTIFICATIONS ──────────────────────────────────────────
self.addEventListener('push', e => {
  if(!e.data) return;
  try {
    const data = e.data.json();
    const options = {
      body: data.body || '',
      icon: data.icon || './icon-192.png',
      badge: data.badge || './icon-192.png',
      vibrate: [200, 100, 200],
      data: data.data || {},
      actions: data.actions || []
    };
    e.waitUntil(self.registration.showNotification(data.title || 'RepLog', options));
  } catch(err) {
    const text = e.data.text();
    e.waitUntil(self.registration.showNotification('RepLog', { body: text, icon: './icon-192.png' }));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({type:'window'}).then(clientList => {
    for(const client of clientList){
      if(client.url.includes('replog') && 'focus' in client) return client.focus();
    }
    if(clients.openWindow) return clients.openWindow(url);
  }));
});
