import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ReignEvent } from '../data/events';
import { Ruler } from '../data/rulers';
import { Dynasty } from '../data/dynasties';
import { HistoricalEvent } from '../data/historicalEvents';
import { Artifact } from '../data/artifacts';
import { regions } from '../data/regions';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2, Swords, Skull, Landmark, Globe2, Crown, Shield, ZoomIn, ZoomOut, Building2, Book, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApiKey } from '../context/ApiKeyContext';
import { formatYear } from '../utils/format';
import { ERAS } from '../data/eras';

interface TimelineProps {
  year: number;
  setYear: (year: number) => void;
  lang: 'en' | 'fa';
  onEventClick: (eventId: string) => void;
  onYearContextClick?: (year: number) => void;
  events: ReignEvent[];
  rulers: Record<string, Ruler>;
  dynasties: Record<string, Dynasty>;
  historicalEvents?: HistoricalEvent[];
  artifacts?: Artifact[];
  onHistoricalEventClick?: (event: HistoricalEvent) => void;
  onArtifactClick?: (artifact: Artifact) => void;
  isLoadingAI?: boolean;
}

const MIN_YEAR = -2700;
const MAX_YEAR = 1950;

export const Timeline: React.FC<TimelineProps> = ({ year, setYear, lang, onEventClick, onYearContextClick, events, rulers, dynasties, historicalEvents = [], artifacts = [], onHistoricalEventClick, onArtifactClick, isLoadingAI }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewWidth, setViewWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      const observer = new ResizeObserver(entries => {
        if (entries[0]) setViewWidth(entries[0].contentRect.width);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, [containerRef.current]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);
  const { apiKey } = useApiKey();

  // Responsive zoom limits
  const minZoom = 0.5;
  const maxZoom = 5;
  const PIXELS_PER_YEAR = 2 * zoomLevel;
  const TOTAL_WIDTH = (MAX_YEAR - MIN_YEAR) * PIXELS_PER_YEAR;

  const coreRegions = useMemo(() => {
    return regions.filter(r => !r.isWater && !r.isNeighbor);
  }, []);

  const regionToIndex = useMemo(() => {
    const map: Record<string, number> = {};
    coreRegions.forEach((r, i) => map[r.id] = i);
    return map;
  }, [coreRegions]);

  const resolveRegion = (item: { regionId?: string; coordinates?: [number, number] }) => {
    if (item.regionId && regionToIndex[item.regionId] !== undefined) return item.regionId;
    if (item.coordinates) {
      // Find nearest region by center
      let minDistance = Infinity;
      let nearestRegionId = regions[0].id;

      regions.forEach(r => {
        const dx = r.center[0] - item.coordinates![0];
        const dy = r.center[1] - item.coordinates![1];
        const dist = dx * dx + dy * dy;
        if (dist < minDistance) {
          minDistance = dist;
          nearestRegionId = r.id;
        }
      });
      return nearestRegionId;
    }
    return regions[0].id; // Fallback
  };

  const { eventRows, maxRow } = useMemo(() => {
    const rows: { [eventId: string]: number } = {};
    events.forEach((event) => {
      rows[event.id] = regionToIndex[resolveRegion(event)] ?? 0;
    });
    return { eventRows: rows, maxRow: coreRegions.length - 1 };
  }, [events, regionToIndex, coreRegions]);

  const clusteredHistoricalEvents = useMemo(() => {
    const clusters: { x: number; regionId: string; events: HistoricalEvent[] }[] = [];
    const CLUSTER_THRESHOLD = 24; // pixels

    // Group by region first
    const eventsByRegion: Record<string, HistoricalEvent[]> = {};
    historicalEvents.forEach(e => {
      const rId = resolveRegion(e);
      if (!eventsByRegion[rId]) eventsByRegion[rId] = [];
      eventsByRegion[rId].push(e);
    });

    Object.entries(eventsByRegion).forEach(([regionId, regionEvents]) => {
      const sortedEvents = [...regionEvents].sort((a, b) => a.year - b.year);
      let currentCluster: { x: number; regionId: string; events: HistoricalEvent[] } | null = null;

      sortedEvents.forEach(event => {
        const x = (event.year - MIN_YEAR) * PIXELS_PER_YEAR;
        
        if (!currentCluster || x - currentCluster.x >= CLUSTER_THRESHOLD) {
          currentCluster = { x, regionId, events: [event] };
          clusters.push(currentCluster);
        } else {
          currentCluster.events.push(event);
          currentCluster.x = currentCluster.events.reduce((sum, e) => sum + (e.year - MIN_YEAR) * PIXELS_PER_YEAR, 0) / currentCluster.events.length;
        }
      });
    });

    return clusters;
  }, [historicalEvents, PIXELS_PER_YEAR, MIN_YEAR]);

  const clusteredArtifacts = useMemo(() => {
    const clusters: { x: number; regionId: string; artifacts: Artifact[] }[] = [];
    const CLUSTER_THRESHOLD = 24; // pixels

    // Group by region first
    const artifactsByRegion: Record<string, Artifact[]> = {};
    artifacts.forEach(a => {
      const rId = resolveRegion(a);
      if (!artifactsByRegion[rId]) artifactsByRegion[rId] = [];
      artifactsByRegion[rId].push(a);
    });

    Object.entries(artifactsByRegion).forEach(([regionId, regionArtifacts]) => {
      const sortedArtifacts = [...regionArtifacts].sort((a, b) => a.year - b.year);
      let currentCluster: { x: number; regionId: string; artifacts: Artifact[] } | null = null;

      sortedArtifacts.forEach(artifact => {
        const x = (artifact.year - MIN_YEAR) * PIXELS_PER_YEAR;
        
        if (!currentCluster || x - currentCluster.x >= CLUSTER_THRESHOLD) {
          currentCluster = { x, regionId, artifacts: [artifact] };
          clusters.push(currentCluster);
        } else {
          currentCluster.artifacts.push(artifact);
          currentCluster.x = currentCluster.artifacts.reduce((sum, a) => sum + (a.year - MIN_YEAR) * PIXELS_PER_YEAR, 0) / currentCluster.artifacts.length;
        }
      });
    });

    return clusters;
  }, [artifacts, PIXELS_PER_YEAR, MIN_YEAR]);

  const isProgrammaticScroll = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleScroll = () => {
    if (!containerRef.current || isDragging || isProgrammaticScroll.current) return;
    const scrollLeft = containerRef.current.scrollLeft;
    // With 50% margin, the timeline's 0 is exactly at scrollLeft = 0 when centered
    const centerPixel = scrollLeft;
    const newYear = Math.round(centerPixel / PIXELS_PER_YEAR) + MIN_YEAR;
    if (newYear !== year) {
      setYear(Math.max(MIN_YEAR, Math.min(MAX_YEAR, newYear)));
    }
  };

  useEffect(() => {
    if (containerRef.current) {
      // With 50% margin, scrollLeft exactly equals the pixel position on the timeline
      const scrollLeft = (year - MIN_YEAR) * PIXELS_PER_YEAR;
      const currentScroll = containerRef.current.scrollLeft;
      const distance = Math.abs(currentScroll - scrollLeft);
      
      if (distance > 2) {
        isProgrammaticScroll.current = true;
        
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        // Use auto for long jumps or when dragging, smooth for short jumps
        const behavior = (isDragging || distance > 1000) ? 'auto' : 'smooth';
        containerRef.current.scrollTo({ left: scrollLeft, behavior });
        
        scrollTimeoutRef.current = setTimeout(() => {
          isProgrammaticScroll.current = false;
        }, behavior === 'smooth' ? 800 : 50);
      }
    }
  }, [year, isDragging, zoomLevel]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setYear(parseInt(e.target.value, 10));
  };

  const activeDynasty = useMemo(() => {
    const activeEvent = events.find(e => 
      e.regionId === 'jibal' && year >= e.startDate && year <= e.endDate
    );
    if (!activeEvent) return null;
    const ruler = rulers[activeEvent.rulerId];
    return dynasties[ruler.dynastyId];
  }, [year, events, rulers, dynasties]);

  const handleNeedleDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const scrollLeft = containerRef.current.scrollLeft;
    
    // Calculate relative x within the scrollable content
    const relativeX = clientX - rect.left + scrollLeft;
    const newYear = Math.round(relativeX / PIXELS_PER_YEAR) + MIN_YEAR;
    setYear(Math.max(MIN_YEAR, Math.min(MAX_YEAR, newYear)));
  };

  const [isDraggingNeedle, setIsDraggingNeedle] = useState(false);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingNeedle) handleNeedleDrag(e as unknown as React.MouseEvent);
    };
    const handleGlobalMouseUp = () => setIsDraggingNeedle(false);

    if (isDraggingNeedle) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingNeedle, PIXELS_PER_YEAR]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'battle': return <Swords className="w-3 h-3 text-rose-400" />;
      case 'downfall': return <Skull className="w-3 h-3 text-purple-400" />;
      case 'political': return <Landmark className="w-3 h-3 text-sky-400" />;
      case 'cultural': return <Globe2 className="w-3 h-3 text-emerald-400" />;
      case 'tradition': return <Sparkles className="w-3 h-3 text-amber-400" />;
      default: return <Sparkles className="w-3 h-3 text-slate-400" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'battle': return 'bg-rose-500/30 border-rose-400/50';
      case 'downfall': return 'bg-purple-500/30 border-purple-400/50';
      case 'political': return 'bg-sky-500/30 border-sky-400/50';
      case 'cultural': return 'bg-emerald-500/30 border-emerald-400/50';
      case 'tradition': return 'bg-amber-500/30 border-amber-400/50';
      default: return 'bg-slate-500/30 border-slate-400/50';
    }
  };

  function getMinimapDotColor(type: string): string {
    switch (type) {
      case 'battle':    return 'bg-rose-400';
      case 'downfall':  return 'bg-purple-400';
      case 'political': return 'bg-sky-400';
      case 'cultural':  return 'bg-emerald-400';
      case 'tradition': return 'bg-amber-400';
      default:          return 'bg-slate-400';
    }
  }

  const persianPresenceByEra = useMemo(() => {
    return ERAS.map(era => {
      const eraEvents = events.filter(e => e.startDate >= era.start && e.startDate < era.end);
      const persianCount = eraEvents.filter(e => {
        const dynasty = dynasties[e.rulerId ? rulers[e.rulerId]?.dynastyId : ''];
        return dynasty?.colorFamily === 'persian';
      }).length;
      const total = eraEvents.length;
      return {
        eraId: era.id,
        start: era.start,
        end: era.end,
        ratio: total > 0 ? persianCount / total : 0,
      };
    });
  }, [events, dynasties, rulers]);
  return (
    <div className="flex flex-col h-full w-full sm:w-auto bg-transparent">
      {/* Slider Control & Zoom */}
      <div className="px-0 sm:px-4 pt-2 pb-6 sm:py-4 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 liquid-glass border-b border-white/5 z-20 calm-transition shadow-lg">
        <div className="px-4 sm:hidden w-full flex items-center justify-between gap-4 h-8 overflow-hidden">
          <span className="text-[10px] sm:text-base font-bold text-slate-100 shrink-0 truncate max-w-[140px] sm:max-w-none whitespace-nowrap bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20 uppercase tracking-wider">
            {activeDynasty ? activeDynasty.name[lang] : (lang === 'en' ? 'Explore with AI' : 'جستجو با هوش مصنوعی')}
          </span>
          
          <div className="flex sm:hidden items-center gap-2 text-[10px] text-slate-400 font-mono">
            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5">{lang === 'en' ? 'Seek' : 'پیمایش'}</span>
          </div>

          {onYearContextClick && (
            <button
              id="tour-timeline-ai-mobile"
              onClick={() => onYearContextClick(year)}
              disabled={isLoadingAI || !apiKey}
              className="sm:hidden flex items-center justify-center gap-1.5 px-3 py-1.5 liquid-glass text-amber-400 border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-[10px] font-medium calm-transition whitespace-nowrap pointer-events-auto shadow-inner"
            >
              {isLoadingAI ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{lang === 'en' ? 'Era' : 'دوران'}</span>
            </button>
          )}
        </div>
        
        <div 
          className="w-full flex-1 flex items-center gap-1 sm:gap-2 px-1 sm:px-1"
          dir="ltr"
        >
          <button 
            onClick={() => setYear(Math.max(MIN_YEAR, year - 5))}
            className="p-2 sm:p-1 hover:bg-white/10 rounded-lg calm-transition text-slate-400 hover:text-white shrink-0 active:scale-125 z-10"
            title={lang === 'en' ? "-5 years" : "-۵ سال"}
          >
            <ChevronLeft className="w-6 h-6 sm:w-4 sm:h-4" />
          </button>

          <div className="flex-1 relative flex items-center h-10 sm:h-8">
            {/* Era Background Tracks (Slider Minimap) */}
            <div className="absolute left-0 right-0 h-2 sm:h-2.5 rounded-full overflow-hidden flex pointer-events-none opacity-60">
              {ERAS.map(era => {
                // Map dark colors to vibrant ones for the minimap
                const vibrantColorMap: Record<string, string> = {
                  'bg-purple-900/10': 'bg-purple-500/40',
                  'bg-teal-900/10': 'bg-emerald-400/40',
                  'bg-amber-900/10': 'bg-amber-500/40',
                  'bg-blue-900/10': 'bg-sky-400/40'
                };
                return (
                  <div 
                    key={era.id}
                    className={vibrantColorMap[era.color] || era.color.replace('900/10', '500/40')}
                    style={{ 
                      width: `${((era.end - era.start) / (MAX_YEAR - MIN_YEAR)) * 100}%`,
                      borderRight: '1px solid rgba(255,255,255,0.1)'
                    }}
                  />
                );
              })}
            </div>

            {/* Viewport Highlight Window */}
            {viewWidth > 0 && (
              <div 
                className="absolute h-4.5 sm:h-4 rounded-md bg-white/20 border border-white/40 pointer-events-none transition-all duration-300 z-5 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                style={{
                  width: `${((viewWidth / PIXELS_PER_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100}%`,
                  left: `${Math.max(0, Math.min(100 - ((viewWidth / PIXELS_PER_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100, ((year - MIN_YEAR - (viewWidth / PIXELS_PER_YEAR) / 2) / (MAX_YEAR - MIN_YEAR)) * 100))}%`,
                }}
              />
            )}

            {/* ─── Minimap Event Dots (pointer-events-none, below the input) ──── */}
            <div className="absolute inset-0 pointer-events-none">
              {historicalEvents.map(event => {
                const pct = ((event.year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
                return (
                  <div
                    key={event.id}
                    className={`absolute w-1.5 h-1.5 rounded-full ${getMinimapDotColor(event.type)}`}
                    style={{
                      left: `${pct}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                    }}
                    title={`${event.title[lang]} · ${Math.abs(event.year)} ${event.year < 0 ? 'BC' : 'AD'}`}
                  />
                );
              })}
            </div>
            {/* ─── End Minimap Event Dots ─────────────────────────────────── */}

            <input
              type="range"
              min={MIN_YEAR}
              max={MAX_YEAR}
              value={year}
              onChange={handleSliderChange}
              onMouseDown={() => setIsDragging(true)}
              onMouseUp={() => setIsDragging(false)}
              onTouchStart={() => setIsDragging(true)}
              onTouchEnd={() => setIsDragging(false)}
              className="w-full h-3 sm:h-2 bg-transparent rounded-full appearance-none cursor-pointer accent-indigo-400 calm-transition relative z-10
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(99,102,241,0.5)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20 sm:[&::-webkit-slider-thumb]:w-4 sm:[&::-webkit-slider-thumb]:h-4"
              dir="ltr"
            />

            {/* ─── Persian Presence Waveform ──────────────────────────────── */}
            <div className="absolute bottom-0 left-0 right-0 flex pointer-events-none" style={{ height: 3 }}>
              {persianPresenceByEra.map(era => {
                const leftPct = ((era.start - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
                const widthPct = ((era.end - era.start) / (MAX_YEAR - MIN_YEAR)) * 100;
                return (
                  <div
                    key={era.eraId}
                    className="absolute bg-amber-400/60"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      height: `${Math.max(1, era.ratio * 4)}px`, // 1px min, 4px max
                      bottom: 0,
                    }}
                    title={`Persian presence: ${Math.round(era.ratio * 100)}%`}
                  />
                );
              })}
            </div>
            {/* ─── End Persian Presence Waveform ──────────────────────────── */}

            {/* Subtle Directional Hints (Mobile Only) */}
            <div className="sm:hidden absolute -bottom-5 left-0 right-0 flex justify-between px-2 pointer-events-none opacity-80 select-none">
              {/* These are purely visual - label positions match LTR coordinate system the slider always uses */}
              <span className="text-[8px] uppercase tracking-[0.2em] font-black text-slate-400">{lang === 'en' ? 'Ancient' : 'گذشته'}</span>
              <span className="text-[8px] uppercase tracking-[0.2em] font-black text-slate-400">{lang === 'en' ? 'Modern' : 'اخیر'}</span>
            </div>
          </div>

          <button 
            onClick={() => setYear(Math.min(MAX_YEAR, year + 5))}
            className="p-2 sm:p-1 hover:bg-white/10 rounded-lg calm-transition text-slate-400 hover:text-white shrink-0 active:scale-125 z-10"
            title={lang === 'en' ? "+5 years" : "+۵ سال"}
          >
            <ChevronRight className="w-6 h-6 sm:w-4 sm:h-4" />
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1 bg-black/20 rounded-xl p-1 shrink-0 ml-auto sm:ml-0" dir="ltr">
          <button 
            onClick={() => setZoomLevel(z => Math.max(minZoom, z - 0.5))}
            disabled={zoomLevel <= minZoom}
            className="p-1.5 hover:bg-white/10 rounded-lg disabled:opacity-30 calm-transition"
          >
            <ZoomOut className="w-4 h-4 text-slate-300" />
          </button>
          <span className="text-xs font-mono text-slate-400 w-8 text-center">{zoomLevel}x</span>
          <button 
            onClick={() => setZoomLevel(z => Math.min(maxZoom, z + 0.5))}
            disabled={zoomLevel >= maxZoom}
            className="p-1.5 hover:bg-white/10 rounded-lg disabled:opacity-30 calm-transition"
          >
            <ZoomIn className="w-4 h-4 text-slate-300" />
          </button>
        </div>

        {onYearContextClick && (
          <button
            id="tour-timeline-ai-desktop"
            onClick={() => onYearContextClick(year)}
            disabled={isLoadingAI || !apiKey}
            className="hidden sm:flex items-center justify-center gap-1.5 px-4 py-2 liquid-glass text-amber-400 border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-sm font-medium calm-transition whitespace-nowrap shrink-0 pointer-events-auto"
            title={!apiKey ? (lang === 'en' ? 'Add your free Gemini key to unlock AI features' : 'برای استفاده از ویژگی‌های هوش مصنوعی کلید جمینای خود را وارد کنید') : (lang === 'en' ? 'Get AI Historical Context for this year' : 'دریافت زمینه تاریخی هوش مصنوعی برای این سال')}
          >
            {isLoadingAI ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{lang === 'en' ? 'Era Context' : 'زمینه دوران'}</span>
          </button>
        )}
      </div>


      {/* Gantt Chart Container */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="hidden sm:block flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar z-30"
        dir="ltr"
      >
        {/* Sticky Region Sidebar */}
        <div className="sticky left-0 z-[60] pointer-events-none w-0 h-0">
          <div className="flex flex-col pt-10 px-3 sm:px-4 bg-gradient-to-r from-slate-950/80 via-slate-950/40 to-transparent w-max min-h-[500px]">
            {coreRegions.map((region, i) => (
              <div
                key={`label-${region.id}`}
                className="h-[40px] flex items-center justify-start transition-opacity duration-300"
              >
                <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-default whitespace-nowrap drop-shadow-md">
                  {region.name[lang]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: `${TOTAL_WIDTH}px`, height: `${Math.max(100, 30 + (maxRow + 1) * 40 + 120)}px`, minHeight: '100%', position: 'relative', margin: '0 50%' }}>
          {/* Era Background Bands */}
          {ERAS.map((era) => {
            const left = (era.start - MIN_YEAR) * PIXELS_PER_YEAR;
            const width = (era.end - era.start) * PIXELS_PER_YEAR;
            return (
              <div 
                key={era.id}
                className={`absolute top-0 bottom-0 ${era.color} border-l ${era.borderColor} pointer-events-none`}
                style={{ left: `${left}px`, width: `${width}px` }}
              >
                {/* Era Title (Top) */}
                <div className="sticky top-6 left-0 px-4 py-1 pointer-events-none">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${era.id === 'ancient' ? 'text-purple-400/60' : era.id === 'early-islamic' ? 'text-teal-400/60' : era.id === 'middle' ? 'text-amber-400/60' : 'text-blue-400/60'}`}>
                    {era.label[lang]}
                  </span>
                </div>

                {/* Transition Marker (Bottom Right) */}
                {era.marker && (
                  <div className="absolute bottom-12 right-0 pr-3 border-r border-inherit pb-4 flex flex-col items-end pointer-events-none translate-x-1/2">
                    <span className="text-[10px] font-medium text-slate-400/80 whitespace-nowrap bg-black/40 px-1.5 py-0.5 rounded-md backdrop-blur-sm border border-white/5">
                      {era.marker[lang]}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {/* Lane dividers & backgrounds */}
          <div className="absolute left-0 w-full border-t border-white/5" style={{ top: '40px' }} />
          {coreRegions.map((region, i) => (
            <div
              key={`lane-${region.id}`}
              className="absolute left-0 w-full border-b border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition-colors"
              style={{
                top: `${40 + i * 40}px`,
                height: '40px'
              }}
            />
          ))}

          {/* Time markers */}
          {Array.from({ length: Math.floor((MAX_YEAR - MIN_YEAR) / 100) + 1 }).map((_, i) => {
            const y = MIN_YEAR + i * 100;
            return (
              <div
                key={y}
                className="absolute top-0 bottom-0 border-l border-slate-700/30 pointer-events-none flex flex-col items-start pl-1 pt-1"
                style={{ left: `${(y - MIN_YEAR) * PIXELS_PER_YEAR}px` }}
              >
                <span className="text-[10px] text-slate-500 font-mono">
                  {formatYear(y, lang)}
                </span>
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-50 flex justify-center"
            style={{ 
              left: `${(year - MIN_YEAR) * PIXELS_PER_YEAR}px`,
              width: '2px'
            }}
          >
            {/* Vertical Line */}
            <div className="absolute inset-y-0 w-full bg-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.5)]" />

            {/* Floating Pill (Top) */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-2 rounded-full bg-slate-900/95 backdrop-blur-md border border-indigo-500/40 shadow-xl flex items-center gap-3 whitespace-nowrap"
              >
                <span className="text-xs font-bold text-white">
                  {formatYear(year, lang)}
                </span>
                {activeDynasty && (
                  <>
                    <div className="w-[1px] h-3 bg-white/20" />
                    <span className="text-xs font-bold text-indigo-400">
                      {activeDynasty.name[lang]}
                    </span>
                  </>
                )}
              </motion.div>
            </div>

            {/* Drag Handle (Bottom) */}
            <div 
              className="absolute bottom-24 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-indigo-500/30 transition-colors pointer-events-auto group z-[60]"
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsDraggingNeedle(true);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setIsDraggingNeedle(true);
              }}
            >
              <div className="w-4 h-4 rounded-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,1)] group-hover:scale-125 transition-transform" />
            </div>
          </div>

          {/* Historical Events Markers */}
          {clusteredHistoricalEvents.map((cluster, index) => {
            const isHovered = hoveredEvent === `cluster-${index}`;
            const isSingle = cluster.events.length === 1;
            const primaryEvent = cluster.events[0];

            return (
              <motion.div
                key={`cluster-${index}`}
                onMouseEnter={() => setHoveredEvent(`cluster-${index}`)}
                onMouseLeave={() => setHoveredEvent(null)}
                onClick={() => {
                  if (isSingle && onHistoricalEventClick) {
                    onHistoricalEventClick(primaryEvent);
                  } else if (!isSingle) {
                    setZoomLevel(z => Math.min(maxZoom, z + 1));
                    setYear(Math.round(cluster.x / PIXELS_PER_YEAR) + MIN_YEAR);
                  }
                }}
                className={`absolute w-6 h-6 -ml-3 rounded-full cursor-pointer flex items-center justify-center border backdrop-blur-md ${isSingle ? getEventColor(primaryEvent.type) : 'bg-slate-700/80 border-slate-500/80 shadow-lg'} hover:scale-125 transition-transform ${isHovered ? 'z-50 ring-2 ring-white/50' : 'z-30'}`}
                style={{ 
                  left: `${cluster.x}px`,
                  top: `${40 + (regionToIndex[cluster.regionId] ?? 0) * 40 + 8}px`
                }}
              >
                {isSingle ? getEventIcon(primaryEvent.type) : <span className="text-[10px] font-bold text-white drop-shadow-md">{cluster.events.length}</span>}

                {/* Cooltip for Historical Events */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.95 }}
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[200px] p-2 rounded-xl bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-lg z-50 flex flex-col gap-1 pointer-events-none"
                    >
                      {isSingle ? (
                        <>
                          <div className="flex items-center gap-1.5 border-b border-white/10 pb-1">
                            {getEventIcon(primaryEvent.type)}
                            <span className="font-bold text-xs text-white drop-shadow-md whitespace-normal text-center leading-tight">{primaryEvent.title[lang]}</span>
                          </div>
                          <span className="text-[9px] text-slate-300 font-mono bg-black/40 px-1 py-0.5 rounded w-fit mx-auto">
                            {formatYear(primaryEvent.year, lang)}
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="font-bold text-xs text-white border-b border-white/10 pb-1 text-center">
                            {cluster.events.length} {lang === 'en' ? 'Events' : 'رویداد'}
                          </div>
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {cluster.events.slice(0, 3).map(e => (
                              <div key={e.id} className="flex items-center gap-1.5 text-[10px] text-slate-200">
                                {getEventIcon(e.type)}
                                <span className="truncate max-w-[160px]">{e.title[lang]}</span>
                              </div>
                            ))}
                            {cluster.events.length > 3 && (
                              <div className="text-[9px] text-slate-400 text-center mt-0.5">
                                +{cluster.events.length - 3} {lang === 'en' ? 'more' : 'بیشتر'}
                              </div>
                            )}
                          </div>
                          <div className="mt-0.5 text-[9px] text-emerald-300/90 font-medium flex items-center justify-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded-md w-full">
                            <ZoomIn className="w-2.5 h-2.5" /> {lang === 'en' ? 'Click to zoom in' : 'برای زوم کلیک کنید'}
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}

          {/* Artifacts */}
          {clusteredArtifacts.map((cluster, i) => {
            const isSingle = cluster.artifacts.length === 1;
            const primaryArtifact = cluster.artifacts[0];
            const isHovered = hoveredEvent === `artifact-cluster-${i}`;

            return (
              <motion.div
                key={`artifact-cluster-${i}`}
                onMouseEnter={() => setHoveredEvent(`artifact-cluster-${i}`)}
                onMouseLeave={() => setHoveredEvent(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSingle && onArtifactClick) {
                    onArtifactClick(primaryArtifact);
                  } else {
                    // Zoom into cluster
                    const newZoom = Math.min(maxZoom, zoomLevel * 2);
                    setZoomLevel(newZoom);
                    setYear(primaryArtifact.year);
                  }
                }}
                className="absolute cursor-pointer z-40"
                style={{ 
                  left: `${cluster.x}px`,
                  top: `${40 + (regionToIndex[cluster.regionId] ?? 0) * 40 + 8}px`
                }}
                whileHover={{ scale: 1.2, zIndex: 50 }}
              >
                <div className={`relative flex items-center justify-center ${isSingle ? 'w-4 h-4' : 'w-6 h-6'} rounded-full bg-amber-500/20 border border-amber-400/50 shadow-[0_0_10px_rgba(251,191,36,0.5)] backdrop-blur-sm`}>
                  {isSingle ? (
                    <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,1)]" />
                  ) : (
                    <span className="text-[10px] font-bold text-amber-100">{cluster.artifacts.length}</span>
                  )}
                </div>

                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.95 }}
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[200px] p-2 rounded-xl bg-slate-900/80 backdrop-blur-xl border border-amber-500/30 shadow-lg z-50 flex flex-col gap-1 pointer-events-none"
                    >
                      {isSingle ? (
                        <>
                          <div className="flex items-center gap-1.5 border-b border-amber-500/30 pb-1">
                            <span className="font-bold text-xs text-amber-100 drop-shadow-md whitespace-normal text-center leading-tight">{primaryArtifact.name[lang]}</span>
                          </div>
                          <span className="text-[9px] text-amber-200/70 font-mono bg-black/40 px-1 py-0.5 rounded w-fit mx-auto">
                            {formatYear(primaryArtifact.year, lang)}
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="font-bold text-xs text-amber-100 border-b border-amber-500/30 pb-1 text-center">
                            {cluster.artifacts.length} {lang === 'en' ? 'Artifacts' : 'آثار'}
                          </div>
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {cluster.artifacts.slice(0, 3).map(a => (
                              <div key={a.id} className="flex items-center gap-1.5 text-[10px] text-amber-200/80">
                                <span className="truncate max-w-[160px]">{a.name[lang]}</span>
                              </div>
                            ))}
                            {cluster.artifacts.length > 3 && (
                              <div className="text-[9px] text-amber-400/50 text-center mt-0.5">
                                +{cluster.artifacts.length - 3} {lang === 'en' ? 'more' : 'بیشتر'}
                              </div>
                            )}
                          </div>
                          <div className="mt-0.5 text-[9px] text-amber-300/90 font-medium flex items-center justify-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded-md w-full">
                            <ZoomIn className="w-2.5 h-2.5" /> {lang === 'en' ? 'Click to zoom in' : 'برای زوم کلیک کنید'}
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}

          {/* Events */}
          {events.map((event) => {
            const ruler = rulers[event.rulerId];
            const dynasty = dynasties[ruler.dynastyId];
            const row = eventRows[event.id];
            
            if (!ruler || !dynasty) return null; // Safety check for dynamic data

            let bgColor = 'bg-slate-500/30';
            let borderColor = 'border-slate-400/30';
            let icon = <Crown className="w-3 h-3 min-w-[12px] opacity-80" />;

            if (dynasty.colorFamily === 'persian') { 
              bgColor = 'bg-purple-500/30'; 
              borderColor = 'border-purple-300/40';
              icon = <Crown className="w-3 h-3 min-w-[12px] opacity-80 text-purple-100" />;
            } else if (dynasty.colorFamily === 'arab') { 
              bgColor = 'bg-emerald-500/30'; 
              borderColor = 'border-emerald-300/40';
              icon = <Crown className="w-3 h-3 min-w-[12px] opacity-80 text-emerald-100" />;
            } else if (dynasty.colorFamily === 'turkic') { 
              bgColor = 'bg-orange-600/30'; 
              borderColor = 'border-orange-400/40';
              icon = <Crown className="w-3 h-3 min-w-[12px] opacity-80 text-orange-100" />;
            } else if (dynasty.colorFamily === 'greek') { 
              bgColor = 'bg-sky-500/30'; 
              borderColor = 'border-sky-300/40';
              icon = <Landmark className="w-3 h-3 min-w-[12px] opacity-80 text-sky-100" />;
            } else if (dynasty.colorFamily === 'nomadic') { 
              bgColor = 'bg-amber-700/30'; 
              borderColor = 'border-amber-500/40';
              icon = <Shield className="w-3 h-3 min-w-[12px] opacity-80 text-amber-100" />;
            } else if (dynasty.colorFamily === 'foreign') { 
              bgColor = 'bg-rose-600/30'; 
              borderColor = 'border-rose-400/40';
              icon = <Shield className="w-3 h-3 min-w-[12px] opacity-80 text-rose-100" />;
            } else if (dynasty.colorFamily === 'semitic') { 
              bgColor = 'bg-amber-900/30'; 
              borderColor = 'border-amber-700/40';
              icon = <Crown className="w-3 h-3 min-w-[12px] opacity-80 text-amber-100" />;
            }

            const left = (event.startDate - MIN_YEAR) * PIXELS_PER_YEAR;
            const width = Math.max(4, (event.endDate - event.startDate) * PIXELS_PER_YEAR);
            const isHovered = hoveredEvent === event.id;

            // Semantic zoom: hide text if capsule is too small
            const showText = width > 50;
            const showIcon = width > 20;

            return (
              <motion.div
                key={event.id}
                onMouseEnter={() => setHoveredEvent(event.id)}
                onMouseLeave={() => setHoveredEvent(null)}
                onClick={() => onEventClick(event.id)}
                className={`absolute h-8 rounded-xl cursor-pointer flex items-center px-1.5 text-[11px] font-medium text-white ${bgColor} ${borderColor} border shadow-sm backdrop-blur-md hover:brightness-125 transition-all ${isHovered ? 'z-40 ring-1 ring-white/50' : 'z-10'}`}
                style={{
                  left: `${left}px`,
                  width: `${width}px`,
                  top: `${40 + row * 40}px`,
                }}
                whileHover={{ scale: 1.02, y: -2 }}
              >
                <div className="flex items-center gap-1.5 overflow-hidden w-full pointer-events-none">
                  {showIcon && icon}
                  {showText && <span className="truncate drop-shadow-md">{ruler.name[lang]}</span>}
                </div>

                {/* Cooltip */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.95 }}
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[200px] p-2 rounded-xl bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-lg z-50 flex flex-col gap-1 pointer-events-none"
                    >
                      <div className="flex items-center gap-1.5 border-b border-white/10 pb-1">
                        {icon}
                        <span className="font-bold text-xs text-white drop-shadow-md truncate">{ruler.name[lang]}</span>
                      </div>
                      <span className="text-[10px] text-slate-300 truncate">{dynasty.name[lang]}</span>
                      <span className="text-[9px] text-slate-400 font-mono bg-black/40 px-1 py-0.5 rounded w-fit">
                        {formatYear(event.startDate, lang)} - {formatYear(event.endDate, lang)} ({event.endDate - event.startDate} yrs)
                      </span>
                      <div className="mt-0.5 text-[9px] text-emerald-300/90 font-medium flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded-md w-fit">
                        <Sparkles className="w-2.5 h-2.5" /> {lang === 'en' ? 'Click to explore' : 'برای کاوش کلیک کنید'}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Scroll down indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center gap-1 opacity-40">
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">{lang === 'en' ? 'More regions' : 'مناطق بیشتر'}</div>
          <motion.div 
            animate={{ y: [0, 4, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
