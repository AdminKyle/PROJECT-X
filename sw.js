const CACHE_NAME = 'pixl-pwa-v14';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './sync.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Don't cache POST requests or external API calls dynamically here, 
  // they are handled by IndexedDB sync queue.
  if (event.request.method !== 'GET') return;

  // CRITICAL: Let ALL Google Apps Script requests pass through to the network
  // without ANY service worker interception. The SW was consuming/blocking
  // the logFlavor beacon requests, preventing data from reaching the sheet.
  if (event.request.url.includes('script.google.com') || 
      event.request.url.includes('script.googleusercontent.com')) {
      return; // Do NOT call event.respondWith — let the browser handle it natively
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          response => {
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return response;
          }
        );
      })
  );
});
