import React, { useState, useMemo, Suspense, lazy, useEffect, startTransition } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, Languages, HelpCircle, Key, AlertCircle, Heart, Search, X, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
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
const Map        = lazy(() => import('./components/MapLeaflet'));
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
const IntroAnimation = lazy(() => import('./components/IntroAnimation'));

export default function App() {
  const [year, setYear] = useState<number>(-500);
  const [lang, setLang] = useState<'en' | 'fa'>(() => {
    // 1. Respect explicit user choice (they toggled the language button)
    const stored = localStorage.getItem('atlas_lang');
    if (stored === 'fa' || stored === 'en') return stored;

    // 2. Timezone signal — survives VPN, proxy, and English browser settings
    //    Asia/Tehran = Iran, Asia/Kabul = Afghanistan (Dari/Farsi speakers)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz === 'Asia/Tehran' || tz === 'Asia/Kabul') return 'fa';
    } catch (_) {}

    // 3. Browser language fallback (catches the ~2% with Persian browser)
    if (navigator.language?.startsWith('fa')) return 'fa';

    return 'en';
  });
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
  const [selectedBanner, setSelectedBanner] = useState<{ url: string, title: string } | null>(null);
  const [legendMode, setLegendMode] = useState<'simple' | 'detailed'>('simple');
  const [aiError, setAiError] = useState<string | null>(null);
  const [introComplete, setIntroComplete] = useState(() => typeof window !== 'undefined' ? !!localStorage.getItem('atlas_intro_seen') : false);
  const [showExtentTooltip, setShowExtentTooltip] = useState(false);

  // Auto-dismiss AI error after 6 seconds
  useEffect(() => {
    if (aiError) {
      const timer = setTimeout(() => setAiError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [aiError]);

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

  // Sync lang to HTML tag + persist to localStorage
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    localStorage.setItem('atlas_lang', lang);
  }, [lang]);

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
        // AI events are now safely injected and rely on MapLeaflet's render-time prioritization.
        // This stops massive AI temporal blocks from being rejected by tiny static temporal blocks.

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
          status: item.status,
          isAiGenerated: true
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
      setSelectedVazir(null);
      setSelectedBanner(null);
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
    setAiError(null);
    try {
      const data = await fetchHistoricalDataForYear(y, lang);
      if (data?.length) handleAddDynamicData(data);
    } catch (err: any) {
      setAiError(err.message || 'Error fetching era context');
    } finally {
      setIsLoadingAI(false);
    }
  };

  const handleFetchAIEvents = async (y: number) => {
    setIsLoadingAIEvents(true);
    setAiError(null);
    try {
      const data = await fetchHistoricalEventsForYear(y, lang);
      if (data?.length) handleAddDynamicHistoricalEvents(data);
    } catch (err: any) {
      setAiError(err.message || 'Error fetching AI events');
    } finally {
      setIsLoadingAIEvents(false);
    }
  };

  const handleFetchAIFigures = async (y: number) => {
    setIsLoadingAIFigures(true);
    setAiError(null);
    try {
      const data = await fetchHistoricalFiguresForYear(y, lang);
      if (data?.length) handleAddDynamicFigures(data);
    } catch (err: any) {
      setAiError(err.message || 'Error fetching AI figures');
    } finally {
      setIsLoadingAIFigures(false);
    }
  };

  const handleFetchAIArtifacts = async (y: number) => {
    setIsLoadingAIArtifacts(true);
    setAiError(null);
    try {
      const data = await fetchArtifactsForYear(y, lang);
      if (data?.length) handleAddDynamicArtifacts(data);
    } catch (err: any) {
      setAiError(err.message || 'Error fetching AI artifacts');
    } finally {
      setIsLoadingAIArtifacts(false);
    }
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
    isLoadingAI: isLoadingAIEvents || isLoadingAIFigures || isLoadingAIArtifacts,
    selectedVazir,
    onVazirClose: () => setSelectedVazir(null),
    onVazirClick: (v: any) => setSelectedVazir(v),
    onBannerClick: (url: string, title: string) => setSelectedBanner({ url, title }),
    setShowSettings,
    onOpenQuiz: (questions: QuizQuestion[]) => {
      setActiveQuizQuestions(questions);
      setIsQuizModalOpen(true);
    },
    onJumpToYear: (y: number) => { setYear(y); },
  };

  return (
    <div
      className={`w-screen h-[100dvh] bg-[#020617] text-slate-200 overflow-hidden selection:bg-indigo-500/30 ${lang === 'fa' ? 'font-vazirmatn' : 'font-sans'}`}
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
    >
      {!introComplete && (
        <Suspense fallback={null}>
          <IntroAnimation 
            onComplete={(autoRun) => {
              setIntroComplete(true);
              if (autoRun) setRunTour(true);
            }} 
            lang={lang} 
          />
        </Suspense>
      )}
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

        {/* Timeline ─ always highest z-index in the mobile stack */}
        {/* z-38: above BottomSheet, below modals/TopBar */}
        <div
          id="tour-timeline-mobile"
          style={{ 
            height: 'auto', 
            flexShrink: 0, 
            zIndex: 38,
            boxSizing: 'content-box'
          }}
          className="flex liquid-glass-heavy border-t border-white/10 overflow-hidden"
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

        {/* BottomSheet ─ z-30, always below Timeline (z-38) */}
        {/* When dragged down, the Timeline paints on top — it is the visual floor */}
        {/* overflow-visible lets the sheet render below the wrapper during drag */}
        <div className="absolute inset-x-0 top-0 pointer-events-none overflow-visible" 
             style={{ 
               zIndex: 30,
               bottom: 'calc(104px + max(var(--safe-bottom), 16px))' 
             }}>
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
            <Suspense fallback={<div style={{ height: 60, width: '100%' }} />}>
              <BottomSheet 
                {...panelProps} 
                setShowSettings={setShowSettings} 
                reignEvents={allEvents}
                rulers={allRulers}
                dynasties={allDynasties}
                onReignEventClick={handleEventClick}
                onYearContextClick={handleYearContextClick}
                isLoadingRulers={isLoadingAI}
              />
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

        {/* ─── Main Desktop Row (L-Sidebars + Map + Timeline + R-Sidebar) ────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative">

          {/* LEFT CONTENT AREA (V-STACK: Sidebars/Map + Timeline) */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="flex-1 flex min-h-0 overflow-hidden relative">

          {/* LEFT PANEL (Legend — collapsible) */}
          <div
            className="relative flex flex-col liquid-glass-heavy ltr:border-r rtl:border-l border-white/10 calm-transition overflow-visible"
            style={{ width: isLeftPanelOpen ? 240 : 48, flexShrink: 0 }}
          >
            {/* THE PIVOT (Always visible on the right edge) */}
            <button
               id="legend-pivot-trigger"
               onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
               className="absolute ltr:-right-[13px] rtl:-left-[13px] top-1/2 -translate-y-1/2 z-50 flex flex-col items-center justify-center cursor-pointer group"
               style={{ width: 26, height: 120 }}
               title={isLeftPanelOpen ? "Collapse Legend" : "Expand Legend"}
            >
              <div className="gold-thread" style={{ left: '50%' }} />
              <div 
                className="diamond-pivot group-hover:scale-110 group-hover:border-amber-400/80 transition-all duration-500" 
                style={{ transform: `rotate(${isLeftPanelOpen ? '45deg' : '-45deg'})` }}
              />
            </button>

            {/* COLLAPSED CONTENT (Vertical Spine Text) */}
            {!isLeftPanelOpen && (
              <div className="absolute inset-0 flex flex-col items-center justify-center py-12 pointer-events-none">
                <span className="historian-spine-text opacity-40 transition-opacity">
                  {lang === 'en' ? 'Legend' : 'راهنما'}
                </span>
                <div className="mt-8 diamond-pivot scale-75 opacity-20 rotate-45" />
              </div>
            )}

            {/* OPEN CONTENT */}
            <div className={`flex-1 flex flex-col overflow-y-auto overflow-x-hidden transition-all duration-700 ${isLeftPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none whitespace-nowrap'}`}>
               <div className="px-4 py-3 flex flex-col gap-3">
                {/* LEGEND Header */}
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 pb-1">
                  {lang === 'en' ? 'Legend' : 'راهنما'}
                </span>

                <div className="flex flex-col gap-2.5">
                  {/* Simple/Detailed Toggle Content */}
                  {legendMode === 'simple' ? (
                    <>
                      <LegendItem colors={['persian']} label={{ en: 'Persian/Iranian', fa: 'ایرانی/پارسی' }} lang={lang} />
                      <LegendItem colors={['arab', 'greek', 'foreign', 'semitic']} label={{ en: 'Caliphate/Foreign', fa: 'خلافت/خارجی' }} lang={lang} />
                      <LegendItem colors={['turkic', 'nomadic']} label={{ en: 'Nomadic/Contested', fa: 'عشایر/مناقشه' }} lang={lang} />
                    </>
                  ) : (
                    <>
                      <LegendItem colors={['persian']} label={{ en: 'Persian/Iranian', fa: 'ایرانی/پارسی' }} lang={lang} />
                      <LegendItem colors={['arab']} label={{ en: 'Arab/Caliphate', fa: 'عرب/خلافت' }} lang={lang} />
                      <LegendItem colors={['turkic']} label={{ en: 'Turkic/Mongol', fa: 'ترک/مغول' }} lang={lang} />
                      <LegendItem colors={['greek']} label={{ en: 'Hellenic/Greek', fa: 'یونانی/هلنیستی' }} lang={lang} />
                      <LegendItem colors={['nomadic']} label={{ en: 'Nomadic/Steppe', fa: 'عشایر/استپ' }} lang={lang} />
                      <LegendItem colors={['foreign']} label={{ en: 'Foreign Imperial', fa: 'امپراتوری خارجی' }} lang={lang} />
                      <LegendItem colors={['semitic']} label={{ en: 'Babylonian/Semitic', fa: 'بابلی/سامی' }} lang={lang} />
                      <div className="w-full h-px bg-white/5 my-1" />
                      <LegendDashItem color="#f59e0b" label={{ en: 'Achaemenid Max Extent', fa: 'حداکثر قلمرو هخامنشی' }} lang={lang} />
                      <LegendDashItem color="#818cf8" label={{ en: 'Sassanid Max Extent', fa: 'حداکثر قلمرو ساسانی' }} lang={lang} />
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
                  <LegendItem colors={['amber']} label={{ en: 'Vazir (Advisor)', fa: 'وزیر' }} lang={lang} />
                  <LegendItem colors={['purple']} label={{ en: 'Historical Figure', fa: 'شخصیت تاریخی' }} lang={lang} />
                  <LegendItem colors={['emerald']} label={{ en: 'Historical Event', fa: 'رویداد تاریخی' }} lang={lang} />
                  <LegendItem colors={['sky']} label={{ en: 'Cultural Heritage', fa: 'میراث فرهنگی' }} lang={lang} />
                </div>

                {/* CONTROL EXTENT Key */}
                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 pb-1">
                    {lang === 'en' ? 'Control Extent' : 'گستره حاکمیت'}
                  </span>
                  {[
                    { label: { en: 'Direct Control', fa: 'کنترل مستقیم' }, opacity: 0.9 },
                    { label: { en: 'Partial Control', fa: 'کنترل نسبی' }, opacity: 0.7 },
                    { label: { en: 'Vassal State', fa: 'دولت دست‌نشانده' }, opacity: 0.55 },
                    { label: { en: 'Sphere of Influence', fa: 'حوزه نفوذ' }, opacity: 0.25 },
                    { label: { en: 'Contested/Warzone', fa: 'مناقشه/جنگ' }, opacity: 0.15 },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div
                        className="w-6 h-2.5 rounded-sm border border-white/10"
                        style={{ background: `rgba(168, 85, 247, ${item.opacity})` }}
                      />
                      <span className="text-[10px] text-slate-400 leading-tight">{item.label[lang]}</span>
                    </div>
                  ))}
                </div>

                {/* BOUNDARIES Key */}
                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 pb-1">
                    {lang === 'en' ? 'Boundaries' : 'مرزها'}
                  </span>
                  <div className="flex items-center gap-2">
                    <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" stroke="#10b981" strokeWidth="2" strokeDasharray="3,4" opacity="0.7"/></svg>
                    <span className="text-[10px] text-slate-400">{lang === 'en' ? 'Modern Iran' : 'مرز ایران مدرن'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="4,4" opacity="0.6"/></svg>
                    <span className="text-[10px] text-slate-400">{lang === 'en' ? 'Achaemenid Max Extent' : 'بیشترین گستره هخامنشی'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" stroke="#818cf8" strokeWidth="1.8" strokeDasharray="3,4" opacity="0.6"/></svg>
                    <span className="text-[10px] text-slate-400">{lang === 'en' ? 'Sasanian Max Extent' : 'بیشترین گستره ساسانی'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

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

            {/* Control Extent Academic Tooltip — bottom-left of map */}
            <div className="absolute bottom-4 left-4 z-50 pointer-events-auto max-w-xs">
              <button
                onClick={() => setShowExtentTooltip(v => !v)}
                className="liquid-glass border border-white/10 rounded-xl px-3 py-1.5 text-[10px] text-slate-400 hover:text-white calm-transition flex items-center gap-1.5 shadow-lg"
                title={lang === 'en' ? 'About Control Extent' : 'درباره گستره حاکمیت'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                {lang === 'en' ? 'About Map Opacity' : 'درباره شفافیت نقشه'}
              </button>
              {showExtentTooltip && (
                <div className="mt-2 liquid-glass-heavy border border-white/10 rounded-2xl p-4 shadow-2xl text-[11px] leading-relaxed text-slate-300 font-vazirmatn">
                  <button
                    onClick={() => setShowExtentTooltip(false)}
                    className="absolute top-2 right-3 text-slate-500 hover:text-white calm-transition text-sm"
                  >✕</button>
                  {lang === 'en' ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Methodological Note</span>
                      <p>
                        Historical regions on this map represent broad geographic zones, not precise political borders.
                        A single polygon (e.g. <em>Khorasan</em>) may span territories held by multiple modern nations.
                      </p>
                      <p>
                        <strong>Opacity indicates the degree of sovereign control</strong> a dynasty exercised over each region.
                        Full opacity ("Direct Control") denotes complete administrative authority.
                        Reduced opacity ("Partial Control") signifies that the dynasty governed only a portion of the
                        mapped zone — for instance, modern Iran's Khorasan Razavi within the larger historical Khorasan.
                      </p>
                      <p className="text-slate-500 text-[10px] italic">
                        This graduated-opacity method avoids the false precision of drawing borders where none
                        historically existed, while still conveying the varying degrees of political reach.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2" dir="rtl">
                      <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">یادداشت روش‌شناختی</span>
                      <p>
                        مناطق تاریخی روی این نقشه نشان‌دهنده حوزه‌های جغرافیایی گسترده هستند، نه مرزهای سیاسی دقیق.
                        یک چندضلعی (مانند <em>خراسان</em>) ممکن است قلمروهایی را شامل شود که امروزه به چند کشور تعلق دارند.
                      </p>
                      <p>
                        <strong>شفافیت نشان‌دهنده میزان حاکمیت واقعی</strong> هر سلسله بر هر منطقه است.
                        شفافیت کامل («کنترل مستقیم») به معنای اقتدار اداری کامل است.
                        شفافیت کمتر («کنترل نسبی») به این معناست که سلسله تنها بخشی از منطقه نمایش داده شده را
                        اداره می‌کرد — مثلاً خراسان رضوی ایران امروزی در دل خراسان بزرگ تاریخی.
                      </p>
                      <p className="text-slate-500 text-[10px] italic">
                        این روش شفافیت تدریجی از دقت کاذب مرزبندی در جایی که مرز مشخصی وجود نداشته جلوگیری می‌کند،
                        در عین حال که درجه‌های متفاوت دسترسی سیاسی را به‌خوبی نمایش می‌دهد.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* BYOK Banner temporarily hidden until layout matures
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
            )} */}
            </div>
            </div>

            {/* ─── Bottom Timeline Row (Nested sibling to Map) ───────────────── */}
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

          {/* RIGHT PANEL (EventsPanel — collapsible, now full height sibling) */}
          <div
            className="relative flex flex-col liquid-glass-heavy ltr:border-l rtl:border-r border-white/10 calm-transition overflow-visible"
            style={{ width: isRightPanelOpen ? 360 : 48, flexShrink: 0 }}
          >
            {/* THE PIVOT (Always visible on the left edge) */}
            <button
              id="historian-pivot-trigger"
              onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
              className="absolute ltr:-left-[13px] rtl:-right-[13px] top-1/2 -translate-y-1/2 z-50 flex flex-col items-center justify-center cursor-pointer group"
              style={{ width: 26, height: 120 }}
              title={isRightPanelOpen ? "Collapse Historian" : "Expand Historian"}
            >
              <div className="gold-thread" style={{ left: '50%' }} />
              <div 
                className="diamond-pivot group-hover:scale-110 group-hover:border-amber-400/80 transition-all duration-500" 
                style={{ transform: `rotate(${isRightPanelOpen ? '45deg' : '135deg'})` }}
              />
            </button>

            {/* COLLAPSED CONTENT (Vertical Spine Text) */}
            {!isRightPanelOpen && (
              <div className="absolute inset-0 flex flex-col items-center justify-center py-12 pointer-events-none">
                <span className="historian-spine-text opacity-40 transition-opacity">
                  {lang === 'en' ? 'Historian' : 'مورخ'}
                </span>
                <div className="mt-8 diamond-pivot scale-75 opacity-20 rotate-45" />
              </div>
            )}

            {/* OPEN CONTENT */}
            <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-700 ${isRightPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none whitespace-nowrap'}`}>
              <EventsPanel 
                {...panelProps} 
              />
            </div>
          </div>
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
        {selectedVazir && (
          <VazirCard 
            vazir={selectedVazir} 
            lang={lang} 
            onClose={() => setSelectedVazir(null)} 
          />
        )}
        {selectedBanner && (
          <BannerLightbox
            url={selectedBanner.url}
            title={selectedBanner.title}
            lang={lang}
            onClose={() => setSelectedBanner(null)}
          />
        )}
      </Suspense>

      {/* 
        AI Assistant (Chatbot) 
        Hiding on mobile to keep the experience focused on the Atlas and Drawer.
        Currently optimized for desktop users only.
      */}
      {window.innerWidth >= 640 && (
        <Suspense fallback={null}>
          <Chatbot lang={lang} />
        </Suspense>
      )}

      {showSettings && <SettingsModal lang={lang} onClose={() => setShowSettings(false)} />}
      {showSupport  && <SupportModal  lang={lang} onClose={closeSupport} />}
      <SearchModal 
        isOpen={showSearch} 
        onClose={() => setShowSearch(false)} 
        onSearchResult={handleSearchResult} 
        lang={lang} 
      />
      
      {/* AI Error Notification Toast */}
      <AnimatePresence>
        {aiError && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] w-full max-w-sm px-4 pointer-events-none ${lang === 'fa' ? 'font-vazirmatn' : ''}`}
          >
            <div className="liquid-glass-heavy border border-amber-500/40 rounded-2xl shadow-2xl p-4 flex gap-4 pointer-events-auto">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-500" />
              </div>
              <div className="flex-1 flex flex-col gap-1 pr-8">
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest leading-none">
                  {lang === 'en' ? 'Historian Unavailable' : 'مورخ در دسترس نیست'}
                </span>
                <p className="text-sm text-slate-200 font-medium leading-relaxed">
                  {aiError}
                </p>
                <button 
                  onClick={() => setAiError(null)}
                  className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded-md transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
const LegendItem = ({ colors, label, lang }: { colors: string[], label: { en: string, fa: string }, lang: 'en' | 'fa' }) => {
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
    <div className="flex items-center gap-2 group">
      <div className="flex -space-x-1.5 isolate">
        {colors.map((c, i) => (
          <div 
            key={i} 
            className={`w-2.5 h-2.5 rounded-full ${colorMap[c]} shadow-md border border-slate-900/40 calm-transition group-hover:scale-110`} 
            style={{ zIndex: colors.length - i }}
          />
        ))}
      </div>
      <span className="text-[11px] text-slate-300 font-medium whitespace-normal leading-tight">
        {label[lang]}
      </span>
    </div>
  );
};

const LegendDashItem = ({ color, label, lang }: { color: string, label: { en: string, fa: string }, lang: 'en' | 'fa' }) => {
  return (
    <div className="flex items-center gap-2 group">
      <div className="w-5 h-px border-t border-dashed" style={{ borderColor: color, opacity: 0.8 }} />
      <span className="text-[11px] text-slate-300 font-medium whitespace-normal leading-tight">
        {label[lang]}
      </span>
    </div>
  );
};

// ─── Vazir Profile Card Component ───
const VazirCard = ({ vazir, lang, onClose }: { vazir: Vazir, lang: 'en' | 'fa', onClose: () => void }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 pointer-events-none"
    >
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm pointer-events-auto" onClick={onClose} />
      
      <div className="relative w-full max-w-md liquid-glass-heavy border border-amber-500/30 rounded-[2rem] shadow-2xl pointer-events-auto overflow-hidden">
        {/* Gold Accent Thread */}
        <div className="absolute top-0 left-12 bottom-0 w-[1px] bg-gradient-to-b from-amber-500/0 via-amber-500/40 to-amber-500/0" />
        
        <div className="p-8 sm:p-10 flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold text-amber-500 uppercase ${lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel tracking-[0.3em]'}`}>
                {lang === 'en' ? 'The Great Vazir' : 'وزیر بزرگ'}
              </span>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full transition-colors -mr-2"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <h2 className={`text-3xl sm:text-4xl text-white leading-tight ${lang === 'fa' ? 'font-vazirmatn font-bold' : 'font-cinzel'}`}>
              {vazir.name[lang]}
            </h2>
            <p className="text-sm text-slate-400 font-medium">
              {vazir.title[lang]}
            </p>
          </div>

          {/* Body Sections */}
          <div className="flex flex-col gap-5 relative">
            {/* The Service */}
            <div className="flex flex-col gap-1 pl-6 relative">
              <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full border border-amber-500/60 bg-slate-900" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                {lang === 'en' ? 'The Service' : 'دوران خدمت'}
              </span>
              <p className="text-sm text-slate-200">
                {lang === 'en' ? `Served ${vazir.rulerName.en}` : `در خدمت ${vazir.rulerName.fa}`}
                <span className="mx-2 text-slate-600">|</span>
                <span className="font-mono text-xs text-amber-400/80">
                  {formatYear(vazir.activeYearStart, lang)} — {formatYear(vazir.activeYearEnd, lang)}
                </span>
              </p>
            </div>

            {/* The Contribution */}
            <div className="flex flex-col gap-2 pl-6 relative">
              <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full border border-amber-500/60 bg-slate-900" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                {lang === 'en' ? 'The Achievement' : 'دستاورد'}
              </span>
              <p className="text-sm text-slate-300 italic leading-relaxed">
                "{vazir.contribution[lang]}"
              </p>
            </div>

            {/* The Preservation */}
            <div className="flex flex-col gap-2 pl-6 relative">
              <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full border border-amber-500/60 bg-slate-900" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                {lang === 'en' ? 'What was Saved' : 'آنچه حفظ شد'}
              </span>
              <p className="text-sm text-slate-300 leading-relaxed">
                {vazir.preserved[lang]}
              </p>
            </div>

            {/* The Paradox - The "Hidden Heart" of the card */}
            <div className="mt-4 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/40" />
              <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-[0.2em] block mb-2">
                {lang === 'en' ? 'The Vazir\'s Paradox' : 'پارادوکس وزیر'}
              </span>
              <p className="text-sm text-amber-100/90 font-medium leading-relaxed">
                {vazir.paradox[lang]}
              </p>
            </div>
          </div>

          {/* Footer Action */}
          <button 
            onClick={onClose}
            className="w-full py-4 rounded-2xl border border-white/10 hover:bg-white/5 text-slate-400 text-xs uppercase tracking-widest font-bold calm-transition"
          >
            {lang === 'en' ? 'Return to Atlas' : 'بازگشت به اطلس'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Banner Lightbox Component ───
const BannerLightbox = ({ url, title, lang, onClose }: { url: string, title: string, lang: 'en' | 'fa', onClose: () => void }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-xl flex flex-col"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 sm:p-6 z-10" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
        <div className="flex flex-col">
          <span className={`text-[10px] font-bold text-amber-500 uppercase tracking-widest ${lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel tracking-[0.3em]'}`}>
            {lang === 'en' ? 'Living Atlas Illustration' : 'تصویر اطلس زنده'}
          </span>
          <h2 className={`text-xl sm:text-2xl text-white drop-shadow-lg ${lang === 'fa' ? 'font-vazirmatn font-bold' : 'font-cinzel'}`}>
            {title}
          </h2>
        </div>
        <button 
          onClick={onClose}
          className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-all active:scale-90 border border-white/10"
        >
          <X className="w-6 h-6 text-slate-300" />
        </button>
      </div>

      {/* Image Container with Zoom */}
      <div className="flex-1 overflow-hidden relative touch-none select-none">
        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={4}
          centerOnInit
          limitToBounds={false}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Controls */}
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/80 backdrop-blur-md border border-white/10 p-2 rounded-2xl z-20">
                <button onClick={() => zoomOut()} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors"><ZoomOut className="w-5 h-5 text-slate-300" /></button>
                <div className="w-px h-4 bg-white/10" />
                <button onClick={() => resetTransform()} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors"><Maximize className="w-5 h-5 text-slate-300" /></button>
                <div className="w-px h-4 bg-white/10" />
                <button onClick={() => zoomIn()} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors"><ZoomIn className="w-5 h-5 text-slate-300" /></button>
              </div>

              <TransformComponent 
                wrapperStyle={{ width: '100%', height: '100%', cursor: 'grab' }}
                contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <img 
                  src={url} 
                  className="max-w-[90vw] max-h-[75vh] object-contain shadow-2xl rounded-sm pointer-events-none" 
                  alt={title} 
                />
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>

      {/* Hint */}
      <div className={`py-6 text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold ${lang === 'fa' ? 'font-vazirmatn' : ''}`}>
        {lang === 'en' ? 'Use pinch or wheel to zoom · Drag to pan' : 'برای بزرگ‌نمایی از دو انگشت استفاده کنید'}
      </div>
    </motion.div>
  );
};
