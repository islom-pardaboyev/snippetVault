/**
 * Pure maths for the image lightbox zoom (pinch, wheel, drag, buttons).
 *
 * A view is `translate(x, y) scale(scale)` applied to the picture with its transform origin at
 * the centre of the frame. Every point below is measured from the centre of the frame, so the
 * same code serves a finger, the mouse wheel and the zoom buttons (which anchor at 0, 0).
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
/** How much one press of a zoom button (or `+` / `-`) changes the scale. */
export const STEP = 1.5;

export interface View { scale: number; x: number; y: number }

/**
 * Sizes in CSS pixels: the frame (`cw` x `ch`) and the picture as it is displayed at 1x
 * (`w` x `h`, before the transform).
 */
export interface Box { cw: number; ch: number; w: number; h: number }

export const clampScale = (s: number): number =>
  Number.isFinite(s) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)) : MIN_SCALE;

const limit = (v: number, max: number): number => Math.min(max, Math.max(-max, v)) + 0; // + 0 turns -0 into 0

/**
 * Keep the picture inside the frame: it may only move far enough that its edge meets the
 * frame's edge, and a picture that is still smaller than the frame stays centred.
 */
export function clampView(v: View, box: Box): View {
  const scale = clampScale(v.scale);
  const maxX = Math.max(0, (box.w * scale - box.cw) / 2);
  const maxY = Math.max(0, (box.h * scale - box.ch) / 2);
  return { scale, x: limit(Number.isFinite(v.x) ? v.x : 0, maxX), y: limit(Number.isFinite(v.y) ? v.y : 0, maxY) };
}

/**
 * Change the scale so that the picture point that was under `from` ends up under `to`.
 *
 * - zoom around a finger or the cursor: `from` and `to` are the same point;
 * - drag: the scale stays the same and `to` is where the finger is now;
 * - pinch: `from` is the start midpoint, `to` is the current midpoint, and `scale` the new scale.
 */
export function anchorZoom(v: View, from: { x: number; y: number }, to: { x: number; y: number }, scale: number, box: Box): View {
  const next = clampScale(scale);
  const k = next / v.scale;
  return clampView({ scale: next, x: to.x - k * (from.x - v.x), y: to.y - k * (from.y - v.y) }, box);
}
