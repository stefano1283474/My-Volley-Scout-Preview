// Service Worker per My Volley Scout PWA
const IS_LOCAL = (self && self.location && (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1'));
const CACHE_NAME = 'my-volley-scout-v14.2.4';
const urlsToCache = [
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

 // Installazione Service Worker
self.addEventListener('install', (event) => {
  if (IS_LOCAL) {
    event.waitUntil(Promise.resolve());
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aperto');
        return cache.addAll(urlsToCache);
      })
  );
});

 // Attivazione Service Worker
self.addEventListener('activate', (event) => {
  if (IS_LOCAL) {
    event.waitUntil(Promise.resolve());
    return;
  }
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Cache vecchia rimossa:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

 // Intercettazione richieste
self.addEventListener('fetch', (event) => {
  if (IS_LOCAL) {
    return; // Non intercettare nulla in locale
  }
  const req = event.request;
  const url = new URL(req.url);

   // Evita di interferire con eventuali endpoint HMR/dev server (es. Vite)
   if (url.pathname.startsWith('/@vite')) return;

   // Network-first per navigazioni/HTML: non mettere in cache i documenti HTML
   if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
     event.respondWith(
       fetch(req)
         .then((response) => {
           return response; // non cache HTML
         })
         .catch(async () => {
           const cached = await caches.match(req);
           return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
         })
     );
     return;
   }

   // Cache-first per altri asset statici
   event.respondWith(
     caches.match(req).then((cached) => {
       if (cached) return cached;
       return fetch(req).then((response) => {
         if (!response || response.status !== 200 || response.type !== 'basic') {
           return response;
         }
         const respClone = response.clone();
         caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
         return response;
       });
     })
   );
 });

 // Gestione messaggi per sincronizzazione offline
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
