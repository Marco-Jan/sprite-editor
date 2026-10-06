// ════════════════════════════════════════════════════════════════════
// SERVICE WORKER — Offline-Modus (PWA)
// ════════════════════════════════════════════════════════════════════
// Beim Installieren landet die ganze App im Cache (PRECACHE). Danach gilt
// "Netz zuerst, Cache als Rückfall": online kommt immer die aktuelle
// Version und frischt den Cache auf, offline (oder wenn das Netz länger
// als NET_TIMEOUT hängt) antwortet der Cache. So gibt es kein Hängenbleiben
// auf einer alten Version, und niemand muss nach einem Deploy eine
// Versionsnummer hochzählen.
//
// Die Dateiliste erzeugt tools/make_sw.py — nach neuen/gelöschten Dateien:
//   python tools/make_sw.py

// ── generiert von tools/make_sw.py — nicht von Hand ändern ──────────
const PRECACHE = [
  './',
  'assets/apple-touch-icon.png',
  'assets/favicon-16.png',
  'assets/favicon-32.png',
  'assets/favicon-48.png',
  'assets/favicon.ico',
  'assets/flag-at.png',
  'assets/flag-de.png',
  'assets/flag-en.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/icon.svg',
  'assets/landing/bird-a.png',
  'assets/landing/bird-b.png',
  'assets/landing/cat-gray.png',
  'assets/landing/clouds.png',
  'assets/landing/deco-band.png',
  'assets/landing/dog-brown.png',
  'assets/landing/dog-cream.png',
  'assets/landing/pixel.ttf',
  'assets/landing/skyline.png',
  'editor.html',
  'index.html',
  'js/app.js',
  'js/codegen.js',
  'js/data.js',
  'js/dock.js',
  'js/export.js',
  'js/filesystem.js',
  'js/gamejson.js',
  'js/history.js',
  'js/i18n-at.js',
  'js/i18n.js',
  'js/icons.js',
  'js/landing-i18n.js',
  'js/layout.js',
  'js/migrate.js',
  'js/palettes.js',
  'js/palpicker.js',
  'js/pwa.js',
  'js/render.js',
  'js/selection.js',
  'js/spritefx.js',
  'js/sprites.js',
  'js/state.js',
  'js/storage.js',
  'js/template.js',
  'js/toast.js',
  'js/transform.js',
  'js/tsimport.js',
  'landing.css',
  'site.webmanifest',
  'styles.css',
  'vendor/jspdf.umd.min.js',
];
// ── Ende generiert ──────────────────────────────────────────────────

// Nur ändern, wenn sich die Cache-Struktur grundlegend ändert — dann
// werfen alle Clients ihren alten Cache weg.
const CACHE = 'spritebit-v1';
const NET_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Einzeln statt addAll: eine fehlende Datei soll nicht den ganzen
    // Offline-Modus verhindern.
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  const net = fetch(req);
  // Cache im Hintergrund auffrischen — auch wenn die Antwort zu spät kommt
  // und diesmal schon der Cache geantwortet hat.
  // clone() sofort, bevor die Seite den Body der Antwort liest.
  event.waitUntil(net.then((res) => {
    if (!res.ok || res.type !== 'basic') return;
    const copy = res.clone();
    return caches.open(CACHE).then((cache) => cache.put(req, copy));
  }).catch(() => {}));
  event.respondWith(networkFirst(req, net));
});

async function networkFirst(req, net) {
  const cache = await caches.open(CACHE);
  // Seitenaufrufe mit ?query oder #hash finden trotzdem ihre Seite.
  const opts = { ignoreSearch: req.mode === 'navigate' };

  try {
    return await withTimeout(net, NET_TIMEOUT);
  } catch {
    const hit = await cache.match(req, opts);
    if (hit) return hit;
    // Kein Treffer im Cache: wenn das Netz doch noch antwortet, das nehmen.
    try { return await net; } catch {}
    if (req.mode === 'navigate') {
      const page = await cache.match('editor.html');
      if (page) return page;
    }
    return new Response('Offline — diese Datei ist nicht im Cache.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); },
                 (e) => { clearTimeout(t); reject(e); });
  });
}
