/* DBSC Race Course – service worker
 * Cache-first strategy for the small set of static files so the app
 * works fully offline once it has been opened with signal at least once.
 *
 * Bump CACHE_VERSION whenever data.js or the app changes so users get the
 * new version. The app also reloads itself when a new SW takes control.
 */
const CACHE_VERSION = "dbsc-v1";
const CORE = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./data.js",
    "./manifest.webmanifest",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-512-maskable.png",
    "./icons/apple-touch-icon.png",
    "./icons/favicon-64.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;

    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req)
                .then((res) => {
                    // Cache same-origin successful responses opportunistically.
                    if (res && res.status === 200 && new URL(req.url).origin === self.location.origin) {
                        const clone = res.clone();
                        caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
                    }
                    return res;
                })
                .catch(() => caches.match("./index.html"));
        })
    );
});
