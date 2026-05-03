/* DBSC Race Course – service worker
 * Cache-first for the static app shell so it works fully offline.
 * Network-first for data.json so simple data tweaks pushed to GitHub
 * appear on next online launch without bumping anything.
 *
 * Bump CACHE_VERSION when index.html / app.js / styles.css / data.js
 * change so installed phones reload the shell.
 */
const CACHE_VERSION = "dbsc-v7";
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

    const url = new URL(req.url);
    const isData = url.pathname.endsWith("/data.json") || url.pathname.endsWith("data.json");
    const isSchedule = url.pathname.endsWith("/schedule.json") || url.pathname.endsWith("schedule.json");

    if (isData || isSchedule) {
        const fallbackPath = isSchedule ? "./schedule.json" : "./data.json";
        // Network-first: try the network, fall back to cache when offline.
        event.respondWith(
            fetch(req, { cache: "no-store" })
                .then((res) => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_VERSION).then((c) => c.put(fallbackPath, clone));
                    }
                    return res;
                })
                .catch(() => caches.match(fallbackPath))
        );
        return;
    }

    // Everything else: cache-first.
    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req)
                .then((res) => {
                    if (res && res.status === 200 && url.origin === self.location.origin) {
                        const clone = res.clone();
                        caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
                    }
                    return res;
                })
                .catch(() => caches.match("./index.html"));
        })
    );
});
