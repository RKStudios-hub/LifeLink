/* ==========================================================================
   LifeLink service worker — offline-first app shell
   Same-origin assets are cached on first use, so the whole app (including
   the hospital dataset) keeps working with no connection.
   Tile and routing requests are left to the network: they degrade gracefully
   in the UI instead of serving stale map imagery.
   ========================================================================== */

var CACHE = 'lifelink-v8';

var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/data.js',
  './js/util.js',
  './js/map.js',
  './js/screens.js',
  './js/app.js',
  './data/hospitals.json',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/fonts/inter.css',
  './vendor/fonts/inter-latin-wght-normal.woff2',
  './vendor/fonts/inter-latin-ext-wght-normal.woff2',
  './vendor/fontawesome/css/fontawesome.min.css',
  './vendor/fontawesome/css/solid.min.css',
  './vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './icons/icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        return Promise.all(PRECACHE.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  /* Map tiles + routing: network only, never cached. */
  if (url.hostname.indexOf('tile.openstreetmap.org') !== -1 ||
      url.hostname.indexOf('tile.openstreetmap.fr') !== -1 ||
      url.hostname.indexOf('basemaps.cartocdn.com') !== -1 ||
      url.hostname.indexOf('router.project-osrm.org') !== -1 ||
      url.hostname.indexOf('fonts.gstatic.com') !== -1 ||
      url.hostname.indexOf('fonts.googleapis.com') !== -1) {
    return;
  }

  /* Same-origin (app shell, dataset, vendored libs): cache first. */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: false }).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') {
            var copy = res.clone();
            caches.open(CACHE).then(function (cache) { cache.put(req, copy); }).catch(function () {});
          }
          return res;
        }).catch(function () {
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          throw new Error('Offline and not cached: ' + req.url);
        });
      })
    );
    return;
  }

  /* Anything else (GitHub links etc.): normal browser handling. */
});
