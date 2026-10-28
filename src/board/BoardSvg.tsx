import React, { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import { geometry, buildScene, ringsToPath, linesToPath, tint, THEME } from './model';
import type { BoardHandle } from './types';

/** SVG renderer: vector layers, transform applied imperatively (no React work per pan frame). */
export const BoardSvg = forwardRef<BoardHandle, { year: number; lang: 'en' | 'fa'; layered?: boolean }>(({ year, lang, layered }, ref) => {
  const worldRef = useRef<SVGGElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const settle = useRef<number>(0);
  const scene = useMemo(() => buildScene(year, lang), [year, lang]);
  const landPath = useMemo(() => ringsToPath(geometry.land), []);
  const lakePath = useMemo(() => ringsToPath(geometry.lakes), []);
  const riverPath = useMemo(() => linesToPath(geometry.rivers), []);
  const font = lang === 'fa' ? 'Vazirmatn, sans-serif' : 'Inter, system-ui, sans-serif';

  useImperativeHandle(ref, () => ({
    setTransform: (x, y, k) => {
      if (layered) {
        // GPU-composited layers: only a CSS transform changes per frame, nothing is re-rasterised
        const box = boxRef.current; if (!box) return;
        const s = Math.max(box.clientWidth / geometry.width, box.clientHeight / geometry.height);
        const ox = (box.clientWidth - geometry.width * s) / 2, oy = (box.clientHeight - geometry.height * s) / 2;
        const el = layerRef.current!;
        el.style.transform = `translate(${ox + x * s}px, ${oy + y * s}px) scale(${s * k})`;
        // composited layers keep their old bitmap resolution; once the camera settles, force a re-raster at the new scale
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(() => { el.style.willChange = 'auto'; requestAnimationFrame(() => { el.style.willChange = 'transform'; }); }, 160);
      } else worldRef.current?.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
    },
    size: { width: geometry.width, height: geometry.height },
  }), [layered]);

  useEffect(() => {
    if (layered) { const box = boxRef.current!; const s = Math.max(box.clientWidth / geometry.width, box.clientHeight / geometry.height);
      layerRef.current!.style.transform = `translate(${(box.clientWidth - geometry.width * s) / 2}px, ${(box.clientHeight - geometry.height * s) / 2}px) scale(${s})`; }
    else worldRef.current?.setAttribute('transform', 'translate(0 0) scale(1)');
  }, [layered]);

  const base = (
    <>
        <rect x={-2000} y={-2000} width={geometry.width + 4000} height={geometry.height + 4000} fill="url(#sea-glow)" />
        {/* land + coast glow (stacked strokes: cheap alternative to blur filters) */}
        <path d={landPath} fill="none" stroke={THEME.coast} strokeOpacity="0.10" strokeWidth="14" strokeLinejoin="round" />
        <path d={landPath} fill="none" stroke={THEME.coast} strokeOpacity="0.18" strokeWidth="7" strokeLinejoin="round" />
        <path d={landPath} fill={THEME.land} stroke={THEME.landEdge} strokeWidth="1.5" strokeLinejoin="round" />
        <path d={lakePath} fill={THEME.sea} stroke={THEME.coast} strokeOpacity="0.4" strokeWidth="1.2" />
        <path d={riverPath} fill="none" stroke={THEME.river} strokeOpacity="0.55" strokeWidth="1.1" />

        {/* neighbours: faint context */}
        <g opacity="0.55">
          {geometry.neighbours.map(n => (
            <g key={n.id}>
              <path d={ringsToPath(n.rings)} fill="#0c1220" fillOpacity="0.5" stroke={THEME.neighbour} strokeOpacity="0.35" strokeDasharray="8 8" strokeWidth="1.2" />
              <text x={n.centroid[0]} y={n.centroid[1]} textAnchor="middle" fontFamily={font} fontSize="15" letterSpacing={lang === 'fa' ? 0 : 5}
                    fill={THEME.neighbour} fillOpacity="0.7">{(lang === 'fa' ? n.name.fa : n.name.en).toUpperCase()}</text>
            </g>
          ))}
        </g>

    </>
  );
  const dynamic = (
    <>
        {/* realms, clipped to the coastline */}
        <g clipPath="url(#land-clip)">
          {scene.cells.map(c => {
            const d = ringsToPath(c.rings);
            return (
              <g key={c.key}>
                <path d={d} fill={c.color} fillOpacity="0.62" />
                <path d={d} fill="none" stroke={c.color} strokeOpacity="0.35" strokeWidth="9" strokeLinejoin="round" />
                <path d={d} fill="none" stroke={tint(c.color, 0.55)} strokeOpacity="0.95" strokeWidth="2" strokeLinejoin="round" />
              </g>
            );
          })}
          {scene.fogRegions.map(id => <path key={id} d={ringsToPath(geometry.regions[id].rings)} fill="url(#fog-hatch)" />)}
        </g>

        {/* labels */}
        {scene.cells.filter(c => c.label.size >= 10).map(c => (
          <text key={c.key + 't'} x={c.label.x} y={c.label.y} textAnchor="middle" dominantBaseline="middle"
                transform={`rotate(${c.label.angle} ${c.label.x} ${c.label.y})`}
                fontFamily={font} fontWeight={600} fontSize={c.label.size} letterSpacing={lang === 'fa' ? 0 : c.label.size * 0.28}
                fill={THEME.ink} stroke={THEME.halo} strokeWidth={c.label.size * 0.22} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
            {(lang === 'fa' ? c.name.fa : c.name.en).toUpperCase()}
          </text>
        ))}
    </>
  );

  if (layered) {
    const full = { position: 'absolute' as const, left: 0, top: 0, width: geometry.width, height: geometry.height };
    return (
      <div ref={boxRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: THEME.sea, touchAction: 'none' }} data-testid="board-svg-layered">
        <div ref={layerRef} style={{ ...full, transformOrigin: '0 0', willChange: 'transform' }}>
          <svg style={{ ...full }} viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
      <defs>
        <radialGradient id="sea-glow" cx="50%" cy="45%" r="75%"><stop offset="0" stopColor="#12243d" /><stop offset="1" stopColor={THEME.seaDeep} /></radialGradient>
        <clipPath id="land-clip"><path d={landPath} /></clipPath>
        <pattern id="fog-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="10" height="10" fill={THEME.fog} fillOpacity="0.72" /><line x1="0" y1="0" x2="0" y2="10" stroke="#223049" strokeWidth="2" />
        </pattern>
      </defs>
            {base}
          </svg>
          <svg style={{ ...full }} viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
      <defs>
        <radialGradient id="sea-glow" cx="50%" cy="45%" r="75%"><stop offset="0" stopColor="#12243d" /><stop offset="1" stopColor={THEME.seaDeep} /></radialGradient>
        <clipPath id="land-clip"><path d={landPath} /></clipPath>
        <pattern id="fog-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="10" height="10" fill={THEME.fog} fillOpacity="0.72" /><line x1="0" y1="0" x2="0" y2="10" stroke="#223049" strokeWidth="2" />
        </pattern>
      </defs>
            {dynamic}
          </svg>
        </div>
      </div>
    );
  }

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="xMidYMid slice"
         style={{ display: 'block', background: THEME.sea, touchAction: 'none' }} data-testid="board-svg">
      <defs>
        <radialGradient id="sea-glow" cx="50%" cy="45%" r="75%"><stop offset="0" stopColor="#12243d" /><stop offset="1" stopColor={THEME.seaDeep} /></radialGradient>
        <clipPath id="land-clip"><path d={landPath} /></clipPath>
        <pattern id="fog-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="10" height="10" fill={THEME.fog} fillOpacity="0.72" /><line x1="0" y1="0" x2="0" y2="10" stroke="#223049" strokeWidth="2" />
        </pattern>
      </defs>
      <g ref={worldRef}>
        <rect x={-2000} y={-2000} width={geometry.width + 4000} height={geometry.height + 4000} fill="url(#sea-glow)" />
        {/* land + coast glow (stacked strokes: cheap alternative to blur filters) */}
        <path d={landPath} fill="none" stroke={THEME.coast} strokeOpacity="0.10" strokeWidth="14" strokeLinejoin="round" />
        <path d={landPath} fill="none" stroke={THEME.coast} strokeOpacity="0.18" strokeWidth="7" strokeLinejoin="round" />
        <path d={landPath} fill={THEME.land} stroke={THEME.landEdge} strokeWidth="1.5" strokeLinejoin="round" />
        <path d={lakePath} fill={THEME.sea} stroke={THEME.coast} strokeOpacity="0.4" strokeWidth="1.2" />
        <path d={riverPath} fill="none" stroke={THEME.river} strokeOpacity="0.55" strokeWidth="1.1" />

        {/* neighbours: faint context */}
        <g opacity="0.55">
          {geometry.neighbours.map(n => (
            <g key={n.id}>
              <path d={ringsToPath(n.rings)} fill="#0c1220" fillOpacity="0.5" stroke={THEME.neighbour} strokeOpacity="0.35" strokeDasharray="8 8" strokeWidth="1.2" />
              <text x={n.centroid[0]} y={n.centroid[1]} textAnchor="middle" fontFamily={font} fontSize="15" letterSpacing={lang === 'fa' ? 0 : 5}
                    fill={THEME.neighbour} fillOpacity="0.7">{(lang === 'fa' ? n.name.fa : n.name.en).toUpperCase()}</text>
            </g>
          ))}
        </g>

        {/* realms, clipped to the coastline */}
        <g clipPath="url(#land-clip)">
          {scene.cells.map(c => {
            const d = ringsToPath(c.rings);
            return (
              <g key={c.key}>
                <path d={d} fill={c.color} fillOpacity="0.62" />
                <path d={d} fill="none" stroke={c.color} strokeOpacity="0.35" strokeWidth="9" strokeLinejoin="round" />
                <path d={d} fill="none" stroke={tint(c.color, 0.55)} strokeOpacity="0.95" strokeWidth="2" strokeLinejoin="round" />
              </g>
            );
          })}
          {scene.fogRegions.map(id => <path key={id} d={ringsToPath(geometry.regions[id].rings)} fill="url(#fog-hatch)" />)}
        </g>

        {/* labels */}
        {scene.cells.filter(c => c.label.size >= 10).map(c => (
          <text key={c.key + 't'} x={c.label.x} y={c.label.y} textAnchor="middle" dominantBaseline="middle"
                transform={`rotate(${c.label.angle} ${c.label.x} ${c.label.y})`}
                fontFamily={font} fontWeight={600} fontSize={c.label.size} letterSpacing={lang === 'fa' ? 0 : c.label.size * 0.28}
                fill={THEME.ink} stroke={THEME.halo} strokeWidth={c.label.size * 0.22} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
            {(lang === 'fa' ? c.name.fa : c.name.en).toUpperCase()}
          </text>
        ))}
      </g>
    </svg>
  );
});
BoardSvg.displayName = 'BoardSvg';
export default BoardSvg;
