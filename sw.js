/* Бортик — оффлайн-оболочка.
   Страница должна открываться у бортика даже без связи. */

var CACHE = "bortik-shell-v1";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fromNetworkThenCache(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || caches.match("./index.html");
    });
  });
}

function fromCacheThenNetwork(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && (res.ok || res.type === "opaque")) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Данные никогда не кешируем: всегда живой ответ или честная ошибка.
  if (url.hostname.indexOf("supabase") >= 0) return;

  // Шрифты держим в кеше — без них страница выглядит сломанной.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(fromCacheThenNetwork(req));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Саму страницу берём свежую, если есть сеть, иначе из кеша.
  if (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/")) {
    e.respondWith(fromNetworkThenCache(req));
    return;
  }

  e.respondWith(fromCacheThenNetwork(req));
});
