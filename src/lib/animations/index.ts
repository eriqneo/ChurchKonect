import React, { useState, useEffect, useCallback } from 'react';

// ==========================================
// 1. Framer Motion Variants
// ==========================================

export const cardTap = {
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 400, damping: 25 }
};

export const buttonTap = {
  whileTap: { scale: 0.95, opacity: 0.9 },
  transition: { type: 'spring', stiffness: 500, damping: 30 }
};

export const sheetPresent = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: { type: 'spring', damping: 25, stiffness: 300 }
};

export const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: 'easeOut' }
};

export const slideTabContent = (direction: 'left' | 'right') => ({
  initial: { opacity: 0, x: direction === 'left' ? 40 : -40 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: direction === 'left' ? -40 : 40 },
  transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }
});

export const attendanceCheck = {
  initial: { scale: 0 },
  animate: { scale: [0, 1.2, 1] },
  transition: { duration: 0.3, ease: 'easeOut' }
};

export const counterIncrement = {
  exit: { y: -20, opacity: 0 },
  initial: { y: 20, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { type: 'spring', stiffness: 300, damping: 20 }
};

export const sealAnimation = {
  initial: { scale: 1.5, opacity: 0 },
  animate: { scale: 0, opacity: [0, 1, 1, 0] },
  transition: { duration: 0.8, ease: 'easeInOut' }
};

export const staggerChildren = {
  container: {
    animate: {
      transition: {
        staggerChildren: 0.06
      }
    }
  },
  child: fadeIn
};


// ==========================================
// 2. Custom Hooks
// ==========================================

/**
 * Hook to check prefers-reduced-motion media query.
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return prefersReducedMotion;
}

/**
 * Hook to trigger device haptic vibration feedback with standard patterns.
 */
export function useHaptic() {
  const prefersReduced = useReducedMotion();

  const vibrate = useCallback((pattern: number | number[]) => {
    if (prefersReduced) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Safe catch if device doesn't support or disallows vibration
      }
    }
  }, [prefersReduced]);

  const tap = useCallback(() => vibrate(10), [vibrate]);
  const success = useCallback(() => vibrate([10, 30, 15]), [vibrate]);
  const error = useCallback(() => vibrate([50, 50, 50]), [vibrate]);

  return { tap, success, error };
}

/**
 * Hook to count up from 0 to target value with easing.
 */
export function useCountUp(target: number, duration = 600, delay = 0) {
  const [count, setCount] = useState(0);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (prefersReduced) {
      setCount(target);
      return;
    }

    let startTimestamp: number | null = null;
    let timerId: any = null;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // easeOutQuad easing
      const easeProgress = progress * (2 - progress);
      setCount(Math.floor(easeProgress * target));

      if (progress < 1) {
        timerId = window.requestAnimationFrame(step);
      } else {
        setCount(target);
      }
    };

    const startTimeout = setTimeout(() => {
      timerId = window.requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(startTimeout);
      if (timerId) {
        window.cancelAnimationFrame(timerId);
      }
    };
  }, [target, duration, delay, prefersReduced]);

  return count;
}

/**
 * Hook to implement touch-based pull-to-refresh on scrollable elements.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void, threshold = 80) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const prefersReduced = useReducedMotion();
  const haptic = useHaptic();

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing || prefersReduced) return;
    
    // Only trigger if container scroll is at zero (very top)
    const scrollContainer = e.currentTarget;
    if (scrollContainer.scrollTop > 0) return;

    setStartY(e.touches[0].clientY);
    setIsTracking(true);
  }, [isRefreshing, prefersReduced]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isTracking || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;

    if (diff > 0) {
      // Damping math to make scroll feel responsive but heavy at threshold
      const dampedDistance = Math.min(threshold * 1.5, Math.pow(diff, 0.85));
      setPullDistance(dampedDistance);
      
      // Trigger a light haptic cue exactly at transition point
      if (diff >= threshold && pullDistance < threshold) {
        haptic.tap();
      }
    }
  }, [isTracking, isRefreshing, startY, threshold, pullDistance, haptic]);

  const handleTouchEnd = useCallback(async () => {
    if (!isTracking) return;
    setIsTracking(false);

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold);
      haptic.success();
      try {
        await onRefresh();
      } catch (error) {
        haptic.error();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isTracking, pullDistance, threshold, onRefresh, haptic]);

  return {
    pullDistance,
    isRefreshing,
    pullHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    }
  };
}
