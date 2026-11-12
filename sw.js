// Service worker: o app inteiro funciona offline depois da primeira carga (exceto a busca).
// Ao editar qualquer arquivo do app, troque VERSION (estante-v2, v3...) para os aparelhos baixarem de novo.

const VERSION = "estante-v1";
const API_CACHE = "estante-api";
const API_LIMIT = 80;

const APP = [
  "./", "index.html", "manifest.webmanifest",
  "css/tokens.css", "css/base.css", "css/components.css", "css/shelf.css", "css/screens.css",
  "fonts/inter.woff2", "fonts/newsreader.woff2", "fonts/newsreader-italic.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png", "icons/favicon-32.png",
  "js/main.js", "js/db.js", "js/state.js",
  "js/lib/backup.js", "js/lib/cover.js", "js/lib/isbn.js", "js/lib/search.js", "js/lib/time.js",
  "js/ui/addBook.js", "js/ui/bookOpen.js", "js/ui/dom.js", "js/ui/icons.js", "js/ui/settings.js",
  "js/ui/shelf.js", "js/ui/stats.js", "js/ui/timer.js",
  "js/vendor/zxing-browser.min.js",
];

const API_HOSTS = ["www.googleapis.com", "openlibrary.org", "covers.openlibrary.org", "books.google.com"];

// Em localhost, rede primeiro também para os arquivos do app: editar à mão e recarregar
// mostra a mudança na hora, sem precisar trocar VERSION. O cache continua servindo offline.
const DEV = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== API_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (API_HOSTS.includes(url.hostname)) {
    e.respondWith(networkFirst(req, API_CACHE, true));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // navegação: sempre o index.html do cache (o app tem uma página só)
  if (req.mode === "navigate") {
    e.respondWith(DEV ? networkFirst(req, VERSION) : caches.match("index.html").then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(DEV ? networkFirst(req, VERSION) : cacheFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName, trim = false) {
  try {
    const res = await fetch(req);
    // respostas opacas (imagens de outro site sem CORS) não entram: cada uma pesa megabytes na cota
    if (res.ok) {
      const c = await caches.open(cacheName);
      await c.put(req, res.clone());
      if (trim) {
        const keys = await c.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - API_LIMIT))) await c.delete(k);
      }
    }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: !trim });
    if (hit) return hit;
    if (req.mode === "navigate") return caches.match("index.html");
    throw err;
  }
}
