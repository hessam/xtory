import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { SAMPLE_YEARS, buildScene } from './model';
import { formatYear } from '../utils/format';
import type { BoardHandle } from './types';

const BoardSvg = lazy(() => import('./BoardSvg'));
const BoardPixi = lazy(() => import('./BoardPixi'));

const nextFrame = () => new Promise<number>(r => requestAnimationFrame(r));

/** Slice 3 spike page (?ff=board_spike&renderer=svg|pixi). Not part of the product UI. */
export default function BoardSpike() {
  const params = new URLSearchParams(window.location.search);
  const renderer = (['pixi', 'svgl'].includes(params.get('renderer') ?? '') ? params.get('renderer') : 'svg') as 'svg' | 'svgl' | 'pixi';
  const [year, setYear] = useState<number>(Number(params.get('year')) || 1000);
  const [lang, setLang] = useState<'en' | 'fa'>(params.get('lang') === 'fa' ? 'fa' : 'en');
  const handle = useRef<BoardHandle | null>(null);
  const cam = useRef({ x: 0, y: 0, k: 1 });
  const wrap = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLSpanElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinch = useRef(0);

  const apply = useCallback(() => handle.current?.setTransform(cam.current.x, cam.current.y, cam.current.k), []);

  // pointer pan / wheel + pinch zoom (screen px → board px using the visible scale)
  useEffect(() => {
    const el = wrap.current!;
    const boardPerScreen = () => { const s = handle.current?.size; return s ? Math.min(s.width / el.clientWidth, s.height / el.clientHeight) : 1; };
    const down = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); lastPinch.current = 0; };
    const move = (e: PointerEvent) => {
      const p = pointers.current.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) { const s = boardPerScreen(); cam.current.x += dx * s; cam.current.y += dy * s; }
      else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinch.current) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / lastPinch.current);
        lastPinch.current = d;
      }
      apply();
    };
    const up = (e: PointerEvent) => { pointers.current.delete(e.pointerId); lastPinch.current = 0; };
    // zoom keeping the board point under (cx, cy) fixed
    const zoomAt = (cx: number, cy: number, factor: number) => {
      const r = el.getBoundingClientRect(); const s = boardPerScreen();
      const bx = (cx - r.left) * s, by = (cy - r.top) * s; const c = cam.current;
      const k2 = Math.max(0.8, Math.min(6, c.k * factor)); const f = k2 / c.k;
      cam.current = { x: bx - (bx - c.x) * f, y: by - (by - c.y) * f, k: k2 };
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); apply(); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel); };
  }, [apply]);

  // FPS HUD
  useEffect(() => {
    let raf = 0, n = 0, t0 = performance.now();
    const tick = (now: number) => { n++; if (now - t0 >= 500) { if (hud.current) hud.current.textContent = `${Math.round(n * 1000 / (now - t0))} fps`; n = 0; t0 = now; } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);

  // benchmark API for Playwright
  useEffect(() => {
    (window as any).__board = {
      renderer,
      ready: async () => { while (!handle.current) await nextFrame(); if (renderer === 'pixi') { const host = document.querySelector('[data-testid=board-pixi]') as any; while (!host?.__ready) await nextFrame(); } await nextFrame(); await nextFrame(); },
      bench: async () => {
        const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
        // 1) pan + zoom for 3 s
        const frames: number[] = []; let last = performance.now(); const t0 = last;
        await new Promise<void>(res => { const f = (now: number) => { frames.push(now - last); last = now; const t = (now - t0) / 1000;
          if (t >= 3) return res();
          cam.current = { x: Math.sin(t * 2) * 300, y: Math.cos(t * 1.7) * 150, k: 1.6 + Math.sin(t * 1.3) * 0.8 }; apply(); requestAnimationFrame(f); }; requestAnimationFrame(f); });
        // 2) year scrub: state change → two frames (paint) per step
        const scrub: number[] = [];
        for (let i = 0; i < 25; i++) { const s = performance.now(); flushSync(() => setYear(SAMPLE_YEARS[i % SAMPLE_YEARS.length])); await nextFrame(); await nextFrame(); scrub.push(performance.now() - s); }
        const mem = (performance as any).memory?.usedJSHeapSize;
        const body = frames.slice(5);
        return { renderer, panFps: +(1000 / (body.reduce((a, b) => a + b, 0) / body.length)).toFixed(1), panP95ms: +pct(body, 0.95).toFixed(1), panWorstMs: +Math.max(...body).toFixed(1),
          scrubMedianMs: +pct(scrub, 0.5).toFixed(1), scrubP95ms: +pct(scrub, 0.95).toFixed(1), heapMB: mem ? +(mem / 1048576).toFixed(1) : null };
      },
      setYear: (y: number) => flushSync(() => setYear(y)),
    };
  }, [renderer, apply]);

  const scene = buildScene(year, lang);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#070e1b', color: '#e8eef7', fontFamily: 'Inter, system-ui, sans-serif' }} dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      <div ref={wrap} style={{ position: 'absolute', inset: 0 }}>
        <Suspense fallback={null}>
          {renderer === 'pixi' ? <BoardPixi ref={handle} year={year} lang={lang} /> : <BoardSvg ref={handle} year={year} lang={lang} layered={renderer === 'svgl'} />}
        </Suspense>
      </div>
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', background: 'rgba(7,14,27,.82)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, padding: '6px 12px', display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <b style={{ fontSize: 22, color: '#fcd34d' }}>{scene.dynastyCount}</b>
          <span style={{ fontSize: 11, color: '#cbd5e1' }}>{lang === 'fa' ? 'سلسله' : 'dynasties'} · {formatYear(year, lang)}</span>
        </div>
        <div style={{ pointerEvents: 'auto', display: 'flex', gap: 6 }}>
          {SAMPLE_YEARS.map(y => (
            <button key={y} onClick={() => setYear(y)} style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)', background: y === year ? '#fcd34d' : 'rgba(7,14,27,.82)', color: y === year ? '#111' : '#e8eef7', fontSize: 12 }}>{formatYear(y, lang)}</button>
          ))}
          <button onClick={() => setLang(l => l === 'en' ? 'fa' : 'en')} style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(7,14,27,.82)', color: '#e8eef7', fontSize: 12 }}>{lang === 'en' ? 'فارسی' : 'EN'}</button>
        </div>
        <span style={{ marginInlineStart: 'auto', fontSize: 11, color: '#94a3b8', background: 'rgba(7,14,27,.82)', padding: '4px 8px', borderRadius: 8 }}>{renderer} · <span ref={hud} /></span>
      </div>
    </div>
  );
}
