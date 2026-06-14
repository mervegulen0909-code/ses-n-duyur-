'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// useLayoutEffect logs a warning during SSR; fall back to useEffect there.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Scales a fixed-width child (e.g. the 1600px storyboard board) down to fit the
 * available width, never up past 1×. The board renders at its native size for
 * pixel-perfect fidelity on wide screens and shrinks proportionally on smaller
 * ones. Measures the child's natural (untransformed) height so the scaled box
 * reserves exactly the right amount of vertical space — no clipping, no gap.
 */
export function FitToWidth({ width, children }: { width: number; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);

  useIsoLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      setScale(Math.min(1, outer.clientWidth / width));
      setNaturalHeight(inner.offsetHeight); // offsetHeight ignores the transform
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div
      ref={outerRef}
      style={{
        width: '100%',
        height: naturalHeight != null ? Math.round(naturalHeight * scale) : undefined,
        overflow: 'hidden',
      }}
    >
      <div
        ref={innerRef}
        style={{
          width,
          margin: '0 auto',
          transformOrigin: 'top center',
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
