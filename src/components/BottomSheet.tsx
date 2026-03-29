import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, startTransition, useMemo } from 'react';
import { Sparkles, Loader2, Swords, Skull, Landmark, Globe2, User, Book, Lightbulb, Palette, Building2, MapPin, ChevronUp, AlertCircle } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { HistoricalEvent } from '../data/historicalEvents';
import { HistoricalFigure } from '../data/figures';
import { Artifact } from '../data/artifacts';
import { useApiKey } from '../context/ApiKeyContext';
import { MythCard } from './MythCard';
import { getQuestionsForYear } from '../data/quizQuestions';
import { QuizQuestion } from '../types/quiz';
import { HistorianCardSection } from './HistorianCardSection';
import { ByokGate } from './ByokGate';
import { getHistorianCard } from '../utils/getHistorianCard';

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
  onJumpToYear?: (year: number) => void;
  selectedVazir?: any;
  onVazirClose?: () => void;
  onVazirClick?: (v: any) => void;
  onBannerClick?: (url: string, title: string) => void;
  onSnapChange?: (snap: 'collapsed' | 'half' | 'full') => void;
}

// ── Component ────────────────────────────────────────────────────────────────
export const BottomSheet: React.FC<BottomSheetProps> = ({
  year, lang, events, figures, artifacts,
  onEventClick, onFigureClick, onArtifactClick,
  onFetchAIEvents, onFetchAIFigures, onFetchAIArtifacts,
  isLoadingAI, isLoadingAIFigures, isLoadingAIArtifacts,
  setShowSettings,
  onOpenQuiz,
  onJumpToYear,
  selectedVazir,
  onVazirClose,
  onVazirClick,
  onBannerClick,
  onSnapChange
}) => {
  const [snap, setSnap] = useState<SnapPoint>('collapsed');
  const [activeTab, setActiveTab] = useState<'events' | 'figures' | 'artifacts'>('events');
  const { apiKey } = useApiKey();
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const historianResult = useMemo(() => getHistorianCard(year), [year]);

  // Drag tracking
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0); 
  const dragOffsetRef = useRef(0);
  const dragStartY = useRef(0);
  const lastTime = useRef(0);
  const lastY = useRef(0);
  const velocity = useRef(0);
  // Whether the current drag started on the content area (not the handle)
  const dragOnContent = useRef(false);
  // Touch-based drag for half-state content area
  const touchDragActive = useRef(false);
  const touchDragStartY = useRef(0);
  const lastScrollTopRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);

  // Keep snap in a ref so non-passive event listeners have current value
  const snapRef = useRef<SnapPoint>(snap);
  useEffect(() => { snapRef.current = snap; }, [snap]);

  // Notify parent of snap changes so it can manage z-index layering
  useEffect(() => { onSnapChange?.(snap); }, [snap, onSnapChange]);

  // Sync isDraggingRef
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);

  // Cache safe area and layout dimensions to prevent Chrome 'Forced Reflow' layout thrashing
  // Calling getComputedStyle or window.innerHeight during React's render loop destroys 60fps.
  const layoutCache = useRef({
    windowHeight: typeof window !== 'undefined' ? window.innerHeight : 600,
    safeTop: 0,
    safeBottom: 0
  });
  
  const snapHeightsCache = useRef({
    collapsed: 60,
    half: typeof window !== 'undefined' ? window.innerHeight * 0.5 : 300,
    full: typeof window !== 'undefined' ? window.innerHeight - 48 : 552
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateCache = () => {
      const style = getComputedStyle(document.documentElement);
      const safeTop = parseInt(style.getPropertyValue('--safe-top') || '0');
      const safeBottom = parseInt(style.getPropertyValue('--safe-bottom') || '0');
      const windowHeight = window.innerHeight;
      
      const bottomOffset = 104 + Math.max(safeBottom, 16); // Syncing with App.tsx min-16 padding
      layoutCache.current = { windowHeight, safeTop, safeBottom };
      snapHeightsCache.current = {
        collapsed: 60 + safeBottom,
        half: (windowHeight - bottomOffset - safeTop) * 0.5,
        full: windowHeight - safeTop - 72 - bottomOffset // Stop well below TopBar
      };
    };
    updateCache();
    window.addEventListener('resize', updateCache);
    return () => window.removeEventListener('resize', updateCache);
  }, []);

  // Full sheet height — always rendered at this size
  const getFullHeight = useCallback((): number => {
    return snapHeightsCache.current.full;
  }, []);

  // Get pixel height for each snap detent
  const getDetentPixels = useCallback((point: SnapPoint): number => {
    return snapHeightsCache.current[point];
  }, []);

  // translateY offset: how far DOWN from full to show the current snap
  const getTranslateY = useCallback((point: SnapPoint, extraDrag = 0): number => {
    const full = snapHeightsCache.current.full;
    const snapPx = snapHeightsCache.current[point];
    const offset = full - snapPx - extraDrag; // positive = translated down
    return Math.max(0, offset);
  }, []);

  // Update CSS var for the Chatbot FAB offset
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 640) {
      document.documentElement.style.setProperty(CSS_VAR, '0px');
      return;
    }
    // Skip work during drag to prevent forced reflows for external components (e.g. FAB)
    if (isDragging) return;

    const raf = requestAnimationFrame(() => {
      const snapPx = snapHeightsCache.current[snap] + dragOffset;
      document.documentElement.style.setProperty(CSS_VAR, `${Math.max(60, snapPx)}px`);
    });
    return () => cancelAnimationFrame(raf);
  }, [snap, isDragging, dragOffset]);

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
        const scrollTop = lastScrollTopRef.current;
        if (scrollTop <= 1 && deltaY > 0) {
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
    // Only allow drag on content if it's not a button or link
    if (onContent) {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('a') || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
    }

    dragOnContent.current = onContent;
    dragOffsetRef.current = 0;
    dragStartY.current = e.clientY;
    lastY.current = e.clientY;
    lastTime.current = Date.now();
    velocity.current = 0;
    if (!onContent) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const deltaY = dragStartY.current - e.clientY;

    // Movement threshold to distinguish drag from tap
    if (!isDraggingRef.current && Math.abs(deltaY) > 5) {
      startTransition(() => { setIsDragging(true); });
      try { navigator.vibrate(6); } catch(err) {}
    }

    if (!isDraggingRef.current) return;
    
    // In full snap + dragging on content: only allow downward drag when scrolled to top
    if (dragOnContent.current && snapRef.current === 'full') {
      const scrollTop = lastScrollTopRef.current;
      if (scrollTop > 1 || deltaY > 0) return;
    }

    // DIRECT DOM UPDATE: Bypass React state/render for 60fps dragging
    dragOffsetRef.current = deltaY;
    if (sheetRef.current) {
        const full = snapHeightsCache.current.full;
        const snapPx = snapHeightsCache.current[snapRef.current];
        const collapsed = snapHeightsCache.current.collapsed;
        // Max offset = full - collapsed: handle floor is exactly at the Timeline top edge
        const maxOffset = full - collapsed;
        const offset = Math.min(maxOffset, Math.max(0, full - snapPx - deltaY));
        sheetRef.current.style.transform = `translateY(${offset}px)`;
    }

    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) velocity.current = (lastY.current - e.clientY) / dt;
    lastY.current = e.clientY;
    lastTime.current = now;
  }, []); // isDraggingRef and snapRef are used for stability

  const onPointerUp = useCallback((e?: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    
    const currentDragOffset = dragOffsetRef.current;

    // If drag started on content and total movement was tiny, treat as a tap
    const totalDrag = Math.abs(dragStartY.current - (e?.clientY ?? dragStartY.current));
    if (dragOnContent.current && totalDrag < 8) {
      startTransition(() => {
        setIsDragging(false);
        setDragOffset(0);
      });
      dragOffsetRef.current = 0;
      return;
    }

    const currentHeight = getDetentPixels(snapRef.current) + currentDragOffset;
    const detents: SnapPoint[] = ['collapsed', 'half', 'full'];
    const detentHeights = detents.map(d => getDetentPixels(d));

    let finalSnap = snapRef.current;

    // Fast flick logic
    if (Math.abs(velocity.current) > 0.5) {
        if (velocity.current > 0) {
            finalSnap = snapRef.current === 'collapsed' ? 'half' : 'full';
        } else {
            finalSnap = snapRef.current === 'full' ? 'half' : 'collapsed';
        }
    } else {
        let minDiff = Infinity;
        detentHeights.forEach((h, i) => {
            const diff = Math.abs(h - currentHeight);
            if (diff < minDiff) {
                minDiff = diff;
                finalSnap = detents[i];
            }
        });
    }

    if (finalSnap !== snapRef.current) {
        try { navigator.vibrate(6); } catch(e) {}
    }
    
    startTransition(() => {
        setIsDragging(false);
        setSnap(finalSnap);
        setDragOffset(0);
    });
    dragOffsetRef.current = 0;
  }, [getDetentPixels]);

  // Track scroll position for the separator line
  const onScrollContent = useCallback(() => {
    if (!scrollRef.current) return;
    const top = scrollRef.current.scrollTop;
    lastScrollTopRef.current = top;

    // Throttle React state update with requestAnimationFrame
    if (scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(() => {
        startTransition(() => {
          setIsScrolled(top > 2);
        });
        scrollRafRef.current = null;
      });
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
    if (snapRef.current !== 'half' || !touchDragActive.current) return;
    const touchY = e.touches[0].clientY;
    const delta = touchDragStartY.current - touchY;

    // DIRECT DOM UPDATE
    if (delta < 0) {
      dragOffsetRef.current = delta;
      if (sheetRef.current) {
        const full = snapHeightsCache.current.full;
        const half = snapHeightsCache.current.half;
        const offset = Math.max(0, full - half - delta);
        sheetRef.current.style.transform = `translateY(${offset}px)`;
      }
    }

    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) velocity.current = (lastY.current - touchY) / dt;
    lastY.current = touchY;
    lastTime.current = now;

    // Expand to full if dragged up significantly
    if (delta > 20) {
      touchDragActive.current = false;
      startTransition(() => {
        setSnap('full');
        setDragOffset(0);
      });
      dragOffsetRef.current = 0;
      try { navigator.vibrate(6); } catch(err) {}
    }
  }, []);

  const onContentTouchEnd = useCallback(() => {
    if (!touchDragActive.current) return;
    touchDragActive.current = false;

    // If was dragging down and fast flick, collapse
    if (velocity.current < -0.5) {
      startTransition(() => {
        setSnap('collapsed');
        setDragOffset(0);
      });
      dragOffsetRef.current = 0;
      try { navigator.vibrate(6); } catch(err) {}
    } else {
        // Handle snap-back to half if not flicked
        startTransition(() => {
            setIsDragging(false);
            setDragOffset(0);
        });
        dragOffsetRef.current = 0;
    }
  }, []);

  // Touch handlers for full-mode scroll: drag down when at top to collapse
  const onFullScrollTouchStart = useCallback((e: React.TouchEvent) => {
    if (snap !== 'full') return;
    if (lastScrollTopRef.current > 1) return; // only intercept at top
    touchDragActive.current = true;
    touchDragStartY.current = e.touches[0].clientY;
    dragStartY.current = e.touches[0].clientY;
    lastY.current = e.touches[0].clientY;
    lastTime.current = Date.now();
    velocity.current = 0;
  }, [snap]);

  const onFullScrollTouchMove = useCallback((e: React.TouchEvent) => {
    if (snapRef.current !== 'full' || !touchDragActive.current) return;
    if (lastScrollTopRef.current > 1) {
      touchDragActive.current = false;
      startTransition(() => {
        setIsDragging(false);
        setDragOffset(0);
      });
      dragOffsetRef.current = 0;
      return;
    }
    const touchY = e.touches[0].clientY;
    const delta = touchDragStartY.current - touchY;

    // DIRECT DOM UPDATE
    if (delta < 0) {
        dragOffsetRef.current = delta;
        if (sheetRef.current) {
            const offset = Math.max(0, 0 - delta); // Full mode has 0 translate Down
            sheetRef.current.style.transform = `translateY(${offset}px)`;
        }
    }

    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) velocity.current = (lastY.current - touchY) / dt;
    lastY.current = touchY;
    lastTime.current = now;
  }, []);

  const onFullScrollTouchEnd = useCallback(() => {
    if (!touchDragActive.current) return;
    touchDragActive.current = false;

    const currentDragOffset = dragOffsetRef.current;

    if (velocity.current < -0.5 || currentDragOffset < -60) {
      startTransition(() => {
        setSnap('half');
        setIsDragging(false);
        setDragOffset(0);
      });
      dragOffsetRef.current = 0;
      try { navigator.vibrate(6); } catch(err) {}
    } else {
        startTransition(() => {
            setIsDragging(false);
            setDragOffset(0);
        });
        dragOffsetRef.current = 0;
    }
  }, []);

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

  // Ensure Timeline slides in sync with BottomSheet using CSS variables
  const collapsedTranslateY = getTranslateY('collapsed', 0);
  const extraHeight = Math.max(0, collapsedTranslateY - translateY);
  const transitionStr = isDragging ? 'none' : 'transform 0.38s cubic-bezier(0.16, 1, 0.3, 1)';

  // Ensure Timeline slides in sync with BottomSheet using CSS variables
  // (DEPRECATED: Timeline is now fixed at bottom)


  return (
    <div
      ref={sheetRef}
      id="tour-events-panel-mobile"
      style={{
        height: fullHeight,
        transform: `translateY(${translateY}px)`,
        transition: transitionStr,
        flexShrink: 0,
        willChange: isDragging ? 'transform' : 'auto',
        userSelect: isDragging ? 'none' : 'auto',
        pointerEvents: snap === 'collapsed' ? 'none' : 'auto',
      }}
      className="w-full relative mobile-sheet-glass border-t border-white/10 overflow-hidden"
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
      onPointerDown={(e) => onPointerDown(e, true)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* ── Drag Handle ─────────────────────────────────────────────────── */}
      {/* Always draggable handle strip */}
      <div
        className="drag-handle flex flex-col items-center justify-start pt-3 pb-5 w-full select-none bg-slate-950/30"
        style={{
          height: 60,
          flexShrink: 0,
          touchAction: 'none',
          cursor: snap === 'full' ? 'default' : 'grab',
          pointerEvents: 'auto',
        }}
        onPointerDown={(e) => onPointerDown(e, false)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Pill indicator */}
        <div className="w-10 h-1.5 rounded-full bg-white/30 mb-2" />
          <div className="flex w-full px-5 justify-between items-center">
            <span className="text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
              {Math.abs(year)}{year < 0 ? ' BC' : ' AD'}
            </span>
            <span className={`${lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel tracking-widest'} font-bold text-amber-400 text-sm leading-none grow text-center`}>
               {historianResult.card.eraName[lang]}
            </span>
            <ChevronUp
              className="w-4 h-4 text-slate-500 transition-transform"
              style={{ transform: snap === 'full' ? 'rotate(180deg)' : snap === 'half' ? 'rotate(90deg)' : 'rotate(0deg)' }}
            />
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

          {/* ── FULL: Compact sticky bar — era name + tabs only ───────────── */}
          {snap === 'full' && (
            <div className="shrink-0 border-b border-white/10 bg-slate-950/80 backdrop-blur-sm z-20">
              {/* Era name micro-strip */}
              <div className="flex items-center gap-2 px-4 py-2">
                <span className={`${lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel tracking-widest'} text-amber-400 text-[11px] font-bold truncate flex-1`}>
                  {historianResult.card.eraName[lang]}
                </span>
                <span className="text-[9px] font-mono text-slate-600 shrink-0">
                  {Math.abs(historianResult.card.yearRange.start)}{historianResult.card.yearRange.start < 0 ? ' BC' : ' AD'}
                  {' – '}
                  {Math.abs(historianResult.card.yearRange.end)}{historianResult.card.yearRange.end < 0 ? ' BC' : ' AD'}
                </span>
              </div>
              {/* Tab switcher */}
              <div className="px-3 pb-2">
                <div className="flex bg-black/20 rounded-xl p-1 border border-white/5">
                  {(['events', 'figures', 'artifacts'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => startTransition(() => { setActiveTab(tab); })}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === tab ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {lang === 'en'
                        ? tab === 'events' ? 'Events' : tab === 'figures' ? 'Figures' : 'Heritage'
                        : tab === 'events' ? 'رویدادها' : tab === 'figures' ? 'شخصیت‌ها' : 'میراث'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

            <div
              className="flex-1 min-h-0 overflow-hidden"
              onTouchStart={snap === 'full' ? onFullScrollTouchStart : undefined}
              onTouchMove={snap === 'full' ? onFullScrollTouchMove : undefined}
              onTouchEnd={snap === 'full' ? onFullScrollTouchEnd : undefined}
              onTouchCancel={snap === 'full' ? onFullScrollTouchEnd : undefined}
            >
              {activeTab === 'events' && (
                <Virtuoso
                  style={{ height: '100%', width: '100%' }}
                  className="custom-scrollbar"
                  scrollerRef={(r) => { if (r) scrollRef.current = r as HTMLDivElement; }}
                  onScroll={onScrollContent}
                  data={activeEvents}
                  components={{
                    Header: () => (
                      <div className="flex flex-col">
                        {/* 1. Context Card — only in half snap, part of the scroll */}
                        {snap !== 'full' && (
                          <div className="border-b border-white/10">
                            <HistorianCardSection
                              result={historianResult}
                              lang={lang}
                              onNavigate={onJumpToYear ?? (() => {})}
                              isEnriching={isLoadingAI}
                              selectedVazir={selectedVazir}
                              onVazirClose={onVazirClose}
                              onVazirSelect={onVazirClick}
                              onBannerClick={onBannerClick}
                            />
                          </div>
                        )}

                        {/* 2. Sticky Tab Switcher for HALF state */}
                        {snap !== 'full' && (
                          <div className="sticky top-0 px-4 pb-3 pt-3 border-b border-white/5 bg-slate-950/80 backdrop-blur-md z-10 shrink-0">
                            <div className="flex bg-black/20 rounded-xl p-1 border border-white/5 shadow-inner">
                              {(['events', 'figures', 'artifacts'] as const).map(tab => (
                                <button
                                  key={tab}
                                  onClick={() => startTransition(() => { setActiveTab(tab); })}
                                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${activeTab === tab ? 'bg-white/10 text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-200'}`}
                                >
                                  {lang === 'en'
                                    ? tab === 'events' ? 'Events' : tab === 'figures' ? 'Figures' : 'Heritage'
                                    : tab === 'events' ? 'رویدادها' : tab === 'figures' ? 'شخصیت‌ها' : 'میراث'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 3. Empty State Message */}
                        <div className="px-4 py-3 flex flex-col gap-2">
                          {activeEvents.length === 0 && !mythsForEra.length && (
                            <div className="text-center py-8 text-slate-500 text-sm italic">
                              {lang === 'en' ? 'No major events in this era.' : 'رویداد مهمی در این دوره ثبت نشده است.'}
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                    Footer: () => (
                      <div className="px-4 pt-4 pb-6 flex flex-col gap-3">
                        <MythCard 
                          question={mythsForEra.length > 0 ? mythsForEra[0] : undefined} 
                          lang={lang} 
                          year={year}
                          hasApiKey={!!apiKey}
                          onOpenQuiz={() => onOpenQuiz(mythsForEra)}
                          onOpenSettings={() => setShowSettings && setShowSettings(true)}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); onFetchAIEvents(year); }}
                          disabled={isLoading || !apiKey}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 liquid-glass text-indigo-300 border border-white/10 rounded-2xl hover:bg-white/10 active:scale-[0.98] calm-transition disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold"
                        >
                          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          {lang === 'en' ? 'Discover More Events with AI' : 'کشف رویدادهای بیشتر'}
                        </button>
                      </div>
                    )
                  }}
                  itemContent={(index, event) => (
                    <div className="px-4 pb-2">
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
                    </div>
                  )}
                />
              )}

              {activeTab === 'figures' && (
                <Virtuoso
                  style={{ height: '100%', width: '100%' }}
                  className="custom-scrollbar"
                  scrollerRef={(r) => { if (r) scrollRef.current = r as HTMLDivElement; }}
                  onScroll={onScrollContent}
                  data={activeFigures}
                  components={{
                    Header: () => (
                      <div className="flex flex-col">
                        {/* 1. Context Card — only in half snap, part of the scroll */}
                        {snap !== 'full' && (
                          <div className="border-b border-white/10">
                            <HistorianCardSection
                              result={historianResult}
                              lang={lang}
                              onNavigate={onJumpToYear ?? (() => {})}
                              isEnriching={isLoadingAI}
                              selectedVazir={selectedVazir}
                              onVazirClose={onVazirClose}
                              onVazirSelect={onVazirClick}
                            />
                          </div>
                        )}

                        {/* 2. Sticky Tab Switcher for HALF state */}
                        {snap !== 'full' && (
                          <div className="sticky top-0 px-4 pb-3 pt-3 border-b border-white/5 bg-slate-950/80 backdrop-blur-md z-10 shrink-0">
                            <div className="flex bg-black/20 rounded-xl p-1 border border-white/5 shadow-inner">
                              {(['events', 'figures', 'artifacts'] as const).map(tab => (
                                <button
                                  key={tab}
                                  onClick={() => startTransition(() => { setActiveTab(tab); })}
                                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${activeTab === tab ? 'bg-white/10 text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-200'}`}
                                >
                                  {lang === 'en'
                                    ? tab === 'events' ? 'Events' : tab === 'figures' ? 'Figures' : 'Heritage'
                                    : tab === 'events' ? 'رویدادها' : tab === 'figures' ? 'شخصیت‌ها' : 'میراث'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 3. Empty State Message */}
                        {activeFigures.length === 0 && (
                          <div className="px-4 pt-3">
                            <div className="text-center py-8 text-slate-500 text-sm italic">
                              {lang === 'en' ? 'No major figures in this era.' : 'شخصیت مهمی در این دوره ثبت نشده است.'}
                            </div>
                          </div>
                        )}
                      </div>
                    ),
                    Footer: () => (
                      <div className="px-4 pt-4 pb-6">
                        <button
                          onClick={(e) => { e.stopPropagation(); onFetchAIFigures(year); }}
                          disabled={isLoadingAIFigures || !apiKey}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 liquid-glass text-indigo-300 border border-white/10 rounded-2xl hover:bg-white/10 active:scale-[0.98] calm-transition disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold"
                        >
                          {isLoadingAIFigures ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          {lang === 'en' ? 'Find More Figures with AI' : 'یافتن شخصیت‌های بیشتر'}
                        </button>
                      </div>
                    )
                  }}
                  itemContent={(index, figure) => (
                    <div className="px-4 pb-2">
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
                    </div>
                  )}
                />
              )}

              {activeTab === 'artifacts' && (
                <Virtuoso
                  style={{ height: '100%', width: '100%' }}
                  className="custom-scrollbar"
                  scrollerRef={(r) => { if (r) scrollRef.current = r as HTMLDivElement; }}
                  onScroll={onScrollContent}
                  data={activeArtifacts}
                  components={{
                    Header: () => (
                      <div className="flex flex-col">
                        {/* 1. Context Card — only in half snap, part of the scroll */}
                        {snap !== 'full' && (
                          <div className="border-b border-white/10">
                            <HistorianCardSection
                              result={historianResult}
                              lang={lang}
                              onNavigate={onJumpToYear ?? (() => {})}
                              isEnriching={isLoadingAI}
                              selectedVazir={selectedVazir}
                              onVazirClose={onVazirClose}
                              onVazirSelect={onVazirClick}
                            />
                          </div>
                        )}

                        {/* 2. Sticky Tab Switcher for HALF state */}
                        {snap !== 'full' && (
                          <div className="sticky top-0 px-4 pb-3 pt-3 border-b border-white/5 bg-slate-950/80 backdrop-blur-md z-10 shrink-0">
                            <div className="flex bg-black/20 rounded-xl p-1 border border-white/5 shadow-inner">
                              {(['events', 'figures', 'artifacts'] as const).map(tab => (
                                <button
                                  key={tab}
                                  onClick={() => startTransition(() => { setActiveTab(tab); })}
                                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${activeTab === tab ? 'bg-white/10 text-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-200'}`}
                                >
                                  {lang === 'en'
                                    ? tab === 'events' ? 'Events' : tab === 'figures' ? 'Figures' : 'Heritage'
                                    : tab === 'events' ? 'رویدادها' : tab === 'figures' ? 'شخصیت‌ها' : 'میراث'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 3. Empty State Message */}
                        {activeArtifacts.length === 0 && (
                          <div className="px-4 pt-3">
                            <div className="text-center py-8 text-slate-500 text-sm italic">
                              {lang === 'en' ? 'No major heritage in this era.' : 'میراث مهمی در این دوره ثبت نشده است.'}
                            </div>
                          </div>
                        )}
                      </div>
                    ),
                    Footer: () => (
                      <div className="px-4 pt-4 pb-6">
                        <button
                          onClick={(e) => { e.stopPropagation(); onFetchAIArtifacts(year); }}
                          disabled={isLoadingAIArtifacts || !apiKey}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 liquid-glass text-indigo-300 border border-white/10 rounded-2xl hover:bg-white/10 active:scale-[0.98] calm-transition disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold"
                        >
                          {isLoadingAIArtifacts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          {lang === 'en' ? 'Find More Heritage with AI' : 'مشاهده میراث بیشتر'}
                        </button>
                      </div>
                    )
                  }}
                  itemContent={(index, artifact) => (
                    <div className="px-4 pb-2">
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
                    </div>
                  )}
                />
              )}
            </div>

            {/* 
               TODO: RE-ENABLE BYOK EDITORIAL INSIGHT 
               This section needs more time to make the narrative flow complete. 
               We will reintegrate this 'Historian Insight' whisper later.
            */}
            {/* {!apiKey && (
              <div
                className="px-4 border-t border-[rgba(201,169,110,0.1)] shrink-0 pb-1"
                style={{ paddingBottom: 'calc(4px + var(--safe-bottom))' }}
              >
                <ByokGate
                  year={year}
                  lang={lang}
                  onUnlock={() => setShowSettings?.(true)}
                />
              </div>
            )} */}
            
            {/* Safe area padding when BYOK is hidden */}
            <div style={{ height: 'var(--safe-bottom)', minHeight: '12px' }} className="shrink-0" />
      </div>
    </div>
  );
};
