// Bump these version strings on every deploy that must invalidate old caches.
// The `activate` handler deletes any cache whose name isn't in the current set,
// so bumping v1 -> v2 purges stale builds and breaks out of a bad cached shell.
const SHELL_CACHE_NAME = 'churchconnect-shell-v4';
const DYNAMIC_CACHE_NAME = 'churchconnect-dynamic-v4';
const IMAGE_CACHE_NAME = 'churchconnect-images-v4';

// App shell files to cache initially. Only stable, always-present paths — the
// hashed JS/CSS bundles are cached on demand as they're requested (their names
// change every build, so they can't be listed statically).
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/churchconnect-logo.svg'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline app shell');
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[Service Worker] Pre-caching failed for some assets, continuing anyway:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (
            key !== SHELL_CACHE_NAME &&
            key !== DYNAMIC_CACHE_NAME &&
            key !== IMAGE_CACHE_NAME
          ) {
            console.log('[Service Worker] Cleaning old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Interception
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // 0. HTML documents / SPA navigations (Network-First)
  // The entry HTML references content-hashed bundles, so it MUST be fetched
  // fresh whenever the network is available — otherwise a stale cached shell
  // keeps pointing at an old (possibly broken) build and no reload can escape
  // it. Fall back to the cached shell only when offline.
  const isDocument =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    requestUrl.pathname === '/' ||
    requestUrl.pathname.endsWith('.html');

  if (isDocument) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(SHELL_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html') || caches.match('/');
          });
        })
    );
    return;
  }

  // 1. Image / Avatar Caching (Stale-While-Revalidate)
  if (
    event.request.destination === 'image' ||
    requestUrl.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i) ||
    requestUrl.href.includes('dicebear') // Dicebear avatars
  ) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse); // fallback on network failure

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 2. PocketBase / API requests are network-only. Authenticated responses must
  // never enter shared Cache Storage; account-scoped offline data lives in Dexie.
  if (
    requestUrl.pathname.includes('/api/') ||
    requestUrl.hostname.includes('pocketbase') ||
    requestUrl.port === '8090' // Typical PocketBase port
  ) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(
            JSON.stringify({
              error: 'offline',
              message: 'The server is unavailable. Account-scoped offline data remains in the app cache.',
              localDataAvailable: true
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // 3. Content-hashed JS / CSS / font assets (Cache-First)
  // These filenames change on every build, so a cache hit is always the exact
  // right version — cache-first gives instant offline loads with no staleness
  // risk. (The HTML that references them is handled network-first above.)
  const isHashedAsset =
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    event.request.destination === 'font' ||
    requestUrl.pathname.endsWith('.js') ||
    requestUrl.pathname.endsWith('.css');

  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchAndCache = fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(SHELL_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch((err) => {
          console.warn('[Service Worker] Asset fetch failed:', err);
          return cachedResponse;
        });

        return cachedResponse || fetchAndCache;
      })
    );
    return;
  }

  // 4. Default Fetch Fallback (Network-First)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => networkResponse)
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;

          // Return index.html as a fallback for navigation requests (SPA)
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
        });
      })
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-church-data' || event.tag === 'pocketbase-sync') {
    console.log('[Service Worker] Background sync triggered for:', event.tag);
    event.waitUntil(
      // We broadcast a message to open clients to trigger their SyncEngine.ts
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_SYNC' });
        });
      })
    );
  }
});

// Push Notification Event
self.addEventListener('push', (event) => {
  let data = { title: 'ChurchConnect', body: 'New notification received', badgeCount: 1 };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const title = data.title || 'ChurchConnect';
  const options = {
    body: data.body,
    icon: '/churchconnect-logo.svg',
    badge: '/churchconnect-logo.svg',
    vibrate: [100, 50, 100],
    data: data,
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  // Set App Badge on Home Screen icon
  const badgeCount = data.badgeCount || 1;
  if ('setAppBadge' in navigator) {
    navigator.setAppBadge(badgeCount).catch((err) => {
      console.warn('Failed to set app badge from sw:', err);
    });
  }

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Broadcast badge update to active client screens
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BADGE_UPDATE', count: badgeCount });
        });
      });
    })
  );
});

// Push Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Clear App Badge upon opening
  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch((err) => {
      console.warn('Failed to clear app badge from sw:', err);
    });
  }

  const clickedAction = event.action;
  if (clickedAction === 'close') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Look for already open client tabs
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If no matching tab, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
