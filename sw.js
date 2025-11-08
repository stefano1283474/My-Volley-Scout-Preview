// Service Worker per My Volley Scout PWA
const CACHE_NAME = 'my-volley-scout-v4';
const urlsToCache = [
  // Precache solo asset statici necessari e sicuri
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/index.html' // per fallback offline su navigazioni
];

 // Installazione Service Worker
 self.addEventListener('install', (event) => {
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
           // Fallback: prova la cache, altrimenti una index di root se presente
           return cached || caches.match('/index.html');
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