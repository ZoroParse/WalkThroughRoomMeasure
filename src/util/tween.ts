/** Minimal requestAnimationFrame tween — no dependency. */

export type Easing = (t: number) => number;

export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export interface TweenHandle {
  cancel(): void;
}

/**
 * Drive `onUpdate(p)` with p in [0,1] over `duration` ms, then `onDone`.
 * Returns a handle so callers can cancel an in-flight tween.
 */
export function tween(
  duration: number,
  onUpdate: (p: number) => void,
  onDone?: () => void,
  easing: Easing = easeInOutCubic,
): TweenHandle {
  const reduce = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const start = performance.now();
  let raf = 0;
  let cancelled = false;

  const step = (now: number) => {
    if (cancelled) return;
    const elapsed = reduce ? duration : now - start;
    const p = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
    onUpdate(easing(p));
    if (p < 1) {
      raf = requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  };
  raf = requestAnimationFrame(step);

  return {
    cancel() {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
  };
}
