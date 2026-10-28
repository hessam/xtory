import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { geometry, buildScene, tint, THEME, type Ring } from './model';
import type { BoardHandle } from './types';

const hex = (c: string) => parseInt(c.slice(1), 16);
const flat = (r: Ring) => r.flat();

/** PixiJS (WebGL 2D) renderer: same scene, drawn into Graphics; labels are canvas-shaped Text sprites. */
export const BoardPixi = forwardRef<BoardHandle, { year: number; lang: 'en' | 'fa' }>(({ year, lang }, ref) => {
  const host = useRef<HTMLDivElement>(null);
  const app = useRef<Application | null>(null);
  const world = useRef<Container | null>(null);
  const dynamic = useRef<Container | null>(null);
  const fit = useRef({ scale: 1, ox: 0, oy: 0 });
  const cam = useRef({ x: 0, y: 0, k: 1 });

  const applyCam = () => {
    const w = world.current; if (!w) return;
    const { scale, ox, oy } = fit.current; const { x, y, k } = cam.current;
    w.scale.set(scale * k);
    w.position.set(ox + x * scale, oy + y * scale);
  };

  useImperativeHandle(ref, () => ({
    setTransform: (x, y, k) => { cam.current = { x, y, k }; applyCam(); },
    size: { width: geometry.width, height: geometry.height },
  }), []);

  // one-time setup: static layers
  useEffect(() => {
    let cancelled = false;
    const a = new Application();
    (async () => {
      await a.init({ resizeTo: host.current!, background: THEME.sea, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
      if (cancelled) { a.destroy(true); return; }
      host.current!.appendChild(a.canvas);
      app.current = a;
      const w = new Container(); world.current = w; a.stage.addChild(w);

      const land = new Graphics();
      for (const r of geometry.land) land.poly(flat(r));
      land.stroke({ width: 14, color: hex(THEME.coast), alpha: 0.10 }).stroke({ width: 7, color: hex(THEME.coast), alpha: 0.18 });
      const landFill = new Graphics();
      for (const r of geometry.land) landFill.poly(flat(r));
      landFill.fill(hex(THEME.land)).stroke({ width: 1.5, color: hex(THEME.landEdge) });
      const lakes = new Graphics();
      for (const r of geometry.lakes) lakes.poly(flat(r));
      lakes.fill(hex(THEME.sea)).stroke({ width: 1.2, color: hex(THEME.coast), alpha: 0.4 });
      const rivers = new Graphics();
      for (const l of geometry.rivers) { rivers.moveTo(l[0][0], l[0][1]); for (let i = 1; i < l.length; i++) rivers.lineTo(l[i][0], l[i][1]); }
      rivers.stroke({ width: 1.1, color: hex(THEME.river), alpha: 0.55 });
      const nb = new Graphics();
      for (const n of geometry.neighbours) for (const r of n.rings) nb.poly(flat(r));
      nb.fill({ color: 0x0c1220, alpha: 0.35 }).stroke({ width: 1.2, color: hex(THEME.neighbour), alpha: 0.3 });

      const dyn = new Container(); dynamic.current = dyn;
      w.addChild(land, landFill, lakes, rivers, nb, dyn);

      const resize = () => {
        const s = Math.max(a.screen.width / geometry.width, a.screen.height / geometry.height);
        fit.current = { scale: s, ox: (a.screen.width - geometry.width * s) / 2, oy: (a.screen.height - geometry.height * s) / 2 };
        applyCam();
      };
      a.renderer.on('resize', resize); resize();
      (host.current as any).__ready = true;
      host.current!.dispatchEvent(new Event('board-ready'));
    })();
    return () => { cancelled = true; app.current?.destroy(true, { children: true }); app.current = null; };
  }, []);

  // per-year layers: realms, fog, labels
  useEffect(() => {
    const draw = () => {
      const dyn = dynamic.current; if (!dyn) return;
      dyn.removeChildren().forEach(c => c.destroy({ children: true }));
      const scene = buildScene(year, lang);
      const mask = new Graphics(); for (const r of geometry.land) mask.poly(flat(r)); mask.fill(0xffffff);
      const realms = new Container(); realms.mask = mask; dyn.addChild(mask, realms);
      for (const c of scene.cells) {
        const g = new Graphics();
        for (const r of c.rings) g.poly(flat(r));
        g.fill({ color: hex(c.color), alpha: 0.62 });
        g.stroke({ width: 9, color: hex(c.color), alpha: 0.35, join: 'round' });
        g.stroke({ width: 2, color: hex(tint(c.color, 0.55)), alpha: 0.95, join: 'round' });
        realms.addChild(g);
      }
      const fog = new Graphics();
      for (const id of scene.fogRegions) for (const r of geometry.regions[id].rings) fog.poly(flat(r));
      fog.fill({ color: hex(THEME.fog), alpha: 0.72 });
      realms.addChild(fog);
      for (const c of scene.cells) {
        if (c.label.size < 10) continue;
        const t = new Text({
          text: (lang === 'fa' ? c.name.fa : c.name.en).toUpperCase(),
          style: { fontFamily: lang === 'fa' ? 'Vazirmatn' : 'Inter', fontWeight: '600', fontSize: Math.round(c.label.size * 2) / 2 * 2, letterSpacing: lang === 'fa' ? 0 : c.label.size * 0.28 * 2,
                   fill: hex(THEME.ink), stroke: { color: hex(THEME.halo), width: c.label.size * 0.22 * 2 } },
        });
        t.scale.set(0.5); t.anchor.set(0.5); t.position.set(c.label.x, c.label.y); t.rotation = c.label.angle * Math.PI / 180;
        dyn.addChild(t);
      }
    };
    if ((host.current as any)?.__ready) draw();
    else { const h = host.current; const f = () => draw(); h?.addEventListener('board-ready', f, { once: true }); return () => h?.removeEventListener('board-ready', f); }
  }, [year, lang]);

  return <div ref={host} style={{ width: '100%', height: '100%', touchAction: 'none' }} data-testid="board-pixi" />;
});
BoardPixi.displayName = 'BoardPixi';
export default BoardPixi;
