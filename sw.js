const CACHE = 'replog-v39';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './coach-rep.png'];

self.addEventListener('install', e => {
  // Delete ALL old caches on install
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => caches.open(CACHE).then(c => c.addAll(ASSETS)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
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

self.addEventListener('push', e => {
  if(!e.data) return;
  try {
    const data = e.data.json();
    e.waitUntil(self.registration.showNotification(data.title || 'RepLog', {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200],
      data: data.data || {}
    }));
  } catch(err) {
    e.waitUntil(self.registration.showNotification('RepLog', { body: e.data.text(), icon: './icon-192.png' }));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window'}).then(clientList => {
    for(const client of clientList){
      if(client.url.includes('replog') && 'focus' in client) return client.focus();
    }
    if(clients.openWindow) return clients.openWindow('./');
  }));
});
