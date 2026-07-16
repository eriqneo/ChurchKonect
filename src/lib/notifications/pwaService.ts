import { useState, useEffect, useCallback } from 'react';

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
        // Import dynamically to avoid circular dependencies
        import('../db/SyncEngine').then(({ syncEngine }) => {
          syncEngine.syncNow().catch(console.error);
        });
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

// ==========================================
// 2. React Notification & PWA Hook
// ==========================================

export function useNotificationSystem() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [badgeCount, setBadgeCount] = useState<number>(0);
  const [isSupported, setIsSupported] = useState(false);

  // Read current permission state and badging support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsSupported('Notification' in window);
      setPermission('Notification' in window ? Notification.permission : 'denied');

      // Fetch saved badge count from localStorage if any
      const savedCount = localStorage.getItem('churchconnect_badge_count');
      if (savedCount) {
        const count = parseInt(savedCount, 10);
        setBadgeCount(count);
        setAppBadge(count);
      }
    }

    // Listen to message updates from service worker
    const handleBadgeEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setBadgeCount(detail);
      localStorage.setItem('churchconnect_badge_count', String(detail));
    };

    window.addEventListener('pwa_badge_update', handleBadgeEvent);
    return () => window.removeEventListener('pwa_badge_update', handleBadgeEvent);
  }, []);

  // Request notifications permission
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }

    try {
      const res = await Notification.requestPermission();
      setPermission(res);
      return res;
    } catch (err) {
      console.error('[PWA] Error requesting notification permission:', err);
      return 'default';
    }
  }, []);

  // Increment badge count (e.g. simulate WhatsApp style alerts)
  const incrementBadge = useCallback(async (amount = 1) => {
    const newCount = badgeCount + amount;
    setBadgeCount(newCount);
    localStorage.setItem('churchconnect_badge_count', String(newCount));
    await setAppBadge(newCount);
    return newCount;
  }, [badgeCount]);

  // Reset/Clear badge count (e.g. when opening chats, notifications, or app)
  const resetBadge = useCallback(async () => {
    setBadgeCount(0);
    localStorage.removeItem('churchconnect_badge_count');
    await clearAppBadge();
  }, []);

  // Trigger Local Mock Push Notification for testing / presentation
  const triggerMockNotification = useCallback((title: string, body: string) => {
    if (permission === 'granted') {
      // Create native web notification
      try {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body,
            icon: '/churchconnect-logo.svg',
            badge: '/churchconnect-logo.svg',
            tag: 'mock-whatsapp-alert',
            vibrate: [100, 50, 100],
            data: { url: '/' }
          } as any);
        });
      } catch (e) {
        // Fallback to client-only notification if sw registration not fully primed
        new Notification(title, { body, icon: '/churchconnect-logo.svg' });
      }
      incrementBadge(1);
    } else {
      console.warn('[PWA] Cannot trigger notification: permission not granted');
    }
  }, [permission, incrementBadge]);

  return {
    permission,
    badgeCount,
    isSupported,
    requestPermission,
    incrementBadge,
    resetBadge,
    triggerMockNotification
  };
}
