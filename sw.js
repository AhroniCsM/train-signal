/* Train Signal Mapper service worker */
var SHELL = 'ts-shell-v3';
var TILES = 'ts-tiles-v1';
var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then(function(c){
    // cache best-effort; don't fail install if a CDN file is unreachable
    return Promise.all(SHELL_FILES.map(function(u){
      return c.add(u).catch(function(){});
    }));
  }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){
      if(k!==SHELL && k!==TILES) return caches.delete(k);
    }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method!=='GET') return;
  var url = new URL(req.url);

  // Map tiles: cache-first, and store new tiles as you ride through covered areas
  if(/tile\.openstreetmap\.org/.test(url.host)){
    e.respondWith(
      caches.open(TILES).then(function(c){
        return c.match(req).then(function(hit){
          if(hit) return hit;
          return fetch(req).then(function(res){
            if(res && res.status===200) c.put(req, res.clone());
            return res;
          }).catch(function(){ return hit; });
        });
      })
    );
    return;
  }

  // Never cache the connectivity-check pings — they must hit the network live
  if(/generate_204|cdn-cgi\/trace|google\.com\/favicon/.test(req.url)) return;

  // HTML / navigation: NETWORK-FIRST so new deploys always reach the device when online,
  // falling back to cache only when offline (so dead-zone reloads still work).
  var isHTML = req.mode==='navigate'
    || (req.headers.get('accept')||'').indexOf('text/html')>=0
    || /\.html$/.test(url.pathname)
    || url.pathname.charAt(url.pathname.length-1)==='/';
  if(isHTML){
    e.respondWith(
      fetch(req).then(function(res){
        if(res && res.status===200){
          var copy=res.clone();
          caches.open(SHELL).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){
        return caches.match(req).then(function(h){ return h || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Other assets (Leaflet js/css, manifest): cache-first, fall back to network
  e.respondWith(
    caches.match(req).then(function(hit){
      return hit || fetch(req).then(function(res){
        if(res && res.status===200 && (url.origin===location.origin || /unpkg\.com/.test(url.host))){
          var copy=res.clone();
          caches.open(SHELL).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    }).catch(function(){ return caches.match('./index.html'); })
  );
});
