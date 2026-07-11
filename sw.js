// ==== Luxe Service Worker v8.0.0 — Offline-First Master ====
const CACHE_NAME = 'luxe-v8.0.0';
const RUNTIME_CACHE = 'luxe-runtime-v60';
const IMAGE_CACHE = 'luxe-images-v4';
const OFFLINE_URL = './offline.html';
const NETWORK_TIMEOUT = 3000; // 3 ثانیه تایم‌اوت

// فایل‌های ضروری که همیشه کش میشن (تمام محصولات باید در دسترس آفلاین باشند)
const PRECACHE_URLS = [
  './',
  './index.html',
  './shop.html',
  './cart.html',
  './product.html',
  './checkout.html',
  './login.html',
  './profile.html',
  './about.html',
  './contact.html',
  './faq.html',
  './terms.html',
  './privacy.html',
  './blog.html',
  './blog-post.html',
  './offline.html',
  './apk-guide.html',
  './sitemap.xml',
  './robots.txt',
  './manifest.json',
  './images/iphone.jpg',
  './images/laptop.jpg',
  './images/headphone.jpg',
  './images/watch.jpg',
  './images/sneaker.jpg',
  './images/camera.jpg',
  './images/console.jpg',
  './images/coffee.jpg',
  './images/sunglasses.jpg',
  './images/lamp.jpg',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/apple-touch-icon.png',
  './images/favicon-16.png',
  './images/favicon-32.png'
];

// ══ INSTALL: کش همه فایل‌ها ══
self.addEventListener('install', event => {
  console.log('[Luxe SW v8.0.0] 📦 در حال نصب و کش کردن ...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache به صورت جداگانه برای هر فایل (اگر یکی failed شد بقیه ادامه بدن)
        return Promise.all(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => {
              console.warn('[Luxe SW] ⚠️ Failed to cache:', url, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[Luxe SW] ✅ همه فایل‌ها برای استفاده آفلاین آماده شدند');
        return self.skipWaiting();
      })
  );
});

// ══ ACTIVATE: پاک کردن کش قدیمی ══
self.addEventListener('activate', event => {
  console.log('[Luxe SW v8.0.0] 🔄 فعال‌سازی...');
  const validCaches = [CACHE_NAME, RUNTIME_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(name => !validCaches.includes(name))
          .map(name => {
            console.log('[Luxe SW] 🗑 حذف کش قدیمی:', name);
            return caches.delete(name);
          })
      )
    ).then(() => {
      console.log('[Luxe SW] ✅ فعال شد — سایت آماده استفاده آفلاین');
      return self.clients.claim();
    })
  );
});

// ══ Helper: Fetch با timeout ══
function fetchWithTimeout(req, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    fetch(req).then(
      response => { clearTimeout(timer); resolve(response); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

// ══ FETCH: استراتژی هوشمند ══
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const req = event.request;

  // ─── منابع cross-origin ───
  if (url.origin !== location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(req, clone);
              limitCache(RUNTIME_CACHE, 60);
            });
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // ─── تصاویر: Cache-First (سریع + آفلاین) ───
  if (req.destination === 'image' || /\.(jpg|jpeg|png|webp|gif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) {
          // در پس‌زمینه به‌روزرسانی کن (bg-update)
          fetch(req).then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(IMAGE_CACHE).then(cache => cache.put(req, clone));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(req).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(IMAGE_CACHE).then(cache => {
              cache.put(req, clone);
              limitCache(IMAGE_CACHE, 100);
            });
          }
          return response;
        }).catch(() => {
          // Fallback: SVG placeholder زیبا
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><rect fill="url(#g)" width="400" height="300"/><text x="200" y="150" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="18" font-weight="bold">Luxe</text><text x="200" y="180" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="12" opacity="0.8">تصویر در حال بارگذاری...</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        });
      })
    );
    return;
  }

  // ─── HTML documents: STALE-WHILE-REVALIDATE (بهترین برای آفلاین) ───
  // یعنی: اول از کش بده (سریع)، در پس‌زمینه هم از سرور تازه کن
  if (req.destination === 'document' || req.mode === 'navigate' || /\.html?$/i.test(url.pathname) || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(
      caches.match(req).then(cached => {
        // اگر cached داریم، فوراً برگردون (offline-first)
        const fetchPromise = fetchWithTimeout(req, NETWORK_TIMEOUT).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return response;
        }).catch(() => null);

        if (cached) {
          // در پس‌زمینه سرور رو چک کن اما cached رو الان بده
          fetchPromise; // fire and forget for background update
          return cached;
        }

        // اگر cache نداریم، منتظر سرور بمون
        return fetchPromise.then(response => {
          if (response) return response;
          // اگر سرور هم جواب نداد، صفحه offline
          return caches.match(OFFLINE_URL).then(off => off || caches.match('./index.html'));
        }).catch(() => {
          return caches.match(OFFLINE_URL).then(off => off || caches.match('./index.html'));
        });
      })
    );
    return;
  }

  // ─── CSS, JS, JSON: Stale-While-Revalidate ───
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// محدود کردن حجم cache (LRU)
async function limitCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      await cache.delete(keys[0]);
      limitCache(cacheName, maxItems);
    }
  } catch (_) {}
}

// Background Sync
self.addEventListener('sync', event => {
  if (event.tag === 'luxe-sync-orders') {
    event.waitUntil(syncPendingOrders());
  }
});

async function syncPendingOrders() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: 'SYNC_ORDERS' }));
  } catch (_) {}
}

// Push Notifications
self.addEventListener('push', event => {
  try {
    const data = event.data ? event.data.json() : { title: 'Luxe', body: 'پیام جدید' };
    event.waitUntil(
      self.registration.showNotification(data.title || 'Luxe', {
        body: data.body || '',
        icon: './images/icon-192.png',
        badge: './images/icon-192.png',
        vibrate: [200, 100, 200],
        dir: 'rtl',
        lang: 'fa',
        tag: 'luxe-notification',
        renotify: true,
        data: data.url || './'
      })
    );
  } catch (_) {}
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// پیام از سایت
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names => names.forEach(n => caches.delete(n)));
  }
  if (event.data && event.data.type === 'PRECACHE_NOW') {
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS).catch(()=>{}));
  }
});
