import React, { useState, useMemo, Suspense, lazy, useEffect, startTransition } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, Languages, HelpCircle, Key, AlertCircle, Heart, Search, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { formatYear } from './utils/format';
import { events as initialEvents, ReignEvent } from './data/events';
import { rulers as initialRulers, Ruler } from './data/rulers';
import { dynasties as initialDynasties, Dynasty, Classification } from './data/dynasties';
import { historicalEvents as initialHistoricalEvents, HistoricalEvent } from './data/historicalEvents';
import { historicalFigures, HistoricalFigure } from './data/figures';
import { artifacts as initialArtifacts, Artifact } from './data/artifacts';
import { DynamicRulerData, fetchHistoricalDataForYear, fetchHistoricalEventsForYear, fetchHistoricalFiguresForYear, fetchArtifactsForYear, SearchResult } from './services/geminiService';
import { useApiKey } from './context/ApiKeyContext';
import { generateQuizQuestion } from './services/geminiService';
import { getQuestionsForYear } from './data/quizQuestions';
import { QuizQuestion } from './types/quiz';
import { AIKeyButton } from './components/AIKeyButton';
import { SearchBar } from './components/SearchBar';
import { ContextStrip } from './components/ContextStrip';
import { ByokGate } from './components/ByokGate';
import { Vazir } from './data/vazirs';

// Heavy components — lazy loaded so they never block first paint
const Map        = lazy(() => import('./components/Map').then(m => ({ default: m.Map })));
const Timeline   = lazy(() => import('./components/Timeline').then(m => ({ default: m.Timeline })));
const EventsPanel = lazy(() => import('./components/EventsPanel').then(m => ({ default: m.EventsPanel })));
const BottomSheet = lazy(() => import('./components/BottomSheet').then(m => ({ default: m.BottomSheet })));
const TourGuide   = lazy(() => import('./components/TourGuide').then(m => ({ default: m.TourGuide })));
const DetailModal = lazy(() => import('./components/DetailModal').then(m => ({ default: m.DetailModal })));
const Chatbot     = lazy(() => import('./components/Chatbot').then(m => ({ default: m.Chatbot })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const SupportModal  = lazy(() => import('./components/SupportModal').then(m => ({ default: m.SupportModal })));
const SearchModal   = lazy(() => import('./components/SearchModal').then(m => ({ default: m.SearchModal })));
const QuizModal     = lazy(() => import('./components/QuizModal').then(m => ({ default: m.QuizModal })));

export default function App() {
  const [year, setYear] = useState<number>(-500);
  const [lang, setLang] = useState<'en' | 'fa'>('en');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedHistoricalEvent, setSelectedHistoricalEvent] = useState<HistoricalEvent | null>(null);
  const [selectedFigure, setSelectedFigure] = useState<HistoricalFigure | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [selectedSearchResult, setSelectedSearchResult] = useState<SearchResult | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isLoadingAIEvents, setIsLoadingAIEvents] = useState(false);
  const [isLoadingAIFigures, setIsLoadingAIFigures] = useState(false);
  const [isLoadingAIArtifacts, setIsLoadingAIArtifacts] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeQuizQuestions, setActiveQuizQuestions] = useState<QuizQuestion[] | null>(null);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [selectedVazir, setSelectedVazir] = useState<Vazir | null>(null);
  const [legendMode, setLegendMode] = useState<'simple' | 'detailed'>('simple');

  // Keyboard shortcut for search (Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Restart quiz if year changes
  useEffect(() => {
    setActiveQuizQuestions(null);
    setIsQuizModalOpen(false);
  }, [year]);

  // Parse Initial Route
  React.useEffect(() => {
    const handleHashChange = () => {
      setShowSupport(window.location.hash === '#support');
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const closeSupport = () => {
    window.location.hash = '';
  };
  const { apiKey, isReady } = useApiKey();

  React.useEffect(() => {
    import('./services/geminiService').then(m => m.setApiKey(apiKey)).catch(console.error);
  }, [apiKey]);

  // Check if it's the first visit
  React.useEffect(() => {
    const hasVisited = localStorage.getItem('hasVisitedPolySovereignty');
    if (!hasVisited) {
      setRunTour(true);
      localStorage.setItem('hasVisitedPolySovereignty', 'true');
    }
  }, []);

  // Dynamic data state
  const [dynamicData, setDynamicData] = useState<{
    events: ReignEvent[];
    rulers: Record<string, Ruler>;
    dynasties: Record<string, Dynasty>;
    historicalEvents: HistoricalEvent[];
    figures: HistoricalFigure[];
    artifacts: Artifact[];
  }>({
    events: [],
    rulers: {},
    dynasties: {},
    historicalEvents: [],
    figures: [],
    artifacts: []
  });

  const handleAddDynamicData = (newData: DynamicRulerData[]) => {
    setDynamicData(prev => {
      const currentEvents = [...initialEvents, ...prev.events];
      const newEvents: ReignEvent[] = [];
      const newRulers: Record<string, Ruler> = {};
      const newDynasties: Record<string, Dynasty> = {};

      newData.forEach(item => {
        // Prevent conflict with existing data in the same region and overlapping timeframe
        const isOverlapping = currentEvents.some(
          e => e.regionId === item.regionId && Math.max(item.startDate, e.startDate) <= Math.min(item.endDate, e.endDate)
        );

        if (isOverlapping) {
          return;
        }

        const dynastyId = `dyn_${item.dynastyNameEn.toLowerCase().replace(/\s+/g, '_')}`;
        const rulerId = `rul_${item.rulerNameEn.toLowerCase().replace(/\s+/g, '_')}`;
        const eventId = item.id;

        if (!newDynasties[dynastyId] && !initialDynasties[dynastyId]) {
          newDynasties[dynastyId] = {
            id: dynastyId,
            name: { en: item.dynastyNameEn, fa: item.dynastyNameFa },
            colorFamily: item.dynastyColorFamily,
            classification: item.dynastyClassification as Classification,
            capitalCity: { en: item.capitalCityEn, fa: item.capitalCityFa }
          };
        }

        if (!newRulers[rulerId] && !initialRulers[rulerId]) {
          newRulers[rulerId] = {
            id: rulerId,
            name: { en: item.rulerNameEn, fa: item.rulerNameFa },
            title: { en: item.rulerTitleEn, fa: item.rulerTitleFa },
            dynastyId: dynastyId,
            rulerType: 'Central Monarch',
            startDate: item.startDate,
            endDate: item.endDate
          };
        }

        newEvents.push({
          id: eventId,
          rulerId: rulerId,
          regionId: item.regionId,
          startDate: item.startDate,
          endDate: item.endDate,
          status: item.status
        });
      });

      return {
        ...prev,
        events: [...prev.events, ...newEvents],
        rulers: { ...prev.rulers, ...newRulers },
        dynasties: { ...prev.dynasties, ...newDynasties }
      };
    });
  };

  const handleAddDynamicHistoricalEvents = (newEvents: HistoricalEvent[]) => {
    setDynamicData(prev => ({ ...prev, historicalEvents: [...prev.historicalEvents, ...newEvents] }));
  };
  const handleAddDynamicFigures = (newFigures: HistoricalFigure[]) => {
    setDynamicData(prev => ({ ...prev, figures: [...prev.figures, ...newFigures] }));
  };
  const handleAddDynamicArtifacts = (newArtifacts: Artifact[]) => {
    setDynamicData(prev => ({ ...prev, artifacts: [...prev.artifacts, ...newArtifacts] }));
  };

  const allEvents           = useMemo(() => [...initialEvents,          ...dynamicData.events],          [dynamicData.events]);
  const allRulers           = useMemo(() => ({ ...initialRulers,        ...dynamicData.rulers }),         [dynamicData.rulers]);
  const allDynasties        = useMemo(() => ({ ...initialDynasties,     ...dynamicData.dynasties }),      [dynamicData.dynasties]);
  const allHistoricalEvents = useMemo(() => [...initialHistoricalEvents, ...dynamicData.historicalEvents],[dynamicData.historicalEvents]);
  const allFigures          = useMemo(() => [...historicalFigures,       ...dynamicData.figures],         [dynamicData.figures]);
  const allArtifacts        = useMemo(() => [...initialArtifacts,        ...dynamicData.artifacts],       [dynamicData.artifacts]);

  const clearSelection = () => {
    startTransition(() => {
      setSelectedEventId(null);
      setSelectedRegionId(null);
      setSelectedHistoricalEvent(null);
      setSelectedFigure(null);
      setSelectedArtifact(null);
      setSelectedSearchResult(null);
    });
  };

  const handleRegionClick          = (regionId: string)        => { startTransition(() => { clearSelection(); setSelectedRegionId(regionId); }); };
  const handleEventClick           = (eventId: string)         => { startTransition(() => { clearSelection(); setSelectedEventId(eventId); }); };
  const handleHistoricalEventClick = (event: HistoricalEvent) => { startTransition(() => { clearSelection(); setSelectedHistoricalEvent(event); }); };
  const handleFigureClick          = (figure: HistoricalFigure)=> { startTransition(() => { clearSelection(); setSelectedFigure(figure); }); };
  const handleArtifactClick        = (artifact: Artifact)      => { startTransition(() => { clearSelection(); setSelectedArtifact(artifact); }); };
  const handleSearchResult         = (result: SearchResult)    => { startTransition(() => { clearSelection(); setYear(result.year); setSelectedSearchResult(result); }); };

  const handleYearContextClick = async (y: number) => {
    setIsLoadingAI(true);
    try {
      const data = await fetchHistoricalDataForYear(y, lang);
      if (data?.length) handleAddDynamicData(data);
    } catch (err) { console.error(err); }
    finally { setIsLoadingAI(false); }
  };

  const handleFetchAIEvents = async (y: number) => {
    setIsLoadingAIEvents(true);
    try {
      const data = await fetchHistoricalEventsForYear(y, lang);
      if (data?.length) handleAddDynamicHistoricalEvents(data);
    } catch (err) { console.error(err); }
    finally { setIsLoadingAIEvents(false); }
  };

  const handleFetchAIFigures = async (y: number) => {
    setIsLoadingAIFigures(true);
    try {
      const data = await fetchHistoricalFiguresForYear(y, lang);
      if (data?.length) handleAddDynamicFigures(data);
    } catch (err) { console.error(err); }
    finally { setIsLoadingAIFigures(false); }
  };

  const handleFetchAIArtifacts = async (y: number) => {
    setIsLoadingAIArtifacts(true);
    try {
      const data = await fetchArtifactsForYear(y, lang);
      if (data?.length) handleAddDynamicArtifacts(data);
    } catch (err) { console.error(err); }
    finally { setIsLoadingAIArtifacts(false); }
  };

  const closeModal = clearSelection;

  // ─── Shared EventsPanel props (reused for both desktop sidebar and mobile sheet) ───
  const panelProps = {
    year,
    lang,
    events: allHistoricalEvents,
    figures: allFigures,
    artifacts: allArtifacts,
    onEventClick: handleHistoricalEventClick,
    onFigureClick: handleFigureClick,
    onArtifactClick: handleArtifactClick,
    onFetchAIEvents: handleFetchAIEvents,
    onFetchAIFigures: handleFetchAIFigures,
    onFetchAIArtifacts: handleFetchAIArtifacts,
    isLoadingAI: isLoadingAIEvents,
    isLoadingAIFigures,
    isLoadingAIArtifacts,
    setShowSettings,
    onOpenQuiz: (questions: QuizQuestion[]) => {
      setActiveQuizQuestions(questions);
      setIsQuizModalOpen(true);
    },
    onJumpToYear: (y: number) => { setYear(y); },
    selectedVazir,
    onVazirClose: () => setSelectedVazir(null),
  };

  return (
    <div
      className={`w-screen h-[100dvh] bg-[#020617] text-slate-200 overflow-hidden selection:bg-indigo-500/30 ${lang === 'fa' ? 'font-vazirmatn' : 'font-sans'}`}
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
    >
      <Suspense fallback={null}>
        <TourGuide lang={lang} run={runTour} onFinish={() => setRunTour(false)} />
      </Suspense>

      {/* ════════════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (flex column, no absolute children compete)
          max-width: 640px (sm breakpoint)
          ================================================================ */}
      <div className="sm:hidden relative flex flex-col w-full h-full overflow-hidden" id="app-mobile-container">

        {/* ── Top Bar  z-40, height 48px + safe area ─────────────────── */}
        <header
          id="topBar"
          style={{ 
            height: 48, 
            flexShrink: 0, 
            zIndex: 40, 
            paddingTop: 'var(--safe-top)',
            boxSizing: 'content-box' 
          }}
          className="flex items-center justify-between px-3 liquid-glass border-b border-white/10 gap-2"
        >
          {/* Left: Globe + year */}
          <div className="flex items-center gap-2 shrink-0">
            <Globe className="w-4 h-4 text-indigo-400" />
            <span className="font-mono text-sm font-bold text-white">
              {formatYear(year, lang)}
            </span>
          </div>

          {/* Right: icon buttons */}
          <div className="flex items-center gap-1">
            <button
              id="tour-search-mobile"
              onClick={() => setShowSearch(true)}
              className="p-2 rounded-xl liquid-glass hover:bg-white/10 calm-transition"
              title={lang === 'en' ? 'Search' : 'جستجو'}
            >
              <Search className="w-4 h-4 text-indigo-400" />
            </button>
            <button
              onClick={() => window.location.hash = 'support'}
              className="p-2 rounded-xl liquid-glass hover:bg-white/10 calm-transition"
              title={lang === 'en' ? 'Support' : 'حمایت'}
            >
              <Heart className="w-4 h-4 text-rose-400" />
            </button>
            <AIKeyButton onClick={() => setShowSettings(true)} className="!p-1.5" />
            <button
              id="tour-lang-mobile"
              onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
              className="p-2 rounded-xl liquid-glass hover:bg-white/10 calm-transition text-xs font-bold text-white min-w-[36px]"
            >
              {lang === 'en' ? 'FA' : 'EN'}
            </button>
          </div>
        </header>

        <motion.div
           key={`mobile-strip-${lang}`}
           initial={{ opacity: 0.8 }}
           animate={{ opacity: 1 }}
           transition={{ duration: 0.2 }}
        >
          <ContextStrip year={year} lang={lang} />
        </motion.div>

        {/* ── Map area  flex-1, shrinks as sheet grows ─────────────────── */}
        <div 
          id="tour-map-mobile" 
          style={{ 
            flex: 1, 
            minHeight: 0, 
            zIndex: 0,
            pointerEvents: runTour ? 'none' : 'auto'
          }} 
          className="relative overflow-hidden"
        >
          <Map
            year={year}
            lang={lang}
            onRegionClick={handleRegionClick}
            onGlobalContextClick={handleYearContextClick}
            events={allEvents}
            rulers={allRulers}
            dynasties={allDynasties}
            historicalEvents={allHistoricalEvents}
            artifacts={allArtifacts}
            onHistoricalEventClick={handleHistoricalEventClick}
            onArtifactClick={handleArtifactClick}
            onVazirClick={(vazir) => setSelectedVazir(vazir)}
          />
        </div>

        {/* ── Scrubber row  44px, z-30, BETWEEN map and spacer ─────────── */}
        <div
          id="tour-timeline-mobile"
          style={{ 
            height: 'auto', 
            flexShrink: 0, 
            zIndex: 30,
            transform: 'translateY(calc(-1px * var(--sheet-extra-height, 0)))',
            transition: 'var(--sheet-transition, none)',
            willChange: 'transform'
          }}
          className="flex items-center liquid-glass-heavy border-t border-white/10"
        >
          <Timeline
            year={year}
            setYear={setYear}
            lang={lang}
            onEventClick={handleEventClick}
            onYearContextClick={handleYearContextClick}
            events={allEvents}
            rulers={allRulers}
            dynasties={allDynasties}
            historicalEvents={allHistoricalEvents}
            artifacts={allArtifacts}
            onHistoricalEventClick={handleHistoricalEventClick}
            onArtifactClick={handleArtifactClick}
            isLoadingAI={isLoadingAI}
          />
        </div>

        {/* ── Spacer: keeps Timeline exactly above the BottomSheet handler ── */}
        <div style={{ height: 'calc(60px + var(--safe-bottom))', flexShrink: 0 }} aria-hidden="true" />

        {/* ── Bottom Sheet: absolute overlay, GPU translateY animates snap positions ── */}
        {/* zIndex 35 puts it above Timeline (30) but below TopBar (40) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 35 }}>
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
            <Suspense fallback={<div style={{ height: 60, width: '100%' }} />}>
              <BottomSheet {...panelProps} setShowSettings={setShowSettings} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (sm+, unchanged from before)
          All children are absolute/overlapping like before
          ================================================================ */}
      <div className="hidden sm:flex flex-col w-full h-full overflow-hidden">

        {/* Floating Header */}
        <header className="p-4 md:p-6 flex items-center justify-between pointer-events-none gap-4"
                style={{ flexShrink: 0 }}>
          <div className="flex items-center gap-3 pointer-events-auto liquid-glass px-5 py-4 rounded-3xl calm-transition">
            <Globe className="w-6 h-6 text-indigo-400 shrink-0" />
            <h1 className="text-lg md:text-xl font-bold font-serif tracking-tight text-white">
              {lang === 'en' ? 'The Living Atlas of Greater Iran' : 'اطلس تاریخ ایران بزرگ'}
            </h1>
          </div>

          <div className="flex items-center gap-4 pointer-events-auto">
            <div id="tour-search-desktop">
              <SearchBar lang={lang} onSearchResult={handleSearchResult} setShowSettings={setShowSettings} />
            </div>
            <button
              onClick={() => window.location.hash = 'support'}
              className="flex items-center gap-2 px-5 py-4 rounded-3xl liquid-glass hover:bg-white/10 calm-transition text-sm font-medium text-white shrink-0"
            >
              <Heart className="w-4 h-4 text-rose-400" />
              {lang === 'en' ? 'Support' : 'حمایت'}
            </button>
            <button
              onClick={() => setRunTour(true)}
              className="flex items-center gap-2 px-5 py-4 rounded-3xl liquid-glass hover:bg-white/10 calm-transition text-sm font-medium text-white shrink-0"
            >
              <HelpCircle className="w-4 h-4" />
              {lang === 'en' ? 'Tour' : 'راهنما'}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-5 py-4 rounded-3xl liquid-glass hover:bg-white/10 calm-transition text-sm font-medium text-white shrink-0"
            >
              <Key className="w-4 h-4" />
              {lang === 'en' ? 'API Key' : 'کلید API'}
            </button>
            <button
              id="tour-lang-desktop"
              onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
              className="flex items-center gap-2 px-5 py-4 rounded-3xl liquid-glass hover:bg-white/10 calm-transition text-sm font-medium text-white shrink-0"
            >
              <Languages className="w-4 h-4 mr-2" />
              {lang === 'en' ? 'فارسی' : 'English'}
            </button>
          </div>
        </header>

        <motion.div
          key={`desktop-strip-${lang}`}
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <ContextStrip year={year} lang={lang} />
        </motion.div>

        {/* ─── 3-Column Middle Row ─────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* LEFT PANEL (Legend — collapsible) */}
          {isLeftPanelOpen && (
            <div
              className="flex flex-col liquid-glass-heavy border-r border-white/10 overflow-y-auto"
              style={{ width: 240, flexShrink: 0 }}
            >
              {/* COLLAPSE BUTTON */}
              <button
                onClick={() => setIsLeftPanelOpen(false)}
                className="self-end m-3 p-1.5 rounded-lg hover:bg-white/10 calm-transition text-slate-400 hover:text-white"
                title="Collapse legend"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
              
              <div className="px-4 py-3 flex flex-col gap-3">
                {/* LEGEND Header */}
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 pb-1">
                  {lang === 'en' ? 'Legend' : 'راهنما'}
                </span>

                <div className="flex flex-col gap-2">
                  {/* Simple/Detailed Toggle Content */}
                  {legendMode === 'simple' ? (
                    <>
                      <LegendItem color="persian" label={{ en: 'Persian/Iranian', fa: 'ایرانی/پارسی' }} lang={lang} />
                      <LegendItem color="arab" label={{ en: 'Caliphate/Foreign', fa: 'خلافت/خارجی' }} lang={lang} />
                      <LegendItem color="nomadic" label={{ en: 'Nomadic/Contested', fa: 'عشایر/مناقشه' }} lang={lang} />
                    </>
                  ) : (
                    <>
                      <LegendItem color="persian" label={{ en: 'Persian/Iranian', fa: 'ایرانی/پارسی' }} lang={lang} />
                      <LegendItem color="arab" label={{ en: 'Arab/Caliphate', fa: 'عرب/خلافت' }} lang={lang} />
                      <LegendItem color="turkic" label={{ en: 'Turkic/Mongol', fa: 'ترک/مغول' }} lang={lang} />
                      <LegendItem color="greek" label={{ en: 'Hellenic/Greek', fa: 'یونانی/هلنیستی' }} lang={lang} />
                      <LegendItem color="nomadic" label={{ en: 'Nomadic/Steppe', fa: 'عشایر/استپ' }} lang={lang} />
                      <LegendItem color="foreign" label={{ en: 'Foreign Imperial', fa: 'امپراتوری خارجی' }} lang={lang} />
                      <LegendItem color="semitic" label={{ en: 'Babylonian/Semitic', fa: 'بابلی/سامی' }} lang={lang} />
                    </>
                  )}
                </div>

                {/* Toggle Button */}
                <button
                  onClick={() => setLegendMode(m => m === 'simple' ? 'detailed' : 'simple')}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 calm-transition text-left underline"
                >
                  {legendMode === 'simple'
                    ? (lang === 'en' ? 'Detailed View ↓' : 'نمای دقیق ↓')
                    : (lang === 'en' ? 'Simplified View ↑' : 'نمای ساده ↑')}
                </button>

                {/* MAP DOTS Key */}
                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 pb-1">
                    {lang === 'en' ? 'Map Dots' : 'نقاط روی نقشه'}
                  </span>
                  <LegendItem color="amber" label={{ en: 'Vazir (Advisor)', fa: 'وزیر' }} lang={lang} />
                  <LegendItem color="purple" label={{ en: 'Historical Figure', fa: 'شخصیت تاریخی' }} lang={lang} />
                  <LegendItem color="emerald" label={{ en: 'Historical Event', fa: 'رویداد تاریخی' }} lang={lang} />
                  <LegendItem color="sky" label={{ en: 'Cultural Heritage', fa: 'میراث فرهنگی' }} lang={lang} />
                </div>
              </div>
            </div>
          )}

          {/* LEFT PANEL EXPAND BUTTON (shown when collapsed) */}
          {!isLeftPanelOpen && (
            <button
              onClick={() => setIsLeftPanelOpen(true)}
              className="flex flex-col items-center justify-center px-2 liquid-glass border-r border-white/10 hover:bg-white/10 calm-transition text-slate-400 hover:text-white"
              style={{ width: 32, flexShrink: 0 }}
              title="Expand legend"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          {/* CENTER: Map (existing, now in flow) */}
          <div
            id="tour-map-desktop"
            className="relative flex-1 min-w-0 overflow-hidden"
            style={{ pointerEvents: runTour ? 'none' : 'auto' }}
          >
            <Map
              year={year}
              lang={lang}
              onRegionClick={handleRegionClick}
              onGlobalContextClick={handleYearContextClick}
              events={allEvents}
              rulers={allRulers}
              dynasties={allDynasties}
              historicalEvents={allHistoricalEvents}
              artifacts={allArtifacts}
              onHistoricalEventClick={handleHistoricalEventClick}
              onArtifactClick={handleArtifactClick}
              onVazirClick={(vazir) => setSelectedVazir(vazir)}
            />
            
            {/* BYOK Banner moved inside the map container, now bottom-center */}
            {isReady && !apiKey && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
                <div className="liquid-glass border border-amber-500/30 rounded-3xl shadow-xl overflow-hidden">
                  <ByokGate
                    year={year}
                    lang={lang}
                    onUnlock={() => setShowSettings(true)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANEL (EventsPanel — collapsible) */}
          {isRightPanelOpen && (
            <div
              className="flex flex-col liquid-glass-heavy border-l border-white/10 overflow-hidden"
              style={{ width: 360, flexShrink: 0 }}
            >
              {/* COLLAPSE BUTTON */}
              <button
                onClick={() => setIsRightPanelOpen(false)}
                className="self-start m-3 p-1.5 rounded-lg hover:bg-white/10 calm-transition text-slate-400 hover:text-white"
                title="Collapse historian"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
              {/* EventsPanel — pass ALL existing props exactly as they are */}
              <EventsPanel {...panelProps} />
            </div>
          )}

          {/* RIGHT PANEL EXPAND BUTTON (shown when collapsed) */}
          {!isRightPanelOpen && (
            <button
              onClick={() => setIsRightPanelOpen(true)}
              className="flex flex-col items-center justify-center px-2 liquid-glass border-l border-white/10 hover:bg-white/10 calm-transition text-slate-400 hover:text-white"
              style={{ width: 32, flexShrink: 0 }}
              title="Expand historian"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
          )}

        </div>

        {/* ─── Bottom Timeline Row ──────────────────────────────────────── */}
        <div
          id="tour-timeline-desktop"
          className="liquid-glass-heavy border-t border-white/10 overflow-hidden"
          style={{ flexShrink: 0, height: 260 }}
        >
          <Timeline
            year={year}
            setYear={setYear}
            lang={lang}
            onEventClick={handleEventClick}
            onYearContextClick={handleYearContextClick}
            events={allEvents}
            rulers={allRulers}
            dynasties={allDynasties}
            historicalEvents={allHistoricalEvents}
            artifacts={allArtifacts}
            onHistoricalEventClick={handleHistoricalEventClick}
            onArtifactClick={handleArtifactClick}
            isLoadingAI={isLoadingAI}
          />
        </div>
      </div>

      {/* ── Shared modals (appear on both layouts) ───────────────────────── */}
      <Suspense fallback={null}>
        {(selectedEventId || selectedRegionId || selectedHistoricalEvent || selectedFigure || selectedArtifact || selectedSearchResult) && (
          <DetailModal
            eventId={selectedEventId}
            regionId={selectedRegionId}
            historicalEvent={selectedHistoricalEvent}
            figure={selectedFigure}
            artifact={selectedArtifact}
            searchResult={selectedSearchResult}
            year={year}
            lang={lang}
            onClose={closeModal}
            events={allEvents}
            rulers={allRulers}
            dynasties={allDynasties}
          />
        )}
      </Suspense>

      {/* Chatbot FAB — translates up by --sheet-height on mobile */}
      <Suspense fallback={null}>
        <Chatbot lang={lang} />
      </Suspense>

      {showSettings && <SettingsModal lang={lang} onClose={() => setShowSettings(false)} />}
      {showSupport  && <SupportModal  lang={lang} onClose={closeSupport} />}
      <SearchModal 
        isOpen={showSearch} 
        onClose={() => setShowSearch(false)} 
        onSearchResult={handleSearchResult} 
        lang={lang} 
      />
      
      {activeQuizQuestions && (
        <QuizModal
          year={year}
          isOpen={isQuizModalOpen}
          questions={activeQuizQuestions}
          hasApiKey={!!apiKey}
          lang={lang}
          onClose={() => setIsQuizModalOpen(false)}
          onEndQuiz={() => setActiveQuizQuestions(null)}
          onJumpToYear={(y) => { setYear(y); clearSelection(); }}
          onRequestAiQuestion={async (eraYear, askedMyths) => {
            return await generateQuizQuestion(eraYear, lang, askedMyths);
          }}
        />
      )}

      {/* Floating Resume Quiz Badge */}
      <AnimatePresence>
        {!isQuizModalOpen && activeQuizQuestions && (
          <motion.div
            initial={{ y: -20, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.9 }}
            className="fixed top-20 right-4 z-40 sm:top-auto sm:bottom-8 sm:right-[340px] sm:left-auto"
          >
            <button
              onClick={() => setIsQuizModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-5 sm:py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-900 shadow-xl rounded-full font-bold shadow-amber-500/20 active:scale-95 transition-all"
            >
              <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="text-[10px] sm:text-sm uppercase tracking-tight sm:normal-case sm:tracking-normal">
                {lang === 'en' ? 'Resume' : 'ادامه'}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Shared Components for Legend ───
const LegendItem = ({ color, label, lang }: { color: string, label: { en: string, fa: string }, lang: 'en' | 'fa' }) => {
  const colorMap: Record<string, string> = {
    persian: 'bg-[#a855f7]',
    arab:    'bg-[#10b981]',
    turkic:  'bg-[#ea580c]',
    greek:   'bg-[#0ea5e9]',
    nomadic: 'bg-[#b45309]',
    foreign: 'bg-[#e11d48]',
    semitic: 'bg-[#78350f]',
    // Dots
    amber:   'bg-amber-400',
    purple:  'bg-purple-400',
    emerald: 'bg-emerald-400',
    sky:     'bg-sky-400'
  };
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${colorMap[color]} shadow-md`} />
      <span className="text-[11px] text-slate-300 font-medium">
        {label[lang]}
      </span>
    </div>
  );
};
