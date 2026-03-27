import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, Loader2, Swords, Skull, Landmark, Globe2, User, Book, Lightbulb, Palette, Building2, MapPin, ChevronUp, AlertCircle } from 'lucide-react';
import { HistoricalEvent } from '../data/historicalEvents';
import { HistoricalFigure } from '../data/figures';
import { Artifact } from '../data/artifacts';
import { useApiKey } from '../context/ApiKeyContext';
import { MythCard } from './MythCard';
import { getQuestionsForYear } from '../data/quizQuestions';
import { QuizQuestion } from '../types/quiz';

// ── Snap definitions ────────────────────────────────────────────────────────
// COLLAPSED  = handle bar only. Height = 60px + safe-bottom
// HALF       = 50vh  (map still peeking above)
// FULL       = 100vh - 48px topBar (map fully hidden)
type SnapPoint = 'collapsed' | 'half' | 'full';

const CSS_VAR = '--sheet-height';

// ── Icon helpers ─────────────────────────────────────────────────────────────
function getEventIcon(type: string) {
  switch (type) {
    case 'battle':    return <Swords   className="w-4 h-4 text-rose-400"    />;
    case 'downfall':  return <Skull    className="w-4 h-4 text-purple-400"  />;
    case 'political': return <Landmark className="w-4 h-4 text-sky-400"     />;
    case 'cultural':  return <Globe2   className="w-4 h-4 text-emerald-400" />;
    default:          return <Sparkles className="w-4 h-4 text-amber-400"   />;
  }
}
function getEventColor(type: string) {
  switch (type) {
    case 'battle':    return 'border-rose-500/30 bg-rose-500/10';
    case 'downfall':  return 'border-purple-500/30 bg-purple-500/10';
    case 'political': return 'border-sky-500/30 bg-sky-500/10';
    case 'cultural':  return 'border-emerald-500/30 bg-emerald-500/10';
    default:          return 'border-amber-500/30 bg-amber-500/10';
  }
}
function getFigureIcon(type: string) {
  switch (type) {
    case 'philosopher': return <Lightbulb className="w-4 h-4 text-amber-400"   />;
    case 'poet':        return <Book      className="w-4 h-4 text-purple-400"  />;
    case 'scientist':   return <Globe2    className="w-4 h-4 text-sky-400"     />;
    case 'artist':      return <Palette   className="w-4 h-4 text-rose-400"    />;
    default:            return <User      className="w-4 h-4 text-emerald-400" />;
  }
}
function getFigureColor(type: string) {
  switch (type) {
    case 'philosopher': return 'border-amber-500/30 bg-amber-500/10';
    case 'poet':        return 'border-purple-500/30 bg-purple-500/10';
    case 'scientist':   return 'border-sky-500/30 bg-sky-500/10';
    case 'artist':      return 'border-rose-500/30 bg-rose-500/10';
    default:            return 'border-emerald-500/30 bg-emerald-500/10';
  }
}
function getArtifactIcon(type: string) {
  switch (type) {
    case 'monument':     return <Building2 className="w-4 h-4 text-amber-400"   />;
    case 'architecture': return <Landmark  className="w-4 h-4 text-sky-400"     />;
    case 'manuscript':   return <Book      className="w-4 h-4 text-purple-400"  />;
    default:             return <Sparkles  className="w-4 h-4 text-emerald-400" />;
  }
}
function getArtifactColor(type: string) {
  switch (type) {
    case 'monument':     return 'border-amber-500/30 bg-amber-500/10';
    case 'architecture': return 'border-sky-500/30 bg-sky-500/10';
    case 'manuscript':   return 'border-purple-500/30 bg-purple-500/10';
    default:             return 'border-emerald-500/30 bg-emerald-500/10';
  }
}

// ── Props ────────────────────────────────────────────────────────────────────
interface BottomSheetProps {
  year: number;
  lang: 'en' | 'fa';
  events: HistoricalEvent[];
  figures: HistoricalFigure[];
  artifacts: Artifact[];
  onEventClick:    (e: HistoricalEvent)  => void;
  onFigureClick:   (f: HistoricalFigure) => void;
  onArtifactClick: (a: Artifact)         => void;
  onFetchAIEvents:    (year: number) => void;
  onFetchAIFigures:   (year: number) => void;
  onFetchAIArtifacts: (year: number) => void;
  isLoadingAI:         boolean;
  isLoadingAIFigures:  boolean;
   isLoadingAIArtifacts:boolean;
  setShowSettings?:    (show: boolean) => void;
  onOpenQuiz: (questions: QuizQuestion[]) => void;
}

// ── Component ────────────────────────────────────────────────────────────────
export const BottomSheet: React.FC<BottomSheetProps> = ({
  year, lang, events, figures, artifacts,
  onEventClick, onFigureClick, onArtifactClick,
  onFetchAIEvents, onFetchAIFigures, onFetchAIArtifacts,
  isLoadingAI, isLoadingAIFigures, isLoadingAIArtifacts,
  setShowSettings,
  onOpenQuiz
}) => {
  const [snap, setSnap] = useState<SnapPoint>('collapsed');
  const [activeTab, setActiveTab] = useState<'events' | 'figures' | 'artifacts'>('events');
  const { apiKey } = useApiKey();
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  // Drag tracking
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0); 
  const dragStartY = useRef(0);
  const lastTime = useRef(0);
  const lastY = useRef(0);
  const velocity = useRef(0);
  // Whether the current drag started on the content area (not the handle)
  const dragOnContent = useRef(false);
  // Touch-based drag for half-state content area
  const touchDragActive = useRef(false);
  const touchDragStartY = useRef(0);
  // Keep snap in a ref so non-passive event listeners have current value
  const snapRef = useRef<SnapPoint>(snap);
  useEffect(() => { snapRef.current = snap; }, [snap]);

  // Full sheet height — always rendered at this size
  const getFullHeight = useCallback((): number => {
    if (typeof window === 'undefined') return 600;
    const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-top') || '0');
    return window.innerHeight - 48 - safeTop;
  }, []);

  // Get pixel height for each snap detent
  const getDetentPixels = useCallback((point: SnapPoint): number => {
    if (typeof window === 'undefined') return 60;
    const vh = window.innerHeight;
    const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-top') || '0');
    const safeBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom') || '0');
    switch (point) {
      case 'collapsed': return 60 + safeBottom;
      case 'half': return vh * 0.5;
      case 'full': return vh - 48 - safeTop;
      default: return 60;
    }
  }, []);

  // translateY offset: how far DOWN from full to show the current snap
  const getTranslateY = useCallback((point: SnapPoint, extraDrag = 0): number => {
    const full = getFullHeight();
    const snap = getDetentPixels(point);
    const offset = full - snap - extraDrag; // positive = translated down
    return Math.max(0, offset);
  }, [getFullHeight, getDetentPixels]);

  // Update CSS var for the Chatbot FAB offset
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 640) {
      document.documentElement.style.setProperty(CSS_VAR, '0px');
      return;
    }
    const snapPx = getDetentPixels(snap) + dragOffset;
    document.documentElement.style.setProperty(CSS_VAR, `${Math.max(60, snapPx)}px`);
  }, [snap, isDragging, dragOffset, getDetentPixels]);

  // Layer 3: non-passive touchmove listener to block pull-to-refresh on Safari.
  // React synthetic events are always passive and cannot call preventDefault().
  // We attach a raw listener with { passive: false } on the whole sheet so we
  // can intercept downward overscroll gestures before the browser acts on them.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || typeof window === 'undefined') return;

    // Only apply on mobile (desktop uses the EventsPanel sidebar, not this sheet)
    if (window.innerWidth >= 640) return;

    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const currentSnap = snapRef.current;
      // Only intercept in half or full snap — collapsed has nothing to drag
      if (currentSnap === 'collapsed') return;

      const deltaY = e.touches[0].clientY - startY; // positive = dragging down

      if (currentSnap === 'half') {
        // In half-mode the whole sheet is our drag target.
        // If the user is dragging down, prevent the browser from treating it
        // as pull-to-refresh. The actual snap logic is handled by onContentTouchMove.
        if (deltaY > 0) {
          e.preventDefault();
        }
      } else if (currentSnap === 'full') {
        // In full-mode only intercept when the scroll container is at the top.
        // If there's scroll remaining, let the browser scroll normally.
        const scrollTop = scrollRef.current?.scrollTop ?? 0;
        if (scrollTop === 0 && deltaY > 0) {
          e.preventDefault();
        }
      }
    };

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
    };
  }, []); // runs once — uses snapRef (always current) and scrollRef

  // Pointer drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent, onContent = false) => {
    dragOnContent.current = onContent;
    setIsDragging(true);
    dragStartY.current = e.clientY;
    lastY.current = e.clientY;
    lastTime.current = Date.now();
    velocity.current = 0;
    setDragOffset(0);
    // Only capture pointer on the handle — content drags should not steal clicks from buttons
    if (!onContent) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    
    const deltaY = dragStartY.current - e.clientY;

    // In full snap + dragging on content: only allow downward drag when scrolled to top
    if (dragOnContent.current && snap === 'full') {
      const scrollTop = scrollRef.current?.scrollTop ?? 0;
      if (scrollTop > 0 || deltaY > 0) return; // let the scroll handle it
    }

    setDragOffset(deltaY);

    // Calculate velocity (px/ms)
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
        velocity.current = (lastY.current - e.clientY) / dt;
    }
    lastY.current = e.clientY;
    lastTime.current = now;
  }, [isDragging, snap]);

  const onPointerUp = useCallback((e?: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    // If drag started on content and total movement was tiny, treat as a tap — let the click fire naturally
    const totalDrag = Math.abs(dragStartY.current - (e?.clientY ?? dragStartY.current));
    if (dragOnContent.current && totalDrag < 8) {
      setDragOffset(0);
      return;
    }

    const currentHeight = getDetentPixels(snap) + dragOffset;
    const detents: SnapPoint[] = ['collapsed', 'half', 'full'];
    const detentHeights = detents.map(d => getDetentPixels(d));

    let finalSnap = snap;

    // Fast flick logic
    if (Math.abs(velocity.current) > 0.5) {
        if (velocity.current > 0) {
            // Flick up
            finalSnap = snap === 'collapsed' ? 'half' : 'full';
        } else {
            // Flick down
            finalSnap = snap === 'full' ? 'half' : 'collapsed';
        }
    } else {
        // Snap to nearest
        let minDiff = Infinity;
        detentHeights.forEach((h, i) => {
            const diff = Math.abs(h - currentHeight);
            if (diff < minDiff) {
                minDiff = diff;
                finalSnap = detents[i];
            }
        });
    }

    if (finalSnap !== snap) {
        try { navigator.vibrate(6); } catch(e) {}
    }
    
    setSnap(finalSnap);
    setDragOffset(0);
  }, [isDragging, dragOffset, snap, getDetentPixels]);

  // Track scroll position for the separator line
  const onScrollContent = useCallback(() => {
    if (scrollRef.current) {
      setIsScrolled(scrollRef.current.scrollTop > 2);
    }
  }, []);

  // Touch handlers for half-mode: whole sheet is draggable via touch
  const onContentTouchStart = useCallback((e: React.TouchEvent) => {
    if (snap !== 'half') return;
    touchDragActive.current = true;
    touchDragStartY.current = e.touches[0].clientY;
    dragStartY.current = e.touches[0].clientY;
    lastY.current = e.touches[0].clientY;
    lastTime.current = Date.now();
    velocity.current = 0;
  }, [snap]);

  const onContentTouchMove = useCallback((e: React.TouchEvent) => {
    if (snap !== 'half' || !touchDragActive.current) return;
    const touchY = e.touches[0].clientY;
    const delta = touchDragStartY.current - touchY; // positive = up

    // Only intercept if dragging upward (expand) or downward (collapse)
    // Let scroll handle if content is already at bottom and dragging down
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = (lastY.current - touchY) / dt;
    }
    lastY.current = touchY;
    lastTime.current = now;

    // If dragging up significantly, expand to full
    if (delta > 20) {
      touchDragActive.current = false;
      setSnap('full');
      try { navigator.vibrate(6); } catch(err) {}
      return;
    }

    // Update drag offset for visual feedback (downward only)
    if (delta < 0) {
      setIsDragging(true);
      setDragOffset(delta);
    }
  }, [snap]);

  const onContentTouchEnd = useCallback(() => {
    if (!touchDragActive.current) return;
    touchDragActive.current = false;

    // If was dragging down and fast flick, collapse
    if (velocity.current < -0.5) {
      setSnap('collapsed');
      try { navigator.vibrate(6); } catch(err) {}
    }
    setIsDragging(false);
    setDragOffset(0);
  }, []);

  // Touch handlers for full-mode scroll: drag down when at top to collapse
  const onFullScrollTouchStart = useCallback((e: React.TouchEvent) => {
    if (snap !== 'full') return;
    if ((scrollRef.current?.scrollTop ?? 0) > 0) return; // only intercept at top
    touchDragActive.current = true;
    touchDragStartY.current = e.touches[0].clientY;
    dragStartY.current = e.touches[0].clientY;
    lastY.current = e.touches[0].clientY;
    lastTime.current = Date.now();
    velocity.current = 0;
  }, [snap]);

  const onFullScrollTouchMove = useCallback((e: React.TouchEvent) => {
    if (snap !== 'full' || !touchDragActive.current) return;
    if ((scrollRef.current?.scrollTop ?? 0) > 0) {
      // User scrolled, stop intercepting
      touchDragActive.current = false;
      setIsDragging(false);
      setDragOffset(0);
      return;
    }
    const touchY = e.touches[0].clientY;
    const delta = touchDragStartY.current - touchY; // positive=up, negative=down

    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) velocity.current = (lastY.current - touchY) / dt;
    lastY.current = touchY;
    lastTime.current = now;

    if (delta < 0) { // dragging down
      setIsDragging(true);
      setDragOffset(delta);
    }
  }, [snap]);

  const onFullScrollTouchEnd = useCallback(() => {
    if (!touchDragActive.current) return;
    touchDragActive.current = false;

    if (velocity.current < -0.5 || dragOffset < -60) {
      setSnap('half');
      try { navigator.vibrate(6); } catch(err) {}
    }
    setIsDragging(false);
    setDragOffset(0);
  }, [dragOffset]);

  const activeEvents    = events.filter(e  => Math.abs(e.year - year)        <= 25 ).sort((a,b)=>a.year-b.year);
  const activeFigures   = figures.filter(f => year >= f.birthYear - 10 && year <= f.deathYear + 10).sort((a,b)=>a.birthYear-b.birthYear);
  const activeArtifacts = artifacts.filter(a => Math.abs(a.year - year) <= 100).sort((a,b)=>a.year-b.year);

  const mythsForEra = React.useMemo(() => {
    return getQuestionsForYear(year);
  }, [year]);

  const isLoading = activeTab === 'events' ? isLoadingAI : activeTab === 'figures' ? isLoadingAIFigures : isLoadingAIArtifacts;
  const handleFetch = () => {
    if (activeTab === 'events')    onFetchAIEvents(year);
    else if (activeTab === 'figures') onFetchAIFigures(year);
    else                           onFetchAIArtifacts(year);
  };

  // ── GPU-accelerated translateY animation ──────────────────────────────────
  // The sheet is always at full height. We slide it DOWN via translateY to simulate snap points.
  // This avoids ANY layout recalculation during animation — pure compositor thread = 60fps.
  const fullHeight = getFullHeight();
  const translateY = isDragging
    ? getTranslateY(snap, dragOffset)   // live drag: no transition
    : getTranslateY(snap, 0);           // snapped: spring transition

  return (
    <div
      ref={sheetRef}
      id="tour-events-panel"
      style={{
        height: fullHeight,
        transform: `translateY(${translateY}px)`,
        transition: isDragging
          ? 'none'
          : 'transform 0.38s cubic-bezier(0.16, 1, 0.3, 1)',
        flexShrink: 0,
        zIndex: 20,
        willChange: 'transform',
        userSelect: isDragging ? 'none' : 'auto',
      }}
      className="w-full relative bg-slate-900/95 backdrop-blur-xl border-t border-white/10 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] overflow-hidden"
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
    >
      {/* ── Drag Handle ─────────────────────────────────────────────────── */}
      {/* Always draggable handle strip */}
      <div
        className="drag-handle flex flex-col items-center justify-start pt-3 pb-5 w-full select-none"
        style={{
          height: 60,
          flexShrink: 0,
          touchAction: 'none',
          cursor: snap === 'full' ? 'default' : 'grab',
        }}
        onPointerDown={(e) => onPointerDown(e, false)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Pill indicator */}
        <div className="w-10 h-1.5 rounded-full bg-white/30 mb-2" />
        <div className="flex w-full px-5 justify-between items-center">
          <span className="font-serif font-bold text-white text-sm">
            {lang === 'en' ? 'Explore this Era' : 'این دوره را کاوش کنید'}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400 bg-black/20 px-2 py-0.5 rounded-lg border border-white/10">
              {Math.abs(year)}{year < 0 ? ' BC' : ' AD'}
            </span>
            <ChevronUp
              className="w-4 h-4 text-slate-400 transition-transform"
              style={{ transform: snap === 'full' ? 'rotate(180deg)' : snap === 'half' ? 'rotate(90deg)' : 'rotate(0deg)' }}
            />
          </div>
        </div>
      </div>
      {/* Thin separator line — appears only when full + scrolled (like Google Maps) */}
      <div
        className="w-full shrink-0 transition-opacity duration-200"
        style={{
          height: 1,
          background: 'rgba(255,255,255,0.08)',
          opacity: snap === 'full' && isScrolled ? 1 : 0,
        }}
      />

      {/* ── Content — always mounted, visibility driven by opacity + pointerEvents ── */}
      <div
        className="flex flex-col"
        style={{
          height: 'calc(100% - 61px)', // 60px handle + 1px separator
          touchAction: 'pan-y',
          cursor: snap === 'half' ? 'grab' : 'default',
          // Pointer events only when sheet is expanded
          pointerEvents: snap === 'collapsed' ? 'none' : 'auto',
          // Fade content in/out quickly — GPU opacity, not layout
          opacity: snap === 'collapsed' ? 0 : 1,
          transition: isDragging ? 'none' : 'opacity 0.15s ease',
        }}
        onTouchStart={snap === 'half' ? onContentTouchStart : undefined}
        onTouchMove={snap === 'half' ? onContentTouchMove : undefined}
        onTouchEnd={snap === 'half' ? onContentTouchEnd : undefined}
        onTouchCancel={snap === 'half' ? onContentTouchEnd : undefined}
      >
            <div className="px-4 pb-3 pt-1 border-b border-white/5 shrink-0">
              <div className="flex bg-black/20 rounded-xl p-1 border border-white/5">
                {(['events', 'figures', 'artifacts'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${activeTab === tab ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {lang === 'en'
                      ? tab === 'events' ? 'Events' : tab === 'figures' ? 'Figures' : 'Heritage'
                      : tab === 'events' ? 'رویدادها' : tab === 'figures' ? 'شخصیت‌ها' : 'میراث'}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={scrollRef}
              onScroll={onScrollContent}
              className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 custom-scrollbar"
              style={{ overscrollBehaviorY: 'contain' }}
              onTouchStart={snap === 'full' ? onFullScrollTouchStart : undefined}
              onTouchMove={snap === 'full' ? onFullScrollTouchMove : undefined}
              onTouchEnd={snap === 'full' ? onFullScrollTouchEnd : undefined}
              onTouchCancel={snap === 'full' ? onFullScrollTouchEnd : undefined}
            >
              {activeTab === 'events' && (
                <>
                  <MythCard 
                    question={mythsForEra.length > 0 ? mythsForEra[0] : undefined} 
                    lang={lang} 
                    year={year}
                    hasApiKey={!!apiKey}
                    onOpenQuiz={() => onOpenQuiz(mythsForEra)}
                    onOpenSettings={() => setShowSettings && setShowSettings(true)}
                  />
                  {activeEvents.length > 0 ? activeEvents.map(event => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className={`w-full text-left rtl:text-right p-4 rounded-2xl border cursor-pointer transition-all active:scale-[0.98] min-h-[56px] shrink-0 ${getEventColor(event.type)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 bg-black/20 rounded-full shrink-0">{getEventIcon(event.type)}</div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-slate-200 text-sm leading-tight truncate flex-1">{event.title[lang]}</h4>
                        <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap shrink-0">{Math.abs(event.year)} {event.year < 0 ? 'BC' : 'AD'}</span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{event.description[lang]}</p>
                    </div>
                  </div>
                </button>
                  )) : (
                    !mythsForEra.length && (
                      <p className="text-center py-12 text-slate-500 text-sm italic">
                        {lang === 'en' ? 'No major events in this era.' : 'رویداد مهمی در این دوره ثبت نشده است.'}
                      </p>
                    )
                  )}
                </>
              )}

              {activeTab === 'figures' && (activeFigures.length > 0 ? activeFigures.map(figure => (
                <button
                  key={figure.id}
                  onClick={() => onFigureClick(figure)}
                  className={`w-full text-left rtl:text-right p-4 rounded-2xl border cursor-pointer transition-all active:scale-[0.98] min-h-[56px] shrink-0 ${getFigureColor(figure.type)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 bg-black/20 rounded-full shrink-0">{getFigureIcon(figure.type)}</div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-slate-200 text-sm leading-tight truncate flex-1">{figure.name[lang]}</h4>
                        <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap shrink-0">
                          {Math.abs(figure.birthYear)}{figure.birthYear < 0 ? ' BC' : ''} – {Math.abs(figure.deathYear)}{figure.deathYear < 0 ? ' BC' : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{figure.description[lang]}</p>
                    </div>
                  </div>
                </button>
              )) : (
                <p className="text-center py-12 text-slate-500 text-sm italic">
                  {lang === 'en' ? 'No major figures in this era.' : 'شخصیت مهمی در این دوره ثبت نشده است.'}
                </p>
              ))}

              {activeTab === 'artifacts' && (activeArtifacts.length > 0 ? activeArtifacts.map(artifact => (
                <button
                  key={artifact.id}
                  onClick={() => onArtifactClick(artifact)}
                  className={`w-full text-left rtl:text-right p-4 rounded-2xl border cursor-pointer transition-all active:scale-[0.98] min-h-[56px] shrink-0 ${getArtifactColor(artifact.type)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 bg-black/20 rounded-full shrink-0">{getArtifactIcon(artifact.type)}</div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-slate-200 text-sm leading-tight truncate flex-1">{artifact.name[lang]}</h4>
                        <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap shrink-0">{Math.abs(artifact.year)}{artifact.year < 0 ? ' BC' : ' AD'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{artifact.currentLocation[lang]}</span>
                      </div>
                    </div>
                  </div>
                </button>
              )) : (
                <p className="text-center py-12 text-slate-500 text-sm italic">
                  {lang === 'en' ? 'No major heritage in this era.' : 'میراث مهمی در این دوره ثبت نشده است.'}
                </p>
              ))}
            </div>

            <div 
              className="px-4 py-3 border-t border-white/5 shrink-0 flex flex-col gap-3"
              style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}
            >
              {!apiKey && setShowSettings && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl liquid-glass border-white/5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-[11px] text-amber-100 font-medium whitespace-nowrap">
                    {lang === 'en' ? 'Add Gemini key to unlock AI' : 'کلید جمینای را اضافه کنید'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
                    className="ml-auto px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-[10px] font-bold calm-transition"
                  >
                    {lang === 'en' ? 'Add' : 'افزودن'}
                  </button>
                </div>
              )}
              <button
                id="tour-ai-fetch"
                onClick={(e) => { e.stopPropagation(); handleFetch(); }}
                disabled={isLoading || !apiKey}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 liquid-glass text-indigo-300 border border-white/10 rounded-2xl hover:bg-white/10 active:scale-[0.98] calm-transition disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>
                  {lang === 'en'
                    ? (activeTab === 'events' ? 'Discover More with AI' : activeTab === 'figures' ? 'Find More Figures with AI' : 'Find More Heritage with AI')
                    : (activeTab === 'events' ? 'کشف رویدادهای بیشتر' : activeTab === 'figures' ? 'یافتن شخصیت‌های بیشتر' : 'مشاهده میراث بیشتر')}
                </span>
              </button>
            </div>
      </div>
    </div>
  );
};
