import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { geometry } from './model';

export interface Cam { x: number; y: number; k: number }
export const MIN_K = 0.45; // below 1 the board no longer covers the viewport (sea shows around it): needed to fit the plateau on a portrait phone
export const MAX_K = 6;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clampK = (k: number) => Math.max(MIN_K, Math.min(MAX_K, k));

export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Fit factor: board px → screen px at k = 1 (cover). */
export function fitScale(cw: number, ch: number) { return Math.max(cw / geometry.width, ch / geometry.height); }

/** Keep the board covering the viewport. Pure, unit-tested. */
export function clampCam(c: Cam, cw: number, ch: number): Cam {
  const s = fitScale(cw, ch);
  const k = clampK(c.k);
  const ox = (cw - geometry.width * s) / 2, oy = (ch - geometry.height * s) / 2;
  const bw = geometry.width * s * k, bh = geometry.height * s * k;
  // axis smaller than the viewport → centre it; otherwise keep the board covering the viewport
  const axis = (v: number, box: number, view: number, o: number) => {
    if (box <= view) return ((view - box) / 2 - o) / s;
    return Math.min(-o / s, Math.max((view - box - o) / s, v));
  };
  return { k, x: axis(c.x, bw, cw, ox), y: axis(c.y, bh, ch, oy) };
}

/** Camera that centres board point (px, py) at zoom k. Pure. */
export function camAt(px: number, py: number, k: number, cw: number, ch: number): Cam {
  const s = fitScale(cw, ch);
  const ox = (cw - geometry.width * s) / 2, oy = (ch - geometry.height * s) / 2;
  return clampCam({ k, x: (cw / 2 - ox - s * k * px) / s, y: (ch / 2 - oy - s * k * py) / s }, cw, ch);
}

/** Camera that frames a board-space bounding box with padding. Pure. */
export function camFitBox(box: [number, number, number, number], cw: number, ch: number, pad = 0.12): Cam {
  const s = fitScale(cw, ch);
  const bw = (box[2] - box[0]) * (1 + pad * 2), bh = (box[3] - box[1]) * (1 + pad * 2);
  const k = Math.min(cw / (bw * s), ch / (bh * s));
  return camAt((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, k, cw, ch);
}

interface Opts {
  box: RefObject<HTMLDivElement | null>;
  layer: RefObject<HTMLDivElement | null>;
  onTap: (target: Element | null) => void;
  onSettle: (cam: Cam) => void;
}

/** Pan / wheel / pinch camera on a CSS-transformed layer; only a transform changes per frame. */
export function useBoardCamera({ box, layer, onTap, onSettle }: Opts) {
  const cam = useRef<Cam>({ x: 0, y: 0, k: 1 });
  const settleTimer = useRef(0);
  const anim = useRef(0);
  const cbs = useRef({ onTap, onSettle }); cbs.current = { onTap, onSettle };

  const size = () => ({ cw: box.current?.clientWidth || 1, ch: box.current?.clientHeight || 1 });

  const render = useCallback(() => {
    const el = layer.current; if (!el) return;
    const { cw, ch } = size(); const s = fitScale(cw, ch); const c = cam.current;
    const ox = (cw - geometry.width * s) / 2, oy = (ch - geometry.height * s) / 2;
    el.style.transform = `translate(${ox + c.x * s}px, ${oy + c.y * s}px) scale(${s * c.k})`;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      // composited layers keep a stale bitmap: force a re-raster at the settled scale
      el.style.willChange = 'auto'; requestAnimationFrame(() => { el.style.willChange = 'transform'; });
      box.current?.setAttribute('data-k', c.k.toFixed(2));
      cbs.current.onSettle({ ...cam.current });
    }, 160);
  }, [box, layer]);

  const set = useCallback((c: Cam) => { const { cw, ch } = size(); cam.current = clampCam(c, cw, ch); render(); }, [render]);

  const flyTo = useCallback((target: Cam, ms = 650) => {
    cancelAnimationFrame(anim.current);
    const { cw, ch } = size(); const to = clampCam(target, cw, ch);
    if (prefersReducedMotion() || ms <= 0) { cam.current = to; render(); return; }
    const from = { ...cam.current }; const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      cam.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
      render(); if (t < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [render]);

  const zoomAtScreen = useCallback((sx: number, sy: number, factor: number) => {
    const { cw, ch } = size(); const s = fitScale(cw, ch); const c = cam.current;
    const ox = (cw - geometry.width * s) / 2, oy = (ch - geometry.height * s) / 2;
    const k2 = clampK(c.k * factor);
    const px = (sx - ox - c.x * s) / (s * c.k), py = (sy - oy - c.y * s) / (s * c.k); // board point under the cursor
    set({ k: k2, x: (sx - ox - s * k2 * px) / s, y: (sy - oy - s * k2 * py) / s });
  }, [set]);

  useEffect(() => {
    const el = box.current!;
    const ptrs = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; t: number; target: Element | null } | null = null;
    let moved = 0; let lastPinch = 0;

    const down = (e: PointerEvent) => {
      cancelAnimationFrame(anim.current);
      if (ptrs.size === 0) { start = { x: e.clientX, y: e.clientY, t: performance.now(), target: e.target as Element }; moved = 0; }
      else moved = 99; // second finger: never a tap
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); lastPinch = 0;
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const move = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      const { cw, ch } = size(); const s = fitScale(cw, ch);
      if (ptrs.size === 1) { if (moved > 6) set({ ...cam.current, x: cam.current.x + dx / s, y: cam.current.y + dy / s }); }
      else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const r = el.getBoundingClientRect();
        if (lastPinch) zoomAtScreen((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / lastPinch);
        lastPinch = d;
      }
    };
    const up = (e: PointerEvent) => {
      const wasOne = ptrs.size === 1;
      ptrs.delete(e.pointerId); lastPinch = 0;
      if (wasOne && start && moved <= 6 && performance.now() - start.t < 600 && e.type === 'pointerup') cbs.current.onTap(start.target);
      if (ptrs.size === 0) start = null;
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAtScreen(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); };

    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel);
      cancelAnimationFrame(anim.current); window.clearTimeout(settleTimer.current);
    };
  }, [box, set, zoomAtScreen]);

  return { cam, set, flyTo, zoomAtScreen, size };
}
