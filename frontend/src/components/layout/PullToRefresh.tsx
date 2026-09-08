import React, { useEffect, useState, useRef } from 'react';
import './PullToRefresh.css';

const PULL_THRESHOLD = 55; // Pixels needed to trigger reload
const MAX_PULL = 85;

export function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    // Only enable on mobile screen sizes (<= 768px) or touch devices
    const isMobile = () => window.innerWidth <= 768 || 'ontouchstart' in window;

    // Helper to find scroll position of touched element's scrollable container
    const getScrollTop = (target: HTMLElement | null): number => {
      let el = target;
      while (el && el !== document.body && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight
        ) {
          return el.scrollTop;
        }
        el = el.parentElement;
      }
      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!isMobile() || isRefreshingRef.current) return;
      const target = e.target as HTMLElement | null;

      // Don't intercept inputs, textareas, or buttons
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      const st = getScrollTop(target);
      if (st <= 0) {
        isPullingRef.current = true;
        startYRef.current = e.touches[0].clientY;
        startXRef.current = e.touches[0].clientX;
        setIsAnimating(false);
      } else {
        isPullingRef.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshingRef.current) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - startYRef.current;
      const deltaX = currentX - startXRef.current;

      // If user is swiping horizontally, cancel pull-to-refresh
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }

      if (deltaY > 0) {
        // Logarithmic dampening resistance
        const distance = Math.min(Math.pow(deltaY, 0.82) * 1.5, MAX_PULL);
        setPullDistance(distance);

        // Prevent native overscroll jitter if pulled past threshold
        if (deltaY > 12 && e.cancelable) {
          e.preventDefault();
        }
      } else {
        setPullDistance(0);
      }
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current || isRefreshingRef.current) return;
      isPullingRef.current = false;
      setIsAnimating(true);

      setPullDistance((current) => {
        if (current >= PULL_THRESHOLD) {
          setIsRefreshing(true);
          try {
            navigator.vibrate?.(20);
          } catch {}

          // Brief delay so user sees smooth spinner feedback before reload
          setTimeout(() => {
            window.location.reload();
          }, 450);

          return PULL_THRESHOLD;
        } else {
          return 0;
        }
      });
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  if (pullDistance <= 0 && !isRefreshing) {
    return null;
  }

  const isReady = pullDistance >= PULL_THRESHOLD;
  const topPos = isRefreshing ? 22 : Math.min(-55 + pullDistance, 24);
  const opacity = isRefreshing ? 1 : Math.min(pullDistance / 35, 1);
  const rotation = isRefreshing ? 0 : pullDistance * 4.5;

  return (
    <div
      className={`pull-to-refresh-indicator ${
        isAnimating ? 'pull-to-refresh-indicator--animating' : ''
      } ${isReady ? 'pull-to-refresh-indicator--ready' : ''} ${
        isRefreshing ? 'pull-to-refresh-indicator--refreshing' : ''
      }`}
      style={{
        top: `${topPos}px`,
        opacity,
      }}
      aria-hidden="true"
    >
      <div
        className="pull-to-refresh-indicator__icon"
        style={{
          transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-1.19" />
        </svg>
      </div>
    </div>
  );
}
