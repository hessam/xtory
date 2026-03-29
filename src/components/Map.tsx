import React, { useMemo, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { regions } from '../data/regions';
import { ReignEvent } from '../data/events';
import { Ruler } from '../data/rulers';
import { Dynasty } from '../data/dynasties';
import { HistoricalEvent } from '../data/historicalEvents';
import { Artifact } from '../data/artifacts';
import { Sparkles, ZoomIn, ZoomOut, Maximize, Swords, Skull, Landmark, Globe2, Building2, Book, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { rivers, mountains } from '../data/geography';
import { vazirs as allVazirs, Vazir, VAZIR_CLUSTER_PX } from '../data/vazirs';
import { VazirDot } from './VazirDot';

interface MapProps {
  year: number;
  lang: 'en' | 'fa';
  onRegionClick: (regionId: string) => void;
  onGlobalContextClick?: (year: number) => void;
  events: ReignEvent[];
  rulers: Record<string, Ruler>;
  dynasties: Record<string, Dynasty>;
  historicalEvents?: HistoricalEvent[];
  artifacts?: Artifact[];
  vazirs?: Vazir[];
  onHistoricalEventClick?: (event: HistoricalEvent) => void;
  onArtifactClick?: (artifact: Artifact) => void;
  onVazirClick?: (vazir: Vazir) => void;
}

export const Map: React.FC<MapProps> = ({ year, lang, onRegionClick, onGlobalContextClick, events, rulers, dynasties, historicalEvents = [], artifacts = [], vazirs, onHistoricalEventClick, onArtifactClick, onVazirClick }) => {
  const [currentScale, setCurrentScale] = useState(1);
  const [tooltip, setTooltip] = useState<{ x: number, y: number, text: string, subtext?: string } | null>(null);

  // Filter Vazirs active at the current year
  const activeVazirs = useMemo(
    () => (vazirs ?? allVazirs).filter(v => year >= v.activeYearStart && year <= v.activeYearEnd),
    [vazirs, year]
  );

  type VazirCluster = { vazirs: Vazir[]; x: number; y: number };

  const vazirClusters = useMemo((): VazirCluster[] => {
    const clusters: VazirCluster[] = [];

    activeVazirs.forEach(v => {
      const region = regions.find(r => r.id === v.regionId);
      const center = region?.center;
      if (!center) return;

      const [x, y] = center;

      const nearby = clusters.find(c => {
        const dx = c.x - x;
        const dy = c.y - y;
        return Math.sqrt(dx * dx + dy * dy) < VAZIR_CLUSTER_PX;
      });

      if (nearby) {
        nearby.vazirs.push(v);
      } else {
        clusters.push({ vazirs: [v], x, y });
      }
    });

    return clusters;
  }, [activeVazirs]);

  const resolveCoordinates = (coords?: [number, number], regionId?: string): [number, number] | undefined => {
    if (!coords) return undefined;
    // Heuristic: If coordinates look like pure longitude/latitude (e.g., both < 90)
    // they are likely AI-generated geo-coordinates, not SVG pixel coordinates.
    if (coords[0] < 90 && coords[1] < 90) {
      if (regionId) {
        const region = regions.find(r => r.id === regionId);
        if (region) return region.center;
      }
      // Rough projection fallback: Lon 30-75 -> X 0-1000, Lat 20-45 -> Y 600-0
      const x = ((Math.max(30, Math.min(75, coords[0])) - 30) / 45) * 1000;
      const y = 600 - ((Math.max(20, Math.min(45, coords[1])) - 20) / 25) * 600;
      return [x, y] as [number, number];
    }
    return coords;
  };

  /**
   * AUTHORITATIVE PATH GENERATOR
   * Strategy: Every 3rd vertex is a hard L (straight segment) — signals intentional borders.
   * The other 2/3 use a tight Q (quadratic) with reduced handle distance (0.08 vs old 0.18).
   * Result: borders read as shaped by geography, not by the Bezier interpolation algorithm.
   */
  const createSmoothPath = (pointsStr: string) => {
    const pts = pointsStr.split(' ').map(p => {
      const [x, y] = p.split(',').map(Number);
      return [x, y];
    });
    if (pts.length < 3) return `M ${pointsStr.replace(/,/g, ' ')}`;

    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i];
      const next = pts[(i + 1) % pts.length];
      const after = pts[(i + 2) % pts.length];

      if (i % 3 === 0) {
        // Straight segment — authoritative, intentional boundary
        d += ` L ${next[0]} ${next[1]}`;
      } else {
        // Tight quadratic — organic but controlled (handle = 8% of span, not 18%)
        const cpx = next[0] + (after[0] - curr[0]) * 0.08;
        const cpy = next[1] + (after[1] - curr[1]) * 0.08;
        d += ` Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${next[0]} ${next[1]}`;
      }
    }
    return d + ' Z';
  };

  const createSmoothLine = (pts: [number, number][]) => {
    if (pts.length < 2) return `M ${pts[0][0]} ${pts[0][1]}`;
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i === 0 ? pts[0] : pts[i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i + 2 < pts.length ? pts[i + 2] : pts[i + 1];
      
      const cp1x = p1[0] + (p2[0] - p0[0]) * 0.18;
      const cp1y = p1[1] + (p2[1] - p0[1]) * 0.18;
      const cp2x = p2[0] - (p3[0] - p1[0]) * 0.18;
      const cp2y = p2[1] - (p3[1] - p1[1]) * 0.18;
      
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  };

  const createSharpLine = (pts: [number, number][], closePath: boolean = false) => {
    if (pts.length < 2) return `M ${pts[0][0]} ${pts[0][1]}`;
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i][0]} ${pts[i][1]}`;
    }
    if (closePath) d += ' Z';
    return d;
  };

  const activeEvents = useMemo(() => {
    return events.filter((e) => year >= e.startDate && year <= e.endDate);
  }, [year, events]);

  const activeHistoricalEvents = useMemo(() => {
    return historicalEvents
      .filter(e => Math.abs(e.year - year) <= 25 && e.coordinates)
      .map(e => ({ ...e, coordinates: resolveCoordinates(e.coordinates, e.regionId) }));
  }, [year, historicalEvents]);

  const activeArtifacts = useMemo(() => {
    return artifacts
      .filter(a => Math.abs(a.year - year) <= 100 && a.coordinates)
      .map(a => ({ ...a, coordinates: resolveCoordinates(a.coordinates, a.regionId) }));
  }, [year, artifacts]);

  const getRegionStyle = (regionId: string) => {
    const region = regions.find(r => r.id === regionId);
    
    // Explicit styling for water regions that act as map territories
    if (region?.isWater) {
      return {
        fill: '#0284c7', // Darker oceanic blue (was conflicting with Hellenic #0ea5e9)
        stroke: '#0369a1',
        strokeWidth: 1.5,
        fillOpacity: 0.08,
        mixBlendMode: 'screen' as const,
        active: true
      };
    }

    const regionEvents = activeEvents.filter((e) => e.regionId === regionId);
    
    if (regionEvents.length === 0) {
      if (region?.isNeighbor) {
        return { 
          fill: 'transparent', 
          stroke: 'rgba(255,255,255,0.04)', 
          strokeWidth: 0.8, 
          fillOpacity: 0, 
          mixBlendMode: 'normal' as const,
          active: false 
        };
      }
      // Always visible hairline — the geographic skeleton is always present
      return { 
        fill: 'transparent', 
        stroke: 'rgba(255,255,255,0.12)', 
        strokeWidth: 0.6, 
        fillOpacity: 0, 
        mixBlendMode: 'normal' as const,
        active: false 
      };
    }

    const primaryEvent = regionEvents.find(e => e.status === 'Direct Control') || regionEvents[0];
    const ruler = rulers[primaryEvent.rulerId];
    const dynasty = dynasties[ruler.dynastyId];

    let baseColor = '#ffffff';
    if (dynasty.colorFamily === 'persian') baseColor = '#a855f7';
    if (dynasty.colorFamily === 'arab') baseColor = '#10b981';
    if (dynasty.colorFamily === 'turkic') baseColor = '#ea580c';
    if (dynasty.colorFamily === 'greek') baseColor = '#0ea5e9';
    if (dynasty.colorFamily === 'nomadic') baseColor = '#b45309';
    if (dynasty.colorFamily === 'foreign') baseColor = '#e11d48';
    if (dynasty.colorFamily === 'semitic') baseColor = '#78350f';

    const isSphere = primaryEvent.status === 'Sphere of Influence' || primaryEvent.status === 'Contested/Warzone';
    const isDirect = primaryEvent.status === 'Direct Control';

    return { 
      fill: baseColor, 
      stroke: baseColor, 
      // Weight hierarchy: Direct Control — heavy. Sphere — thin.
      strokeWidth: isDirect ? 1.5 : 0.8,
      fillOpacity: isSphere ? 0.04 : 0.09, 
      mixBlendMode: 'screen' as const,
      active: true
    };
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'battle': return <Swords className="w-4 h-4 text-rose-400" />;
      case 'downfall': return <Skull className="w-4 h-4 text-purple-400" />;
      case 'political': return <Landmark className="w-4 h-4 text-sky-400" />;
      case 'cultural': return <Globe2 className="w-4 h-4 text-emerald-400" />;
      default: return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
  };

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case 'monument': return <Building2 className="w-4 h-4 text-amber-400" />;
      case 'architecture': return <Landmark className="w-4 h-4 text-sky-400" />;
      case 'manuscript': return <Book className="w-4 h-4 text-purple-400" />;
      default: return <Sparkles className="w-4 h-4 text-emerald-400" />;
    }
  };
  const [showLegend, setShowLegend] = useState(false);

  return (
    <div className="w-full h-full relative bg-[#040d1a] overflow-hidden">
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={4}
        centerOnInit={true}
        limitToBounds={false}
        centerZoomedOut={false}
        wheel={{ step: 0.1 }}
        onTransformed={(ref) => setCurrentScale(ref.state.scale)}
      >
        {({ zoomIn, zoomOut, resetTransform }) => {
          const scale = currentScale;
          return (
          <>
            {/* Zoom Controls */}
            <div className="absolute top-1/2 -translate-y-1/2 right-4 sm:right-auto sm:left-6 z-10 flex flex-col gap-1.5 sm:gap-2 liquid-glass p-1.5 sm:p-2 rounded-xl sm:rounded-2xl calm-transition border border-white/5">
              <button onClick={() => zoomIn()} className="p-2 sm:p-2.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg sm:rounded-xl group transition-all">
                <ZoomIn className="w-5 h-5 sm:w-5 sm:h-5 group-hover:scale-110 calm-transition" />
              </button>
              <button onClick={() => zoomOut()} className="p-2 sm:p-2.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg sm:rounded-xl group transition-all border-y border-white/5">
                <ZoomOut className="w-5 h-5 sm:w-5 sm:h-5 group-hover:scale-110 calm-transition" />
              </button>
              <button onClick={() => resetTransform()} className="p-2 sm:p-2.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg sm:rounded-xl group transition-all">
                <Maximize className="w-5 h-5 sm:w-5 sm:h-5 group-hover:scale-110 calm-transition" />
              </button>
            </div>

            {/* Mobile Legend Toggle */}
            <div 
              className="sm:hidden absolute left-4 z-10 pointer-events-auto"
              style={{ top: 'calc(var(--safe-top, 0px) + 72px)' }}
            >
              <button 
                onClick={() => setShowLegend(!showLegend)}
                className="liquid-glass px-3 py-2 rounded-xl text-[10px] font-bold text-white flex items-center gap-2 border border-white/10 active:scale-95 transition-all shadow-lg"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                {lang === 'en' ? 'MAP LEGEND' : 'راهنمای نقشه'}
              </button>
            </div>

            <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
              <svg viewBox="0 0 1000 600" className="w-full h-full" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible', willChange: 'transform' }}>
                <defs>
                  {/*
                    TERRAIN: "Felt not seen" — feDisplacementMap subtly warps
                    the land silhouette, removing the perfectly-sharp polygon edge
                    and replacing it with organic micro-variation. Scale=6 = minimal.
                  */}
                  <filter id="subtle-relief" x="-5%" y="-5%" width="110%" height="110%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="4" seed="8" result="noise" />
                    <feGaussianBlur in="noise" stdDeviation="0.5" result="smooth-noise" />
                    <feDisplacementMap in="SourceGraphic" in2="smooth-noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
                  </filter>

                  {/* BORDERS: Glass-edge — soft Gaussian on stroke only */}
                  <filter id="glass-edge" x="-10%" y="-10%" width="120%" height="120%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" />
                  </filter>

                  {/* MARKERS: Glow rings around event pins */}
                  <filter id="eventGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>

                  {/* OCEAN: Deep-space midnight radial */}
                  <radialGradient id="water-depth" cx="50%" cy="50%" r="70%">
                    <stop offset="0%" stopColor="#08182b" />
                    <stop offset="100%" stopColor="#020617" />
                  </radialGradient>

                  {/* RIVERS: Iridescent thin line gradient */}
                  <linearGradient id="river-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.2" />
                  </linearGradient>

                  {/* WATER BODIES: glass fill + glow */}
                  <radialGradient id="sea-fill" cx="50%" cy="30%" r="80%">
                    <stop offset="0%" stopColor="#1e40af" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#0c1a3a" stopOpacity="0.15" />
                  </radialGradient>
                  <filter id="sea-glow" x="-15%" y="-15%" width="130%" height="130%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
                  </filter>

                  {/* RIVERS: flowing, glossy */}
                  <filter id="river-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" />
                  </filter>

                  {/* MOUNTAINS: rough, textured (optional subtle pattern) */}
                  <pattern id="mountain-texture" patternUnits="userSpaceOnUse" width="4" height="4">
                    <rect width="4" height="4" fill="#8a7a6e" />
                    <circle cx="1" cy="1" r="0.5" fill="#7a6a5e" opacity="0.4" />
                  </pattern>
                </defs>

                {/* GPU acceleration layer */}
                <g style={{ willChange: 'transform' }}>

                  {/* Base Ocean */}
                  <rect x="-5000" y="-5000" width="11000" height="10600" fill="url(#water-depth)" />
                  
                  {/*
                    LANDMASS: The physical truth.
                    filter=subtle-relief = "felt not seen" micro-displacement.
                    No specular peaks — just organic edge breath.
                  */}
                  <path
                    d="M -5000 -5000 L 6000 -5000 L 6000 6000 L -5000 6000 Z"
                    fill="#0f172a"
                    fillRule="evenodd"
                    filter="url(#subtle-relief)"
                  />

                  {/*
                    ═══════════════════════════════════════════════════
                    WATER BODIES — Geographically faithful, glass aesthetic
                    Calibration (1000×600 viewport, ~26 SVG/deg lon, ~27 SVG/deg lat):
                      Caspian: 37°N–47.5°N, 49.5°E–54°E
                        → map x: 434–552, y: 8–188  (tall rectangle, Kara-Bogaz Bay at NE)
                      Persian Gulf + Gulf of Oman:
                        PG (NW→SE): x: 308–532, y: 436–530
                        GoO (E): x: 532–718, y: 450–536
                    ═══════════════════════════════════════════════════
                  */}

                  {/* Marginalia: regional labels that fall outside regions */}

                  {/* Marginalia: Handled directly through neighborhood polygons */}


                  {/* Physical Geography */}
                  {/* DISABLED FOR NOW: The user requested to disable rivers and mountains temporarily. We will get back to them later.
                  <g className="pointer-events-none">
                    {mountains.map((mountain) => (
                      <g key={mountain.id} opacity="0.6">
                        {mountain.contours.map((contour, idx) => (
                          <g key={idx}>
                            <path
                              d={createSharpLine(contour, true)}
                              fill="#7a6a5e"
                              opacity="0.1"
                              stroke="none"
                            />
                            <path
                              d={createSharpLine(contour)}
                              fill="none"
                              stroke="#8a7a6e"
                              strokeWidth="1"
                              strokeLinecap="square"
                              strokeLinejoin="miter"
                              strokeDasharray="3,2"
                              opacity="0.8"
                            />
                          </g>
                        ))}
                      </g>
                    ))}
                    
                    {rivers.map((river) => (
                      <path
                        key={river.id}
                        d={createSmoothLine(river.path)}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.75"
                        filter="url(#river-glow)"
                      />
                    ))}
                  </g>
                  */}

                  {/* Political Regions — glass hologram over terrain */}
                  {regions.map((region) => {
                    const style = getRegionStyle(region.id);
                    const regionEvents = activeEvents.filter((e) => e.regionId === region.id);
                    const primaryEvent = regionEvents.find(e => e.status === 'Direct Control') || regionEvents[0];
                    const ruler = primaryEvent ? rulers[primaryEvent.rulerId] : null;
                    const dynasty = ruler ? dynasties[ruler.dynastyId] : null;
                    const controlText = dynasty ? `${dynasty.name[lang]} - ${primaryEvent.status}` : '';
                    const atmosphericOpacity = style.active ? 0.88 + (region.center[1] / 600) * 0.12 : 1;
                    const d = createSmoothPath(region.polygon);

                    return (
                      <g
                        key={region.id}
                        onClick={() => onRegionClick(region.id)}
                        onMouseMove={(e) => {
                          setTooltip({ x: e.clientX, y: e.clientY, text: region.name[lang], subtext: controlText });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        className="cursor-pointer transition-all duration-300 group"
                        opacity={atmosphericOpacity}
                      >
                        {/* ALWAYS-ON geographic skeleton — visible at all times */}
                        <path
                          d={d}
                          fill="transparent"
                          stroke="rgba(255,255,255,0.10)"
                          strokeWidth="0.5"
                          strokeLinejoin="miter"
                          strokeLinecap="square"
                        />

                        {style.active && (<>
                          {/* Glass fill */}
                          <path
                            d={d}
                            fill={style.fill}
                            fillOpacity={style.fillOpacity}
                            stroke="none"
                            style={{ mixBlendMode: style.mixBlendMode, transition: 'fill 0.5s ease' }}
                          />
                          {/* Tapered glow halo (blurred outer stroke) */}
                          <path
                            d={d}
                            fill="none"
                            stroke={style.stroke}
                            strokeWidth={style.strokeWidth * 1.8}
                            strokeOpacity={0.25}
                            strokeLinejoin="miter"
                            filter="url(#glass-edge)"
                          />
                          {/* Authoritative crisp hairline — the real border */}
                          <path
                            d={d}
                            fill="none"
                            stroke={style.stroke}
                            strokeWidth={style.strokeWidth}
                            strokeOpacity={0.75}
                            strokeLinejoin="miter"
                            strokeLinecap="square"
                            style={{ transition: 'stroke 0.5s ease' }}
                          />
                        </>)}

                        <text
                          x={region.center[0]}
                          y={region.center[1]}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="7"
                          fontWeight="600"
                          direction={lang === 'fa' ? 'rtl' : 'ltr'}
                          unicodeBidi="embed"
                          className={`pointer-events-none transition-all duration-500 ${
                            scale > 2.5 
                              ? 'opacity-0' 
                              : style.active 
                                ? 'opacity-80 group-hover:opacity-100' 
                                : 'opacity-25 group-hover:opacity-60'
                          }`}
                          fill={style.active ? '#ffffff' : '#64748b'}
                          style={{ 
                            fontFamily: 'Vazirmatn, Inter, system-ui, sans-serif',
                            filter: style.active 
                              ? 'drop-shadow(0px 2px 4px rgba(0,0,0,0.9)) drop-shadow(0px 0px 6px rgba(255,255,255,0.3))' 
                              : 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))',
                            letterSpacing: lang === 'fa' ? '0' : '2'
                          }}
                        >
                          {lang === 'en' ? region.name[lang].toUpperCase() : region.name[lang]}
                        </text>

                      {/* Cities */}
                      {region.cities?.map(city => (
                        <g key={city.id} className="pointer-events-none calm-transition">
                          <circle 
                            cx={city.coordinates[0]} 
                            cy={city.coordinates[1]} 
                            r="1.2" 
                            fill="#ffffff" 
                            className={`transition-opacity duration-300 ${scale > 1.2 ? 'opacity-60' : 'opacity-0'}`}
                          />
                          <text
                            x={city.coordinates[0]}
                            y={city.coordinates[1] - 6}
                            textAnchor="middle"
                            dominantBaseline="central"
                            direction={lang === 'fa' ? 'rtl' : 'ltr'}
                            unicodeBidi="embed"
                            className={`text-[6px] font-medium transition-opacity duration-300 ${scale > 1.5 ? 'opacity-40' : 'opacity-0'}`}
                            fill="#ffffff"
                            style={{ 
                              fontFamily: 'Vazirmatn, Inter, system-ui, sans-serif',
                              textShadow: '0px 1px 4px rgba(0,0,0,0.8)',
                              letterSpacing: lang === 'fa' ? '0' : '0.5'
                            }}
                          >
                            {city.name[lang]}
                          </text>
                        </g>
                      ))}
                    </g>
                  );
                })}

                {/* Historical Events */}
                {activeHistoricalEvents.map((event) => (
                  <g 
                    key={event.id} 
                    className="cursor-pointer group calm-transition"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onHistoricalEventClick) onHistoricalEventClick(event);
                    }}
                  >
                    <circle
                      cx={event.coordinates![0]}
                      cy={event.coordinates![1]}
                      r="12"
                      fill="rgba(15, 23, 42, 0.6)"
                      stroke={event.type === 'battle' ? '#f43f5e' : event.type === 'downfall' ? '#c084fc' : event.type === 'political' ? '#38bdf8' : '#34d399'}
                      strokeWidth="1.5"
                      className="transition-all duration-300 backdrop-blur-md"
                      style={{ filter: 'url(#eventGlow)' }}
                    />
                    <circle
                      cx={event.coordinates![0]}
                      cy={event.coordinates![1]}
                      r="16"
                      fill="none"
                      stroke={event.type === 'battle' ? '#f43f5e' : event.type === 'downfall' ? '#c084fc' : event.type === 'political' ? '#38bdf8' : '#34d399'}
                      strokeWidth="0.5"
                      className="opacity-0 group-hover:opacity-100 animate-ping"
                      style={{ transformOrigin: `${event.coordinates![0]}px ${event.coordinates![1]}px` }}
                    />
                    <foreignObject 
                      x={event.coordinates![0] - 8} 
                      y={event.coordinates![1] - 8} 
                      width="16" 
                      height="16"
                      className="pointer-events-none"
                    >
                      <div className="w-full h-full flex items-center justify-center">
                        {getEventIcon(event.type)}
                      </div>
                    </foreignObject>
                    <text
                      x={event.coordinates![0]}
                      y={event.coordinates![1] + 20}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      direction={lang === 'fa' ? 'rtl' : 'ltr'}
                      unicodeBidi="embed"
                      className={`text-[8px] font-bold transition-opacity drop-shadow-md bg-slate-900/80 px-1 rounded ${scale > 2.0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      style={{ 
                        fontFamily: 'Vazirmatn, Inter, system-ui, sans-serif',
                      }}
                    >
                      {event.title[lang]}
                    </text>
                  </g>
                ))}

                {/* Artifacts */}
                {activeArtifacts.map((artifact) => (
                  <g 
                    key={artifact.id} 
                    className="cursor-pointer group calm-transition"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onArtifactClick) onArtifactClick(artifact);
                    }}
                  >
                    <circle
                      cx={artifact.coordinates![0]}
                      cy={artifact.coordinates![1]}
                      r="10"
                      fill="rgba(15, 23, 42, 0.6)"
                      stroke="#fbbf24"
                      strokeWidth="1.5"
                      className="transition-all duration-300 backdrop-blur-md"
                      style={{ filter: 'url(#eventGlow)' }}
                    />
                    <circle
                      cx={artifact.coordinates![0]}
                      cy={artifact.coordinates![1]}
                      r="14"
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="0.5"
                      className="opacity-0 group-hover:opacity-100 animate-ping"
                      style={{ transformOrigin: `${artifact.coordinates![0]}px ${artifact.coordinates![1]}px` }}
                    />
                    <foreignObject 
                      x={artifact.coordinates![0] - 8} 
                      y={artifact.coordinates![1] - 8} 
                      width="16" 
                      height="16"
                      className="pointer-events-none"
                    >
                      <div className="w-full h-full flex items-center justify-center">
                        {getArtifactIcon(artifact.type)}
                      </div>
                    </foreignObject>
                    <text
                      x={artifact.coordinates![0]}
                      y={artifact.coordinates![1] + 20}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      direction={lang === 'fa' ? 'rtl' : 'ltr'}
                      unicodeBidi="embed"
                      className={`text-[8px] font-bold transition-opacity drop-shadow-md bg-slate-900/80 px-1 rounded ${scale > 2.0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      style={{ 
                        fontFamily: 'Vazirmatn, Inter, system-ui, sans-serif',
                      }}
                    >
                      {artifact.name[lang]}
                    </text>
                  </g>
                ))}

                {/* ── Vazir Dot Overlay ─────────────────────────────────────── */}
                <foreignObject x="0" y="0" width="1000" height="600" className="pointer-events-none" style={{ overflow: 'visible' }}>
                  <div className="relative w-full h-full pointer-events-none">
                    {vazirClusters.map((cluster, i) => (
                      <div className="pointer-events-auto" key={i}>
                        <VazirDot
                          vazirs={cluster.vazirs}
                          x={cluster.x}
                          y={cluster.y}
                          lang={lang}
                          onClick={onVazirClick ?? (() => {})}
                        />
                      </div>
                    ))}
                  </div>
                </foreignObject>

                  {/* Atmospheric Vignette */}
                  <rect x="-5000" y="-5000" width="11000" height="10600" fill="url(#water-depth)" fillOpacity="0.2" pointerEvents="none" />

                </g>{/* end GPU layer */}
              </svg>
            </TransformComponent>
          </>
        )}}
      </TransformWrapper>
      
      {/* Legend Overlay */}
      <AnimatePresence>
        {(showLegend || (typeof window !== 'undefined' && window.innerWidth >= 640)) && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className={`absolute left-4 sm:left-6 liquid-glass p-3 sm:p-5 rounded-2xl sm:rounded-3xl text-[9px] sm:text-xs font-vazirmatn flex flex-col gap-1.5 sm:gap-3 text-slate-300 pointer-events-auto z-10 calm-transition shadow-2xl ${!showLegend && 'hidden sm:flex'}`}
            style={{ top: 'calc(var(--safe-top, 0px) + 112px)' }}
          >
            <div className="flex justify-between items-center mb-1">
              <div className="font-bold text-white uppercase tracking-wider text-[8px] sm:text-[10px] opacity-80">{lang === 'en' ? 'Legend' : 'راهنما'}</div>
              <button onClick={() => setShowLegend(false)} className="sm:hidden p-1 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-3 h-3 text-slate-400" />
              </button>
            </div>
            <div className="flex items-center gap-2 sm:gap-3"><div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[#a855f7] shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div> {lang === 'en' ? 'Persian/Iranian' : 'ایرانی/پارسی'}</div>
            <div className="flex items-center gap-2 sm:gap-3"><div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div> {lang === 'en' ? 'Arab/Caliphate' : 'عرب/خلافت'}</div>
            <div className="flex items-center gap-2 sm:gap-3"><div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[#ea580c] shadow-[0_0_8px_rgba(234,88,12,0.8)]"></div> {lang === 'en' ? 'Turkic/Mongol' : 'ترک/مغول'}</div>
            <div className="flex items-center gap-2 sm:gap-3"><div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[#0ea5e9] shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div> {lang === 'en' ? 'Hellenic/Greek' : 'یونانی/هلنیستی'}</div>
            <div className="flex items-center gap-2 sm:gap-3"><div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[#b45309] shadow-[0_0_8px_rgba(180,83,9,0.8)]"></div> {lang === 'en' ? 'Nomadic/Steppe' : 'عشایر/استپ'}</div>
            <div className="flex items-center gap-2 sm:gap-3"><div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[#e11d48] shadow-[0_0_8px_rgba(225,29,72,0.8)]"></div> {lang === 'en' ? 'Foreign Imperial' : 'امپراتوری خارجی'}</div>
            <div className="flex items-center gap-2 sm:gap-3"><div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[#78350f] shadow-[0_0_8px_rgba(120,53,15,0.8)]"></div> {lang === 'en' ? 'Babylonian/Semitic' : 'بابلی/سامی'}</div>
            <div className="w-full h-px bg-slate-700/50 my-0.5 sm:my-1"></div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-2 h-2 sm:w-3 sm:h-3 border border-slate-400 flex items-center justify-center rounded-sm">
                <div className="w-full h-[1px] bg-slate-400 rotate-45"></div>
              </div> 
              {lang === 'en' ? 'Contested/Influence' : 'مورد مناقشه/نفوذ'}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-2 h-2 sm:w-3 sm:h-3 border border-slate-400 border-dashed rounded-sm"></div> 
              {lang === 'en' ? 'Vassal State' : 'دولت دست‌نشانده'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Tooltip */}
      {tooltip && (
        <div 
          className="fixed z-50 pointer-events-none bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white px-3 py-2 rounded-xl shadow-2xl transform -translate-x-1/2 -translate-y-[120%] font-sans"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-bold text-sm">{tooltip.text}</div>
          {tooltip.subtext && (
            <div className="text-xs text-slate-300 mt-0.5">{tooltip.subtext}</div>
          )}
        </div>
      )}
    </div>
  );
};
