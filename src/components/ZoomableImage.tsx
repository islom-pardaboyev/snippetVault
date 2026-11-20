import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { MAX_SCALE, MIN_SCALE, STEP, anchorZoom, clampView, type Box, type View } from "../lib/zoom";

const HOME: View = { scale: 1, x: 0, y: 0 };
/** Where a double tap or double click zooms to. */
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 320;
/** A press that moves less than this (CSS px) is a tap, not a drag. */
const TAP_SLOP = 8;
const DOUBLE_TAP_DISTANCE = 32;

interface Point { x: number; y: number }

/**
 * A picture you can zoom and move: pinch with two fingers, scroll the wheel (or pinch on a
 * trackpad), double tap or double click, drag when zoomed, the buttons, or `+` `-` `0`.
 *
 * Mount it with a `key` that changes with the picture, so the next picture starts at 100%.
 */
export function ZoomableImage({ src, alt = "" }: { src: string; alt?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<View>(HOME);
  const viewRef = useRef<View>(HOME);

  const apply = useCallback((next: View) => { viewRef.current = next; setView(next); }, []);

  /** Sizes for clamping. Layout sizes ignore the transform, so they are the 1x sizes. */
  const box = useCallback((): Box => ({
    cw: frame.current?.clientWidth ?? 0,
    ch: frame.current?.clientHeight ?? 0,
    w: img.current?.offsetWidth ?? 0,
    h: img.current?.offsetHeight ?? 0,
  }), []);

  /** A client position, measured from the centre of the frame. */
  const local = useCallback((clientX: number, clientY: number): Point => {
    const r = frame.current?.getBoundingClientRect();
    return r ? { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) } : { x: 0, y: 0 };
  }, []);

  const zoomTo = useCallback((scale: number, at: Point = { x: 0, y: 0 }) => {
    apply(anchorZoom(viewRef.current, at, at, scale, box()));
  }, [apply, box]);

  const zoomBy = useCallback((factor: number) => zoomTo(viewRef.current.scale * factor), [zoomTo]);

  /* keyboard: + - 0 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "+" || e.key === "=") zoomBy(STEP);
      else if (e.key === "-" || e.key === "_") zoomBy(1 / STEP);
      else if (e.key === "0") apply(HOME);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy, apply]);

  /* rotating the phone or resizing the window changes the frame: keep the picture inside it */
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => apply(clampView(viewRef.current, box())));
    ro.observe(el);
    return () => ro.disconnect();
  }, [apply, box]);

  /* wheel: it has to be a non-passive native listener, or the page scrolls underneath */
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // A trackpad pinch arrives as a wheel event with ctrlKey set and small deltas.
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
      zoomTo(viewRef.current.scale * factor, local(e.clientX, e.clientY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, local]);

  /* pointers: one finger drags, two fingers pinch, a quick second tap toggles the zoom */
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ view: View; mid: Point; dist: number } | null>(null);
  const tapState = useRef<{ moved: boolean; multi: boolean; at: number; from: Point }>({ moved: false, multi: false, at: 0, from: { x: 0, y: 0 } });
  const lastTap = useRef<{ at: number; p: Point } | null>(null);

  const baseline = () => {
    const pts = [...pointers.current.values()];
    if (pts.length === 0) { gesture.current = null; return; }
    const mid = pts.length === 1 ? pts[0] : { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const dist = pts.length === 1 ? 0 : Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    gesture.current = { view: viewRef.current, mid, dist };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = local(e.clientX, e.clientY);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not capturable: fine */ }
    if (pointers.current.size === 0) tapState.current = { moved: false, multi: false, at: Date.now(), from: p };
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size > 1) tapState.current.multi = true;
    baseline();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    if (Math.hypot(p.x - tapState.current.from.x, p.y - tapState.current.from.y) > TAP_SLOP) tapState.current.moved = true;

    if (pts.length >= 2 && g.dist > 0) {
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      apply(anchorZoom(g.view, g.mid, mid, g.view.scale * (dist / g.dist), box()));
    } else if (pts.length === 1 && g.view.scale > MIN_SCALE) {
      apply(anchorZoom(g.view, g.mid, p, g.view.scale, box()));
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const wasTap = e.type === "pointerup" && !tapState.current.moved && !tapState.current.multi
      && pointers.current.size === 1 && Date.now() - tapState.current.at < DOUBLE_TAP_MS;
    const p = pointers.current.get(e.pointerId)!;
    pointers.current.delete(e.pointerId);
    baseline();

    if (!wasTap) { lastTap.current = null; return; }
    const prev = lastTap.current;
    if (prev && Date.now() - prev.at < DOUBLE_TAP_MS && Math.hypot(p.x - prev.p.x, p.y - prev.p.y) < DOUBLE_TAP_DISTANCE) {
      lastTap.current = null;
      if (viewRef.current.scale > MIN_SCALE) apply(HOME);
      else zoomTo(DOUBLE_TAP_SCALE, p);
    } else {
      lastTap.current = { at: Date.now(), p };
    }
  };

  const zoomed = view.scale > MIN_SCALE;
  const pct = Math.round(view.scale * 100);

  return (
    <div className="relative w-full">
      <div
        ref={frame}
        data-zoom-frame
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{ touchAction: "none" }}
        className={`grid h-[80vh] w-full select-none place-items-center overflow-hidden rounded-lg ${zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
      >
        <img
          ref={img}
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          className="max-h-full max-w-full object-contain will-change-transform"
        />
      </div>

      <div className="absolute bottom-11 right-0 flex items-center gap-1 sm:bottom-0" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="btn btn-icon !h-9 bg-surface/90" aria-label="Zoom out" title="Zoom out (-)"
          disabled={view.scale <= MIN_SCALE} onClick={() => zoomBy(1 / STEP)}><Icon name="minus" size={16} /></button>
        <button type="button" className="btn !h-9 min-w-[3.75rem] bg-surface/90 font-mono text-[12.5px] tabular-nums" aria-label="Reset zoom" title="Reset zoom (0)"
          onClick={() => apply(HOME)}>{pct}%</button>
        <button type="button" className="btn btn-icon !h-9 bg-surface/90" aria-label="Zoom in" title="Zoom in (+)"
          disabled={view.scale >= MAX_SCALE} onClick={() => zoomBy(STEP)}><Icon name="plus" size={16} /></button>
      </div>
    </div>
  );
}
