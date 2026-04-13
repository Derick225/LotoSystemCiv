
const CACHE_NAME = 'lotopro-v2.2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-icon.svg'
];

// Installation : Mise en cache du squelette de l'application (App Shell)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
          console.warn('SW Install: Some assets failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

// Activation : Nettoyage des vieux caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interception des requêtes
self.addEventListener('fetch', (event) => {
  // On ignore les requêtes non-GET et les appels API/Supabase (gérés par le code app)
  if (event.request.method !== 'GET') return;
  
  // Guard clause for invalid URLs
  if (!event.request.url) return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch (error) {
    return; // Ignore invalid URLs
  }
  
  // Exclure les requêtes vers l'API externe ou Supabase du cache SW 
  // (L'app utilise IndexedDB pour les données, on ne veut pas doubler avec le Cache Storage API ou servir de la vieille data)
  if (url.origin !== self.location.origin) {
      return;
  }

  // Stratégie pour les fichiers statiques (JS, CSS, Images)
  // Stale-While-Revalidate: On sert depuis le cache si possible, mais on met à jour en arrière-plan.
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|json|woff2)$/) && !url.pathname.includes('manifest')) {
      event.respondWith(
          caches.open(CACHE_NAME).then(cache => {
              return cache.match(event.request).then(response => {
                  const fetchPromise = fetch(event.request).then(networkResponse => {
                      if (networkResponse.ok) {
                          cache.put(event.request, networkResponse.clone());
                      }
                      return networkResponse;
                  });
                  return response || fetchPromise;
              });
          })
      );
      return;
  }

  // Stratégie pour la navigation (HTML)
  // Network First : On essaie le réseau pour avoir la dernière version, sinon fallback cache
  if (event.request.mode === 'navigate') {
      event.respondWith(
          fetch(event.request)
              .then(response => {
                  const responseClone = response.clone();
                  caches.open(CACHE_NAME).then(cache => {
                      cache.put('/index.html', responseClone);
                  });
                  return response;
              })
              .catch(() => {
                  return caches.match('/index.html');
              })
      );
      return;
  }
});
