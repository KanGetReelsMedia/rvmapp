// RVM Premium Service Worker - Optimized for Reliability & Offline Performance
const CACHE_NAME = 'rvm-premium-v11';
const OFFLINE_URL = '/rvmapp/index.html';
const CORE_ASSETS = [
  '/rvmapp/',
  '/rvmapp/index.html',
  '/rvmapp/status.html',
  '/rvmapp/midway.html',
  '/rvmapp/notices.html',
  '/rvmapp/passes.html',
  '/rvmapp/weather.html',
  '/rvmapp/map.html',
  '/rvmapp/manifest.json',
  '/rvmapp/icon-192.png',
  '/rvmapp/icon-512.png'
];

// INSTALL - Cache core assets for offline usage
self.addEventListener('install', event => {
  console.log('[SW] Installing new version...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ACTIVATE - Clean up old cache versions safely
self.addEventListener('activate', event => {
  console.log('[SW] Activating and cleaning old caches...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH - Intercept requests with targeted strategies
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests
  if (req.method !== 'GET') return;

  // 1. External APIs (Weather, Firebase, CDNs) - Network First, fallback to Cache
  if (url.hostname.includes('open-meteo.com') || url.hostname.includes('firebaseio.com') || url.hostname.includes('gstatic.com') || url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 2. App Shell & Local Assets - Stale-While-Revalidate / Cache First with background update
  event.respondWith(
    caches.match(req).then(cachedRes => {
      const fetchPromise = fetch(req).then(networkRes => {
        if (networkRes.ok && url.origin === self.location.origin) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return networkRes;
      }).catch(() => {
        // Fallback if offline and asset not in cache
        if (req.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });

      return cachedRes || fetchPromise;
    })
  );
});

// PUSH NOTIFICATIONS - Handle real-time dispatch alerts
self.addEventListener('push', event => {
  let data = { title: 'RVM Alert', body: 'New system alert' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    data.body = event.data ? event.data.text() : 'Check app for updates';
  }

  const options = {
    body: data.body || data.message || 'Check app for updates',
    icon: '/rvmapp/icon-192.png',
    badge: '/rvmapp/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/rvmapp/status.html' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'River Valley Metro', options)
  );
});

// NOTIFICATION CLICK - Bring app to focus or open relevant page
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data.url || '/rvmapp/index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// BACKGROUND SYNC - Retry pending network operations when connection returns
self.addEventListener('sync', event => {
  if (event.tag === 'rvm-sync-alerts') {
    event.waitUntil(
      fetch('/rvmapp/manifest.json').then(() => console.log('[SW] Background sync completed successfully'))
    );
  }
});
