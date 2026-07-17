// Service worker (roadmap n°056) : ouverture instantanee et coquille
// disponible hors connexion. Strategie volontairement prudente :
// - reseau d'abord pour TOUT (les deploiements ne sont jamais bloques par
//   un cache fige), le cache ne sert que de secours hors ligne ;
// - seules les ressources du site (meme origine) sont mises en cache,
//   jamais les appels API (workers.dev).
const CACHE_NAME = 'dsc-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Notifications Web Push (roadmap n°178) : nouveau ticket, giveaway
// termine, bot hors ligne (voir src/shared/webPush.js cote bot et le cron
// worker pour le hors-ligne). Le payload JSON est { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let data = { title: 'Discord Serveur Creator', body: 'Nouvelle notification.' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { /* payload non JSON, on garde le defaut */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: 'assets/logo-512.png',
    badge: 'assets/favicon-64.png',
    tag: data.tag || 'default',
    data: { url: data.url || 'app.html' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || 'app.html', self.location.origin).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clientsList.find((c) => c.url.startsWith(new URL('app.html', self.location.origin).href));
    if (existing) { await existing.focus(); existing.navigate?.(targetUrl); return; }
    await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      throw new Error('hors ligne et absent du cache');
    }
  })());
});
