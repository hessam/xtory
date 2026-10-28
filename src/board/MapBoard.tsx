/**
 * Board v1 — the strategy-game map (ff_board). Drop-in replacement for MapLeaflet (same props).
 * Three stacked SVG layers inside one GPU-composited wrapper: base (sea/land/rivers), realms, overlay
 * (labels, emblems, cities, tokens). Pan/zoom only changes a CSS transform. See docs/adr/001-board-renderer.md.
 */
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layers, Palette, GitFork, Mountain, Plus, Minus, Maximize } from 'lucide-react';
import { geometry, ringsToPath, linesToPath, tint, THEME } from './model';
import { computeBoardCells, type BoardCell } from './cells';
import { Emblem, EmblemDefs } from './emblem';
import { camAt, camFitBox, fitScale, useBoardCamera, type Cam } from './camera';
import { project } from './projection';
import type { MapProps } from './mapProps';
import { getDynasty, getRealmsByRegion } from '../data/registry';
import { vazirs as allVazirs, type Vazir } from '../data/vazirs';
import type { HistoricalEvent } from '../data/historicalEvents';
import type { Artifact } from '../data/artifacts';
import { toggleLens, useLens } from '../lib/lensStore';
import { toPersianDigits } from '../utils/format';
import { pushToDataLayer } from '../services/tagManager';
import { FragmentationHud } from '../components/fragmentation/FragmentationHud';

type Mode = 'political' | 'family' | 'fragmentation' | 'terrain';
const W = geometry.width, H = geometry.height;
const FAMILY_HEX: Record<string, string> = { persian: '#a855f7', arab: '#10b981', turkic: '#ea580c', greek: '#0ea5e9', nomadic: '#b45309', foreign: '#e11d48', semitic: '#78350f' };
const HEAT = ['#3b4a63', '#7c5e2a', '#b7791f', '#e08a1e', '#f59e0b', '#fde047'];
const heat = (n: number) => HEAT[Math.max(0, Math.min(HEAT.length - 1, n - 1))];
const EVENT_COLOR: Record<string, string> = { battle: '#f43f5e', downfall: '#c084fc', political: '#38bdf8' };

const LAND_PATH = ringsToPath(geometry.land);
const LAKE_PATH = ringsToPath(geometry.lakes);
const RIVER_PATH = linesToPath(geometry.rivers);
const REGION_PATH: Record<string, string> = Object.fromEntries(Object.entries(geometry.regions).map(([id, r]) => [id, ringsToPath(r.rings)]));
const PLATEAU_BOX: [number, number, number, number] = (() => {
  const pts = Object.values(geometry.regions).flatMap(r => r.rings.flat());
  return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
})();
const layerBox = { position: 'absolute' as const, left: 0, top: 0, width: W, height: H };

// ── Layers ───────────────────────────────────────────────────────────────────

const Defs = () => (
  <defs>
    <radialGradient id="b-sea" cx="50%" cy="45%" r="75%"><stop offset="0" stopColor="#12243d" /><stop offset="1" stopColor={THEME.seaDeep} /></radialGradient>
    <clipPath id="b-land"><path d={LAND_PATH} /></clipPath>
    <pattern id="b-fog" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="10" height="10" fill={THEME.fog} fillOpacity="0.72" /><line x1="0" y1="0" x2="0" y2="10" stroke="#223049" strokeWidth="2" />
    </pattern>
    <pattern id="b-uncertain" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
      <line x1="0" y1="0" x2="0" y2="12" stroke="#05080f" strokeOpacity="0.45" strokeWidth="2.5" />
    </pattern>
    <EmblemDefs />
  </defs>
);

const BaseLayer = memo(({ lang }: { lang: 'en' | 'fa' }) => {
  const font = lang === 'fa' ? 'Vazirmatn, sans-serif' : 'Inter, system-ui, sans-serif';
  return (
    <svg style={{ ...layerBox, pointerEvents: 'none' }} viewBox={`0 0 ${W} ${H}`}>
      <Defs />
      <rect x={-2000} y={-2000} width={W + 4000} height={H + 4000} fill="url(#b-sea)" />
      <path d={LAND_PATH} fill="none" stroke={THEME.coast} strokeOpacity="0.10" strokeWidth="14" strokeLinejoin="round" />
      <path d={LAND_PATH} fill="none" stroke={THEME.coast} strokeOpacity="0.18" strokeWidth="7" strokeLinejoin="round" />
      <path d={LAND_PATH} fill={THEME.land} stroke={THEME.landEdge} strokeWidth="1.5" strokeLinejoin="round" />
      <path d={LAKE_PATH} fill={THEME.sea} stroke={THEME.coast} strokeOpacity="0.4" strokeWidth="1.2" />
      <path d={RIVER_PATH} fill="none" stroke={THEME.river} strokeOpacity="0.55" strokeWidth="1.1" />
      <g opacity="0.55">
        {geometry.neighbours.map(n => (
          <g key={n.id}>
            <path d={ringsToPath(n.rings)} fill="#0c1220" fillOpacity="0.5" stroke={THEME.neighbour} strokeOpacity="0.35" strokeDasharray="8 8" strokeWidth="1.2" />
            <text x={n.centroid[0]} y={n.centroid[1]} textAnchor="middle" fontFamily={font} fontSize="15" letterSpacing={lang === 'fa' ? 0 : 5} fill={THEME.neighbour} fillOpacity="0.7">
              {(lang === 'fa' ? n.name.fa : n.name.en).toUpperCase()}
            </text>
          </g>
        ))}
      </g>
      {/* ghost extents (legend: Achaemenid / Sasanian max extent, modern Iran) */}
      <path d={ringsToPath(geometry.overlays.achaemenidMax)} fill="#f59e0b" fillOpacity="0.02" stroke="#f59e0b" strokeOpacity="0.35" strokeWidth="1.8" strokeDasharray="6 8" />
      <path d={ringsToPath(geometry.overlays.sasanianMax)} fill="#818cf8" fillOpacity="0.02" stroke="#818cf8" strokeOpacity="0.35" strokeWidth="1.8" strokeDasharray="4 6" />
      <path d={ringsToPath(geometry.overlays.iranModern)} fill="none" stroke="#10b981" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="5 8" />
    </svg>
  );
});
BaseLayer.displayName = 'BaseLayer';

interface RealmsProps { cells: BoardCell[]; mode: Mode; lens: string | null; counts: Map<string, number> }
const RealmsLayer = memo(({ cells, mode, lens, counts }: RealmsProps) => {
  const present = new Set(cells.map(c => c.regionId));
  const regionIds = Object.keys(geometry.regions);
  return (
    <svg style={{ ...layerBox, pointerEvents: 'none' }} viewBox={`0 0 ${W} ${H}`}>
      <g clipPath="url(#b-land)">
        {(mode === 'political' || mode === 'family') && cells.map(c => {
          const color = mode === 'family' ? FAMILY_HEX[c.family] ?? c.color : c.color;
          const dim = lens && lens !== c.dynastyId;
          const d = ringsToPath(c.rings);
          return (
            <g key={c.key} className="board-cell-in" data-kind="cell" data-region={c.regionId} data-dyn={c.dynastyId} data-testid="board-cell" pointerEvents="all" style={{ cursor: 'pointer' }}>
              <path className="board-cell" d={d} fill={color} fillOpacity={dim ? 0.1 : 0.62} />
              {!dim && <path d={d} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="9" strokeLinejoin="round" />}
              <path className="board-burn" pathLength={1} d={d} fill="none" stroke={tint(color, 0.55)} strokeOpacity={dim ? 0.2 : 0.95} strokeWidth={lens === c.dynastyId ? 3.5 : 2} strokeLinejoin="round" />
              {c.lowConfidence && !dim && <path d={d} fill="url(#b-uncertain)" />}
            </g>
          );
        })}
        {(mode === 'political' || mode === 'family') && regionIds.filter(id => !present.has(id)).map(id => (
          <path key={id} d={REGION_PATH[id]} fill="url(#b-fog)" data-kind="cell" data-region={id} pointerEvents="all" style={{ cursor: 'pointer' }} />
        ))}
        {mode === 'fragmentation' && regionIds.map(id => (
          <path key={id} className="board-cell" d={REGION_PATH[id]} fill={heat(counts.get(id) ?? 0)} fillOpacity={counts.get(id) ? 0.7 : 0.15}
                stroke="#fff" strokeOpacity="0.5" strokeWidth="2" data-kind="cell" data-region={id} data-testid="board-cell" pointerEvents="all" style={{ cursor: 'pointer' }} />
        ))}
        {mode === 'terrain' && regionIds.map(id => (
          <path key={id} d={REGION_PATH[id]} fill="transparent" stroke="#e8eef7" strokeOpacity="0.18" strokeWidth="1.5" strokeDasharray="3 5" data-kind="cell" data-region={id} pointerEvents="all" style={{ cursor: 'pointer' }} />
        ))}
      </g>
    </svg>
  );
});
RealmsLayer.displayName = 'RealmsLayer';

interface View { k: number; s: number }
interface Token { id: string; kind: 'event' | 'artifact' | 'vazir'; x: number; y: number; color: string; title: string }

const CityDots = memo(({ lang, view, mode }: { lang: 'en' | 'fa'; view: View; mode: Mode }) => {
  const scale = view.s * view.k;
  const maxTier = mode === 'terrain' ? 3 : view.k >= 3.4 ? 3 : view.k >= 2.4 ? 2 : view.k >= 1.5 ? 1 : 0;
  if (!maxTier) return null;
  return (
    <g pointerEvents="none">
      {geometry.cities.filter(c => c.tier <= maxTier).map(c => (
        <g key={c.regionId + c.name.en}>
          <circle cx={c.x} cy={c.y} r={3 / scale} fill="#c9a96e" fillOpacity="0.85" stroke="#0a1410" strokeWidth={1 / scale} />
          <text x={c.x + 6 / scale} y={c.y + 4 / scale} fontSize={12 / scale} fontFamily={lang === 'fa' ? 'Vazirmatn, sans-serif' : 'Inter, system-ui, sans-serif'}
                fill="#e8eef7" fillOpacity="0.85" stroke={THEME.halo} strokeWidth={3 / scale} paintOrder="stroke">{lang === 'fa' ? c.name.fa : c.name.en}</text>
        </g>
      ))}
    </g>
  );
});
CityDots.displayName = 'CityDots';

interface OverlayProps { cells: BoardCell[]; mode: Mode; lens: string | null; lang: 'en' | 'fa'; view: View; tokens: Token[]; counts: Map<string, number> }
const OverlayLayer = memo(({ cells, mode, lens, lang, view, tokens, counts }: OverlayProps) => {
  const scale = view.s * view.k;
  const font = lang === 'fa' ? 'Vazirmatn, sans-serif' : 'Inter, system-ui, sans-serif';
  const perChar = lang === 'fa' ? 0.55 : 0.95;
  const showRealms = mode === 'political' || mode === 'family';
  return (
    <svg style={{ ...layerBox, pointerEvents: 'none' }} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        {showRealms && cells.map(c => {
          const screen = Math.min(c.label.size * scale, 38);
          if (c.label.size < 10 || screen < 9) return null;
          const fs = screen / scale, L = c.name[lang].length * fs * perChar * 1.05;
          const a = c.label.angle * Math.PI / 180, dx = Math.cos(a) * L / 2, dy = Math.sin(a) * L / 2, sag = L * 0.1;
          // parallels on a conic map bow like a smile: ends curve up, middle dips
          return <path key={c.key} id={`lp-${c.key.replace(/[^a-z0-9]/gi, '_')}`} d={`M${c.label.x - dx} ${c.label.y - dy}Q${c.label.x - Math.sin(a) * sag * 2} ${c.label.y + Math.cos(a) * sag * 2} ${c.label.x + dx} ${c.label.y + dy}`} />;
        })}
      </defs>

      {showRealms && cells.map(c => {
        const screen = Math.min(c.label.size * scale, 38);
        if (c.label.size < 10 || screen < 9) return null;
        const fs = screen / scale;
        const dim = lens && lens !== c.dynastyId;
        return (
          <text key={c.key + 't'} fontFamily={font} fontWeight={600} fontSize={fs} letterSpacing={lang === 'fa' ? 0 : fs * 0.28}
                fill={THEME.ink} fillOpacity={dim ? 0.3 : 1} stroke={THEME.halo} strokeWidth={fs * 0.22} paintOrder="stroke" textAnchor="middle" data-testid="board-label">
            <textPath href={`#lp-${c.key.replace(/[^a-z0-9]/gi, '_')}`} startOffset="50%">{(lang === 'fa' ? c.name.fa : c.name.en).toUpperCase()}</textPath>
          </text>
        );
      })}

      {mode === 'fragmentation' && Object.entries(geometry.regions).map(([id, r]) => (
        <text key={id} x={r.centroid[0]} y={r.centroid[1]} textAnchor="middle" dominantBaseline="middle" fontFamily={font} fontWeight={700}
              fontSize={34 / scale} fill="#fff" stroke={THEME.halo} strokeWidth={8 / scale} paintOrder="stroke" data-testid="board-count">
          {(counts.get(id) ?? 0) ? (lang === 'fa' ? toPersianDigits(counts.get(id)!) : counts.get(id)) : ''}
        </text>
      ))}

      {mode === 'terrain' && Object.entries(geometry.regions).map(([id, r]) => (
        <text key={id} x={r.centroid[0]} y={r.centroid[1]} textAnchor="middle" fontFamily={font} fontSize={16 / scale} letterSpacing={lang === 'fa' ? 0 : 5 / scale}
              fill="#e8eef7" fillOpacity="0.45" stroke={THEME.halo} strokeWidth={3 / scale} paintOrder="stroke">{(lang === 'fa' ? r.name.fa : r.name.en).toUpperCase()}</text>
      ))}

      <CityDots lang={lang} view={view} mode={mode} />

      {showRealms && cells.filter(c => view.k >= 1.25 || c.label.size >= 10).map(c => {
        const d = getDynasty(c.dynastyId)!;
        return <Emblem key={c.key + 'e'} x={c.capital.x} y={c.capital.y} size={9 / scale} color={mode === 'family' ? FAMILY_HEX[c.family] : c.color} seed={d.emblemSeed} dyn={c.dynastyId} active={lens === c.dynastyId} />;
      })}

      {tokens.map(t => (
        <g key={t.kind + t.id} data-kind={t.kind} data-id={t.id} data-testid={`board-token-${t.kind}`} pointerEvents="all" style={{ cursor: 'pointer' }}>
          <circle cx={t.x} cy={t.y} r={22 / scale} fill="transparent" />
          <circle cx={t.x} cy={t.y} r={7 / scale} fill={t.color} fillOpacity="0.9" stroke="#fff" strokeWidth={1.4 / scale} />
          <title>{t.title}</title>
        </g>
      ))}
    </svg>
  );
});
OverlayLayer.displayName = 'OverlayLayer';

// ── Component ────────────────────────────────────────────────────────────────

const MODES: { id: Mode; icon: React.ReactNode; en: string; fa: string }[] = [
  { id: 'political', icon: <Layers className="w-4 h-4" />, en: 'Realms', fa: 'قلمروها' },
  { id: 'family', icon: <Palette className="w-4 h-4" />, en: 'Cultures', fa: 'فرهنگ‌ها' },
  { id: 'fragmentation', icon: <GitFork className="w-4 h-4" />, en: 'Fragmentation', fa: 'پراکندگی' },
  { id: 'terrain', icon: <Mountain className="w-4 h-4" />, en: 'Terrain', fa: 'زمین' },
];

export default function MapBoard(props: MapProps) {
  const { year, lang, onRegionClick, historicalEvents = [], artifacts = [], vazirs, onHistoricalEventClick, onArtifactClick, onVazirClick } = props;
  const [mode, setMode] = useState<Mode>('political');
  const [view, setView] = useState<View>({ k: 1, s: 0.5 });
  const lens = useLens();
  const box = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);

  const cells = useMemo(() => computeBoardCells(year, lang), [year, lang]);
  const counts = useMemo(() => new Map([...getRealmsByRegion(year)].map(([id, l]) => [id, l.length])), [year]);

  const vazirList = vazirs ?? allVazirs;
  const tokens = useMemo<Token[]>(() => {
    const out: Token[] = [];
    for (const e of historicalEvents) {
      if (!e.coordinates || Math.abs(e.year - year) > 25) continue;
      const [x, y] = project(e.coordinates[0], e.coordinates[1]);
      out.push({ id: e.id, kind: 'event', x, y, color: EVENT_COLOR[e.type] ?? '#34d399', title: e.title[lang] });
    }
    for (const a of artifacts) {
      if (!a.coordinates || Math.abs(a.year - year) > 100) continue;
      const [x, y] = project(a.coordinates[0], a.coordinates[1]);
      out.push({ id: a.id, kind: 'artifact', x, y, color: '#fbbf24', title: a.name[lang] });
    }
    for (const v of vazirList) {
      if (year < v.activeYearStart || year > v.activeYearEnd) continue;
      const c = geometry.regions[v.regionId]?.centroid; if (!c) continue;
      out.push({ id: v.id, kind: 'vazir', x: c[0] + 14, y: c[1] + 26, color: '#c9a96e', title: v.name[lang] });
    }
    return out;
  }, [historicalEvents, artifacts, vazirList, year, lang]);

  const byId = useRef({ events: new Map<string, HistoricalEvent>(), artifacts: new Map<string, Artifact>(), vazirs: new Map<string, Vazir>() });
  byId.current = { events: new Map(historicalEvents.map(e => [e.id, e])), artifacts: new Map(artifacts.map(a => [a.id, a])), vazirs: new Map(vazirList.map(v => [v.id, v])) };

  const onTap = useCallback((target: Element | null) => {
    const el = target?.closest?.('[data-kind]') as SVGElement | null;
    if (!el) return;
    const kind = el.getAttribute('data-kind');
    if (kind === 'emblem') toggleLens(el.getAttribute('data-dyn')!);
    else if (kind === 'cell') {
      const regionId = el.getAttribute('data-region')!;
      onRegionClick(regionId);
      pushToDataLayer('map_region_click', { region_id: regionId, current_year: year, renderer: 'board' });
    } else if (kind === 'event') { const e = byId.current.events.get(el.getAttribute('data-id')!); if (e) onHistoricalEventClick?.(e); }
    else if (kind === 'artifact') { const a = byId.current.artifacts.get(el.getAttribute('data-id')!); if (a) onArtifactClick?.(a); }
    else if (kind === 'vazir') { const v = byId.current.vazirs.get(el.getAttribute('data-id')!); if (v) onVazirClick?.(v); }
  }, [onRegionClick, onHistoricalEventClick, onArtifactClick, onVazirClick, year]);

  const onSettle = useCallback((c: Cam) => {
    const b = box.current; if (!b) return;
    setView({ k: c.k, s: fitScale(b.clientWidth || 1, b.clientHeight || 1) });
  }, []);

  const camera = useBoardCamera({ box, layer, onTap, onSettle });

  // initial framing on the plateau (and again once the container has a real size)
  useLayoutEffect(() => {
    const b = box.current; if (!b) return;
    const frame = () => { if (!b.clientWidth) return false; camera.set(camFitBox(PLATEAU_BOX, b.clientWidth, b.clientHeight, b.clientWidth < 640 ? 0.1 : 0.04)); return true; };
    if (frame()) return;
    const ro = new ResizeObserver(() => { if (frame()) ro.disconnect(); });
    ro.observe(b); return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- frame once; `camera` is a fresh object each render

  // reach lens → fly to the regions that dynasty held
  useEffect(() => {
    const b = box.current; if (!lens || !b?.clientWidth) return;
    const held = [...getRealmsByRegion(year)].filter(([, l]) => l.some(r => r.dynastyId === lens)).map(([id]) => id).filter(id => geometry.regions[id]);
    if (!held.length) return;
    const pts = held.flatMap(id => geometry.regions[id].rings.flat());
    const box4: [number, number, number, number] = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
    camera.flyTo(camFitBox(box4, b.clientWidth, b.clientHeight, 0.25));
  }, [lens]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = (f: number) => { const b = box.current!; camera.zoomAtScreen(b.clientWidth / 2, b.clientHeight / 2, f); };
  const reset = () => { const b = box.current!; camera.flyTo(camFitBox(PLATEAU_BOX, b.clientWidth, b.clientHeight, b.clientWidth < 640 ? 0.1 : 0.04)); };
  void camAt;

  const btn = 'w-9 h-9 max-sm:w-8 max-sm:h-8 rounded-xl liquid-glass-heavy border border-white/15 flex items-center justify-center text-slate-200 hover:bg-white/15 active:scale-95 calm-transition';
  return (
    <div className="w-full h-full relative overflow-hidden bg-[#070e1b]" data-testid="board-root" aria-label={lang === 'fa' ? 'نقشه تاریخی' : 'Historical map'}>
      <div ref={box} className="absolute inset-0 overflow-hidden" style={{ touchAction: 'none' }} data-testid="board-map">
        <div ref={layer} style={{ ...layerBox, transformOrigin: '0 0', willChange: 'transform' }}>
          <BaseLayer lang={lang} />
          <RealmsLayer cells={cells} mode={mode} lens={lens} counts={counts} />
          <OverlayLayer cells={cells} mode={mode} lens={lens} lang={lang} view={view} tokens={tokens} counts={counts} />
        </div>
      </div>

      <FragmentationHud year={year} lang={lang} />

      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1.5" data-testid="board-controls">
        {MODES.map(m => (
          <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id} aria-label={lang === 'fa' ? m.fa : m.en} title={lang === 'fa' ? m.fa : m.en}
                  data-testid={`board-mode-${m.id}`} className={`${btn} ${mode === m.id ? '!bg-amber-400/90 !text-slate-900 !border-amber-300' : ''}`}>{m.icon}</button>
        ))}
        <div className="h-1" />
        <button type="button" className={`${btn} hidden sm:flex`} onClick={() => zoomBy(1.5)} aria-label={lang === 'fa' ? 'بزرگ‌نمایی' : 'Zoom in'} data-testid="board-zoom-in"><Plus className="w-4 h-4" /></button>
        <button type="button" className={`${btn} hidden sm:flex`} onClick={() => zoomBy(1 / 1.5)} aria-label={lang === 'fa' ? 'کوچک‌نمایی' : 'Zoom out'} data-testid="board-zoom-out"><Minus className="w-4 h-4" /></button>
        <button type="button" className={btn} onClick={reset} aria-label={lang === 'fa' ? 'بازنشانی' : 'Reset view'} data-testid="board-reset"><Maximize className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
