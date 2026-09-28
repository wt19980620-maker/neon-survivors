/**
 * Screen helpers for phones: safe-area insets (notches, home indicator) and
 * layout breakpoints shared by every scene.
 */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLDivElement | null = null;

/** CSS safe-area insets in CSS pixels (= game pixels, since the game runs in RESIZE mode). */
export function safeArea(): Insets {
  try {
    if (!probe) {
      probe = document.createElement('div');
      probe.style.cssText =
        'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.appendChild(probe);
    }
    const cs = getComputedStyle(probe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

/** Phone in landscape (or any very short window): stack less, use columns. */
export function isShort(h: number) {
  return h < 560;
}

/** Wide enough for side-by-side columns. Dense panels (pause, shop) can split on narrower screens. */
export function canSplit(w: number, min = 600) {
  return w >= min;
}

export function isTouch() {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

/** Short buzz on phones that support it (Android). */
export function vibrate(ms: number) {
  try {
    if (isTouch()) navigator.vibrate?.(ms);
  } catch {
    // unsupported
  }
}
