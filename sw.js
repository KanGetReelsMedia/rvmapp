const CACHE_NAME = 'rvm-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjBRXORehZGVAUiu8vzUjk_Jli1YGIERGWwA&s'
];

// Install Event: Saves the files into the phone's storage
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('RVM Service Worker: Caching Files');
      return cache.addAll(ASSETS);
    })
  );
});

// Activate Event: Cleans up old versions of the app
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// Fetch Event: Serves files from cache if offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
