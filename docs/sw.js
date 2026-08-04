const CACHE_VERSION = "dbsc-v69";

const CORE = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./data.js",
    "./regatta-data.js",
    "./manifest.webmanifest",
    "./tides.json",
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

function isLiveJson(pathname) {
    return pathname.endsWith("/data.json")
        || pathname.endsWith("data.json")
        || pathname.endsWith("/schedule.json")
        || pathname.endsWith("schedule.json")
        || pathname.endsWith("/tides.json")
        || pathname.endsWith("tides.json");
}
function isPdf(pathname) {
    return pathname.toLowerCase().endsWith(".pdf");
}

// Compare two Response objects by their ETag, then by Last-Modified.
// Returns true only when we have signals on both sides AND they differ.
function responsesDiffer(a, b) {
    if (!a || !b) return false;
    const ae = a.headers.get("etag");
    const be = b.headers.get("etag");
    if (ae && be) return ae !== be;
    const al = a.headers.get("last-modified");
    const bl = b.headers.get("last-modified");
    if (al && bl) return al !== bl;
    return false;
}

async function notifyUpdateAvailable() {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    clients.forEach((c) => c.postMessage({ type: "update-available" }));
}

function staleWhileRevalidate(event, req) {
    event.respondWith(
        caches.open(CACHE_VERSION).then(async (cache) => {
            const cached = await cache.match(req);
            const network = fetch(req)
                .then(async (res) => {
                    if (res && res.status === 200 && (new URL(req.url)).origin === self.location.origin) {
                        // Only flag an update if the file actually changed compared to
                        // the version we just served from cache.
                        if (cached && responsesDiffer(cached, res)) {
                            notifyUpdateAvailable();
                        }
                        cache.put(req, res.clone());
                    }
                    return res;
                })
                .catch(() => null);
            return cached || (await network) || cache.match("./index.html");
        })
    );
}

function networkFirst(event, req, fallbackPath) {
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
}

function cacheFirst(event, req) {
    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req).then((res) => {
                if (res && res.status === 200 && (new URL(req.url)).origin === self.location.origin) {
                    const clone = res.clone();
                    caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
                }
                return res;
            }).catch(() => caches.match("./index.html"));
        })
    );
}

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);

    if (isLiveJson(url.pathname)) {
        let fallbackPath = "./data.json";
        if (url.pathname.endsWith("schedule.json")) fallbackPath = "./schedule.json";
        else if (url.pathname.endsWith("tides.json")) fallbackPath = "./tides.json";
        return networkFirst(event, req, fallbackPath);
    }

    if (isPdf(url.pathname)) {
        return cacheFirst(event, req);
    }

    if (url.origin === self.location.origin) {
        return staleWhileRevalidate(event, req);
    }
});
