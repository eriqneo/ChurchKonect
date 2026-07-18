// ==========================================
// 1. PWA & Badging Core APIs
// ==========================================

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    // If a service worker is already controlling this page, any future
    // controller change means an UPDATED worker has activated and claimed the
    // page — reload once so the fresh build's HTML/assets are used instead of
    // whatever the previous worker was still serving. Guarded so a first-ever
    // install (no existing controller) doesn't trigger a reload loop.
    if (navigator.serviceWorker.controller) {
      let hasReloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hasReloaded) return;
        hasReloaded = true;
        window.location.reload();
      });
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('[PWA] Service Worker registered successfully:', registration);

    // Proactively check for an updated worker on load
    registration.update().catch(() => { /* offline or no update — fine */ });

    // Listen to messages from the Service Worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'TRIGGER_SYNC') {
        console.log('[PWA] Sync requested by service worker');
        window.dispatchEvent(new CustomEvent('churchconnect_sync_requested'));
      }
      if (event.data?.type === 'BADGE_UPDATE') {
        console.log('[PWA] Badge update received from service worker:', event.data.count);
        const customEvent = new CustomEvent('pwa_badge_update', { detail: event.data.count });
        window.dispatchEvent(customEvent);
      }
    });

    return registration;
  } catch (error) {
    console.error('[PWA] Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Update app badge count on the device Home Screen.
 */
export async function setAppBadge(count: number): Promise<boolean> {
  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    try {
      await (navigator as any).setAppBadge(count);
      return true;
    } catch (err) {
      console.warn('[PWA] Failed to set app badge on device:', err);
    }
  }
  return false;
}

/**
 * Clear app badge from device Home Screen.
 */
export async function clearAppBadge(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
    try {
      await (navigator as any).clearAppBadge();
      return true;
    } catch (err) {
      console.warn('[PWA] Failed to clear app badge on device:', err);
    }
  }
  return false;
}
