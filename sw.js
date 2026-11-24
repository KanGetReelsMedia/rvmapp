// RVM Premium Service Worker v13 - Offline + Push Ready
// - Cache-first for app shell, network-first for live data
// - No caching of live / dynamic endpoints
// - Safe Firebase load (app still works offline if FCM fails to load)
// - Single push path, no duplicate notifications

const CACHE_NAME = 'rvm-premium-v13';
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

// Live data - NEVER cache these, always try network first
const NO_CACHE_PATTERNS = [
  'firebaseio.com',
  'firestore.googleapis.com',
  'googleapis.com',
  'open-meteo.com'
];

const isNoCache = (url) => NO_CACHE_PATTERNS.some(h => url.hostname.includes(h));

// --- Push setup: wrapped so a failed importScripts doesn't kill the SW ---
let messaging = null;
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: "AIzaSyCRDkusyC05EzBiT8ZBj8JpZd8E5qVd-4g",
    authDomain: "rvm-software-manifest.firebaseapp.com",
    databaseURL: "https://rvm-software-manifest-default-rtdb.firebaseio.com",
    projectId: "rvm-software-manifest",
    storageBucket: "rvm-software-manifest.appspot.com",
    messagingSenderId: "1096220577213",
    appId: "1:1096220577213:web:8c9a0f8f1a2b3c4d5e6f7a"
  });
  messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'River Valley Metro';
    const options = {
      body: payload.notification?.body || payload.data?.body || payload.data?.message || 'New alert from Dispatch',
      icon: '/rvmapp/icon-192.png',
      badge: '/rvmapp/icon-192.png',
      vibrate: [200, 100, 200],
      tag: payload.data?.tag || 'rvm-alert',
      renotify: true,
      data: { url: payload.data?.url || '/rvmapp/status.html', dateOfArrival: Date.now() }
    };
    // Return the promise so the SW stays alive until it shows
    return self.registration.showNotification(title, options);
  });
} catch (e) {
  console.warn('[SW] Push init skipped, offline still works:', e);
}

// --- INSTALL: cache shell, fail gracefully if one file 404s ---
self.addEventListener('install', event => {
  console.log('[SW] Installing v13...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // addAll fails entirely if 1 file fails - add individually instead
      await Promise.allSettled(CORE_ASSETS.map(url => cache.add(url).catch(err => console.warn('[SW] Skip cache:', url, err))));
    }).then(() => self.skipWaiting())
  );
});

// --- ACTIVATE: clean old caches, take control ---
self.addEventListener('activate', event => {
  console.log('[SW] Activating v13...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// --- FETCH ---
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1. Live data: network-first, cache only as last-resort fallback, never store
  if (isNoCache(url)) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // 2. Navigations: network-first so passengers never see a stale alert page,
  //    fall back to cached page, then offline page
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE_URL)))
    );
    return;
  }

  // 3. Same-origin static assets: stale-while-revalidate (fast + fresh next time)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 4. Other cross-origin GETs: network-first, no cache write
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

// --- Generic Web Push (only fires when NOT handled by FCM) ---
self.addEventListener('push', event => {
  // If FCM handled it, this won't fire separately. This is the fallback path.
  let data = { title: 'RVM Alert', body: 'New system alert' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    data = { title: 'River Valley Metro', body: event.data ? event.data.text() : 'Check app' };
  }
  const options = {
    body: data.body || data.message || 'Check app for updates',
    icon: '/rvmapp/icon-192.png',
    badge: '/rvmapp/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'rvm-alert',
    renotify: true,
    data: { url: data.url || '/rvmapp/status.html', dateOfArrival: Date.now() }
  };
  event.waitUntil(self.registration.showNotification(data.title || 'River Valley Metro', options));
});

// --- Notification click: focus existing tab if open, else open new ---
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/rvmapp/index.html', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          // Only navigate if it's already on our origin - avoids hijacking other tabs
          if (new URL(client.url).origin === self.location.origin) {
            client.navigate(target);
            return client.focus();
          }
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'rvm-sync-alerts') {
    event.waitUntil(
      fetch('/rvmapp/manifest.json', { cache: 'no-store' })
        .then(() => console.log('[SW] Background sync ok'))
        .catch(err => console.warn('[SW] Background sync failed:', err))
    );
  }
});
