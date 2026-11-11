// Service worker do Lads Remnants: deixa o jogo instalável e abre mesmo sem rede
// (aí só o modo offline funciona; o abrigo online precisa do servidor).
const CACHE = 'lads-remnants-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Só arquivos do próprio jogo. Chamadas ao servidor (Supabase) nunca passam pelo cache.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const keep = (res) => {
    if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
    return res;
  };
  if (req.mode === 'navigate') {
    // A página: sempre a mais nova; sem rede, a última que funcionou.
    event.respondWith(fetch(req).then(keep).catch(() => caches.match(req).then((hit) => hit ?? caches.match('./'))));
  } else if (/\/(assets|art|icons)\//.test(url.pathname)) {
    // Código com hash no nome e arte: não mudam, então o cache responde primeiro.
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then(keep)));
  }
});

// Aviso vindo do servidor. Com o jogo aberto e à vista não incomoda: o próprio painel já mostra.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.some((w) => w.visibilityState === 'visible')) return;
      return self.registration.showNotification(data.title || 'Lads Remnants', {
        body: data.body || '',
        tag: data.tag || 'abrigo',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        lang: 'pt-BR',
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});
