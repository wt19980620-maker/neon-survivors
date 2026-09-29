import type Phaser from 'phaser';
import { loadSave } from '../game/save';

/**
 * Screen helpers for phones: render resolution, safe-area insets (notches,
 * home indicator) and layout breakpoints shared by every scene.
 *
 * The canvas is rendered at CSS size × `res()` physical pixels so it stays sharp
 * on high-DPI phones. Scenes keep laying out in CSS ("logical") pixels: use
 * `vw`/`vh` instead of `scale.width/height`, and `fitCamera` on UI cameras.
 */
// beyond 2.5 the fill-rate cost on phones outweighs the sharpness gain; 'smooth' trades more
const MAX_RES = { high: 2.5, smooth: 1.5 };

let RES = currentDpr();

function currentDpr() {
  // ?res=2.5 forces a render scale, handy for checking phone-like density on a desktop
  const forced = Number(new URLSearchParams(window.location.search).get('res'));
  if (forced > 0) return Math.max(1, Math.min(forced, 3));
  return Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_RES[loadSave().quality] ?? MAX_RES.high));
}

/** Physical pixels per logical pixel. */
export function res() {
  return RES;
}

/** Re-read devicePixelRatio (window moved to another monitor, browser zoom). */
export function updateRes() {
  RES = currentDpr();
  return RES;
}

/** Logical (CSS-pixel) width / height of the game. */
export function vw(scene: Phaser.Scene) {
  return scene.scale.width / RES;
}

export function vh(scene: Phaser.Scene) {
  return scene.scale.height / RES;
}

/** Make a screen-space camera map logical pixels 1:1 onto the high-res canvas. */
export function fitCamera(scene: Phaser.Scene) {
  scene.cameras.main.setOrigin(0, 0).setZoom(RES);
}
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
