import React, { useState, useMemo, Suspense, lazy, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Map } from './components/Map';
import { Timeline } from './components/Timeline';
import { BottomSheet } from './components/BottomSheet';
const DetailModal = lazy(() => import('./components/DetailModal').then(module => ({ default: module.DetailModal })));
const Chatbot = lazy(() => import('./components/Chatbot').then(module => ({ default: module.Chatbot })));
import { EventsPanel } from './components/EventsPanel';
import { SearchBar } from './components/SearchBar';
import { SearchModal } from './components/SearchModal';
import { AIKeyButton } from './components/AIKeyButton';
import { TourGuide } from './components/TourGuide';
import { QuizModal } from './components/QuizModal';
import { generateQuizQuestion } from './services/geminiService';
import { getQuestionsForYear } from './data/quizQuestions';
import { QuizQuestion } from './types/quiz';
import { Globe, Languages, HelpCircle, Key, AlertCircle, Heart, Search } from 'lucide-react';
import { formatYear } from './utils/format';
import { events as initialEvents, ReignEvent } from './data/events';
import { rulers as initialRulers, Ruler } from './data/rulers';
import { dynasties as initialDynasties, Dynasty, Classification } from './data/dynasties';
import { historicalEvents as initialHistoricalEvents, HistoricalEvent } from './data/historicalEvents';
import { historicalFigures, HistoricalFigure } from './data/figures';
import { artifacts as initialArtifacts, Artifact } from './data/artifacts';
import { DynamicRulerData, fetchHistoricalDataForYear, fetchHistoricalEventsForYear, fetchHistoricalFiguresForYear, fetchArtifactsForYear, SearchResult } from './services/geminiService';
import { useApiKey } from './context/ApiKeyContext';
import { SettingsModal } from './components/SettingsModal';
import { SupportModal } from './components/SupportModal';

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
    setSelectedEventId(null);
    setSelectedRegionId(null);
    setSelectedHistoricalEvent(null);
    setSelectedFigure(null);
    setSelectedArtifact(null);
    setSelectedSearchResult(null);
  };

  const handleRegionClick          = (regionId: string)        => { clearSelection(); setSelectedRegionId(regionId); };
  const handleEventClick           = (eventId: string)         => { clearSelection(); setSelectedEventId(eventId); };
  const handleHistoricalEventClick = (event: HistoricalEvent) => { clearSelection(); setSelectedHistoricalEvent(event); };
  const handleFigureClick          = (figure: HistoricalFigure)=> { clearSelection(); setSelectedFigure(figure); };
  const handleArtifactClick        = (artifact: Artifact)      => { clearSelection(); setSelectedArtifact(artifact); };
  const handleSearchResult         = (result: SearchResult)    => { clearSelection(); setYear(result.year); setSelectedSearchResult(result); };

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
    onJumpToYear: (y: number) => { setYear(y); }
  };

  return (
    <div
      className={`w-screen h-[100dvh] bg-[#020617] text-slate-200 overflow-hidden selection:bg-indigo-500/30 ${lang === 'fa' ? 'font-vazirmatn' : 'font-sans'}`}
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
    >
      <TourGuide lang={lang} run={runTour} onFinish={() => setRunTour(false)} />

      {/* ════════════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (flex column, no absolute children compete)
          max-width: 640px (sm breakpoint)
          ================================================================ */}
      <div className="sm:hidden flex flex-col w-full h-full overflow-hidden" id="app-mobile-container">

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
          className="flex items-center justify-between px-3 bg-slate-900/90 backdrop-blur-xl border-b border-white/10 gap-2"
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
              id="tour-lang"
              onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
              className="p-2 rounded-xl liquid-glass hover:bg-white/10 calm-transition text-xs font-bold text-white min-w-[36px]"
            >
              {lang === 'en' ? 'FA' : 'EN'}
            </button>
          </div>
        </header>

        {/* ── Map area  flex-1, shrinks as sheet grows ─────────────────── */}
        <div id="map-area" style={{ flex: 1, minHeight: 0, zIndex: 0 }} className="relative overflow-hidden">
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
          />
        </div>

        {/* ── Scrubber row  44px, z-30, BETWEEN map and sheet ─────────── */}
        <div
          id="tour-timeline"
          style={{ height: 'auto', flexShrink: 0, zIndex: 30 }}
          className="flex items-center bg-slate-900/95 backdrop-blur-xl border-t border-white/10"
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

        {/* ── Bottom Sheet  z-20, NOT absolute ────────────────────────── */}
        <BottomSheet {...panelProps} setShowSettings={setShowSettings} />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (sm+, unchanged from before)
          All children are absolute/overlapping like before
          ================================================================ */}
      <div className="hidden sm:block relative w-full h-full">

        {/* Map Background */}
        <div id="tour-map" className="absolute inset-0 z-0">
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
          />
        </div>

        {/* Floating Header */}
        <header className="absolute top-0 left-0 right-0 p-4 md:p-6 flex items-center justify-between z-10 pointer-events-none gap-4">
          <div className="flex items-center gap-3 pointer-events-auto liquid-glass px-5 py-4 rounded-3xl calm-transition">
            <Globe className="w-6 h-6 text-indigo-400 shrink-0" />
            <h1 className="text-lg md:text-xl font-bold font-serif tracking-tight text-white">
              {lang === 'en' ? 'The Living Atlas of Greater Iran' : 'اطلس تاریخ ایران بزرگ'}
            </h1>
          </div>

          <div className="flex items-center gap-4 pointer-events-auto">
            <div id="tour-search">
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
              id="tour-lang"
              onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
              className="flex items-center gap-2 px-5 py-4 rounded-3xl liquid-glass hover:bg-white/10 calm-transition text-sm font-medium text-white shrink-0"
            >
              <Languages className="w-4 h-4 mr-2" />
              {lang === 'en' ? 'فارسی' : 'English'}
            </button>
          </div>
        </header>

        {/* BYOK Banner — desktop version */}
        {isReady && !apiKey && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl liquid-glass backdrop-blur-md shadow-lg">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm text-amber-100 font-medium whitespace-nowrap">
                {lang === 'en' ? 'Add your free Gemini key to unlock AI features' : 'برای باز کردن ویژگی‌های هوش مصنوعی، کلید رایگان جمینای خود را اضافه کنید'}
              </span>
              <button
                onClick={() => setShowSettings(true)}
                className="ml-2 px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-semibold calm-transition"
              >
                {lang === 'en' ? 'Add Key' : 'افزودن کلید'}
              </button>
            </div>
          </div>
        )}

        {/* Desktop Events Panel (sidebar) */}
        <EventsPanel {...panelProps} />

        {/* Bottom Timeline */}
        <div id="tour-timeline" className="absolute bottom-0 left-0 right-0 p-4 md:p-6 z-10 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-7xl mx-auto liquid-glass-heavy rounded-[2rem] overflow-hidden flex flex-col h-[35vh] min-h-[250px] max-h-[400px] calm-transition">
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
            initial={{ y: 50, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.9 }}
            className="fixed bottom-24 right-4 z-40 sm:bottom-8 sm:right-[340px]"
          >
            <button
              onClick={() => setIsQuizModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-900 shadow-2xl rounded-full font-bold shadow-amber-500/20 active:scale-95 transition-all animate-bounce"
            >
              <HelpCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm">{lang === 'en' ? 'Resume Challenge' : 'ادامه چالش'}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
