// RVM Premium Service Worker v12 - Offline + FCM Push Ready
const CACHE_NAME = 'rvm-premium-v12';
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

// Import Firebase for background push
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

const messaging = firebase.messaging();

// FCM Background Handler - when app is CLOSED
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] FCM Background:', payload);
  const title = payload.notification?.title || payload.data?.title || 'River Valley Metro';
  const options = {
    body: payload.notification?.body || payload.data?.body || payload.data?.message || 'New alert from Dispatch',
    icon: '/rvmapp/icon-192.png',
    badge: '/rvmapp/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: payload.data?.url || '/rvmapp/status.html' }
  };
  self.registration.showNotification(title, options);
});

// INSTALL
self.addEventListener('install', event => {
  console.log('[SW] Installing v12...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

// ACTIVATE
self.addEventListener('activate', event => {
  console.log('[SW] Activating v12...');
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// FETCH - Your existing logic
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

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

  event.respondWith(
    caches.match(req).then(cachedRes => {
      const fetchPromise = fetch(req).then(networkRes => {
        if (networkRes.ok && url.origin === self.location.origin) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return networkRes;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match(OFFLINE_URL);
      });
      return cachedRes || fetchPromise;
    })
  );
});

// Generic Web Push (fallback)
self.addEventListener('push', event => {
  let data = { title: 'RVM Alert', body: 'New system alert' };
  try { if (event.data) data = event.data.json(); } catch (e) { data.body = event.data ? event.data.text() : 'Check app'; }
  const options = {
    body: data.body || data.message || 'Check app for updates',
    icon: '/rvmapp/icon-192.png',
    badge: '/rvmapp/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/rvmapp/status.html' }
  };
  event.waitUntil(self.registration.showNotification(data.title || 'River Valley Metro', options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data.url || '/rvmapp/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus(); client.navigate(targetUrl); return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'rvm-sync-alerts') {
    event.waitUntil(fetch('/rvmapp/manifest.json').then(() => console.log('[SW] Background sync ok')));
  }
});
  }
});
