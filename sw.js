// RVM Premium Service Worker - Meets PWA definition:
// "Service Workers sit between your web app and the network. They are intended to enable the creation of effective offline experiences, intercept network requests, and take appropriate action based on whether the network is available. They also allow access to push notifications and background sync APIs."

const CACHE_NAME = 'rvm-premium-v10';
const OFFLINE_URL = './index.html';
const CORE_ASSETS = [
  './',
  './index.html',
  './status.html',
  './midway.html',
  './notices.html',
  './passes.html',
  './weather.html',
  './map.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// INSTALL - cache core assets for offline
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ACTIVATE - clean old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH - intercept network requests, network-first for APIs, cache-first for assets
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // API calls - network first, fallback to cache
  if (url.hostname.includes('open-meteo.com') || url.hostname.includes('firebaseio.com') || url.hostname.includes('gstatic.com')) {
    event.respondWith(
      fetch(req).then(res => {
        // cache successful API responses
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // App shell - cache first, then network, then offline page
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(networkRes => {
        // Cache new assets on the fly
        if (networkRes.ok && req.method === 'GET' && url.origin === self.location.origin) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return networkRes;
      }).catch(() => {
        // Offline fallback
        if (req.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

// PUSH NOTIFICATIONS - for dispatch alerts
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'RVM Alert', body: 'New system alert' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'River Valley Metro', {
      body: data.body || data.message || 'Check app for updates',
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: './status.html' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data.url || './index.html');
    })
  );
});

// BACKGROUND SYNC - retry failed alert posts when back online
self.addEventListener('sync', event => {
  if (event.tag === 'rvm-sync-alerts') {
    event.waitUntil(
      // placeholder - will sync when back online
      fetch('./manifest.json').then(() => console.log('[SW] Background sync done'))
    );
  }
});
