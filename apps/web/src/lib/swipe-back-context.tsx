'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface SwipeBackContextValue {
  blocked: boolean;
  setBlocked: (blocked: boolean) => void;
}

const SwipeBackContext = createContext<SwipeBackContextValue | null>(null);

export function SwipeBackProvider({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const value = useMemo(() => ({ blocked, setBlocked }), [blocked]);
  return <SwipeBackContext.Provider value={value}>{children}</SwipeBackContext.Provider>;
}

export function useBlockSwipeBack(blocked: boolean): void {
  const context = useContext(SwipeBackContext);
  if (!context) throw new Error('useBlockSwipeBack вне SwipeBackProvider');
  const setBlocked = context.setBlocked;

  useEffect(() => {
    setBlocked(blocked);
    return () => setBlocked(false);
  }, [blocked, setBlocked]);
}

const EDGE_WIDTH = 28;
const TRIGGER_DISTANCE = 84;

/** Возврат на предыдущий экран жестом вправо от левого края. */
export function SwipeBackNavigation() {
  const context = useContext(SwipeBackContext);
  if (!context) throw new Error('SwipeBackNavigation вне SwipeBackProvider');
  const pathname = usePathname();
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef(false);
  const distanceRef = useRef(0);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    if (context.blocked || pathname === '/') return undefined;
    const reset = () => {
      start.current = null;
      horizontal.current = false;
      distanceRef.current = 0;
      setDistance(0);
    };
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch && touch.clientX <= EDGE_WIDTH)
        start.current = { x: touch.clientX, y: touch.clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!start.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - start.current.x;
      const dy = Math.abs(touch.clientY - start.current.y);
      if (!horizontal.current && (dx < 8 || dx <= dy * 1.35)) {
        if (dy > 12) reset();
        return;
      }
      horizontal.current = true;
      event.preventDefault();
      distanceRef.current = Math.max(0, Math.min(TRIGGER_DISTANCE, dx));
      setDistance(distanceRef.current);
    };
    const onEnd = () => {
      const shouldGoBack = horizontal.current && distanceRef.current >= TRIGGER_DISTANCE;
      reset();
      if (shouldGoBack) router.back();
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, [context.blocked, pathname, router]);

  if (context.blocked || pathname === '/' || distance === 0) return null;
  const progress = distance / TRIGGER_DISTANCE;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-2 top-1/2 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/70 text-xl text-white shadow-lg backdrop-blur-sm"
      style={{
        opacity: 0.35 + progress * 0.65,
        transform: `translateY(-50%) scale(${0.8 + progress * 0.2})`,
      }}
    >
      ←
    </div>
  );
}
