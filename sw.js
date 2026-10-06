// hearme service worker — オフライン起動 & プッシュ通知
const V = 'hearme-v7.0.0';
const SHELL = ['/', '/index.html', '/styles.css?v=7.0.0', '/app.js?v=7.0.0', '/api.js', '/music.js', '/config.js',
  '/manifest.json', '/logo-mark.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 自サイトのファイル：ネット優先、だめならキャッシュ（オフラインでも開ける）
  if (u.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
        return r;
      }).catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('/') : undefined)))
    );
    return;
  }
  // フォント・ジャケット画像・ライブラリ：キャッシュ優先
  if (/fonts\.(googleapis|gstatic)\.com|mzstatic\.com|cdn\.jsdelivr\.net/.test(u.host)) {
    e.respondWith(caches.open(V + '-ext').then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
      return r;
    }));
  }
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'hearme', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'hearme', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png',
    tag: d.tag || 'hearme', renotify: true, data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === location.origin) { await c.focus(); c.postMessage({ type: 'open', url }); return; }
    }
    await clients.openWindow(url);
  })());
});
