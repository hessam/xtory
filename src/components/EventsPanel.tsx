import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HistoricalEvent } from '../data/historicalEvents';
import { HistoricalFigure } from '../data/figures';
import { Artifact } from '../data/artifacts';
import { Swords, Skull, Globe2, Landmark, Sparkles, Loader2, User, Book, Lightbulb, Palette, HelpCircle, Building2, MapPin } from 'lucide-react';
import { useApiKey } from '../context/ApiKeyContext';
import { MythCard } from './MythCard';
import { getQuestionsForYear } from '../data/quizQuestions';
import { QuizQuestion } from '../types/quiz';
import { HistorianCardSection } from './HistorianCardSection';
import { getHistorianCard } from '../utils/getHistorianCard';
import { Vazir } from '../data/vazirs';

interface EventsPanelProps {
  year: number;
  lang: 'en' | 'fa';
  events: HistoricalEvent[];
  figures: HistoricalFigure[];
  artifacts: Artifact[];
  onEventClick: (event: HistoricalEvent) => void;
  onFigureClick: (figure: HistoricalFigure) => void;
  onArtifactClick: (artifact: Artifact) => void;
  onFetchAIEvents: (year: number) => void;
  onFetchAIFigures: (year: number) => void;
  onFetchAIArtifacts: (year: number) => void;
  isLoadingAI: boolean;
   isLoadingAIFigures: boolean;
  isLoadingAIArtifacts: boolean;
  setShowSettings?: (show: boolean) => void;
  onOpenQuiz: (questions: QuizQuestion[]) => void;
  onJumpToYear?: (year: number) => void;
  selectedVazir?: Vazir | null;
  onVazirClose?: () => void;
}

export const EventsPanel: React.FC<EventsPanelProps> = ({ year, lang, events, figures, artifacts, onEventClick, onFigureClick, onArtifactClick, onFetchAIEvents, onFetchAIFigures, onFetchAIArtifacts, isLoadingAI, isLoadingAIFigures, isLoadingAIArtifacts, setShowSettings, onOpenQuiz, onJumpToYear, selectedVazir, onVazirClose }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'events' | 'figures' | 'artifacts'>('events');
  const { apiKey } = useApiKey();

  // Show events within +/- 25 years of the current year
  const activeEvents = useMemo(() => {
    return events.filter(e => Math.abs(e.year - year) <= 25).sort((a, b) => a.year - b.year);
  }, [year, events]);

  // Show figures who lived during the current year (with a small buffer)
  const activeFigures = useMemo(() => {
    return figures.filter(f => year >= f.birthYear - 10 && year <= f.deathYear + 10).sort((a, b) => a.birthYear - b.birthYear);
  }, [year, figures]);

  // Show artifacts prominent around the current year
  const activeArtifacts = useMemo(() => {
    return artifacts.filter(a => Math.abs(a.year - year) <= 100).sort((a, b) => a.year - b.year);
  }, [year, artifacts]);

  const mythsForEra = useMemo(() => {
    return getQuestionsForYear(year);
  }, [year]);

  const historianResult = useMemo(() => getHistorianCard(year), [year]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'battle': return <Swords className="w-4 h-4 text-rose-400" />;
      case 'downfall': return <Skull className="w-4 h-4 text-purple-400" />;
      case 'political': return <Landmark className="w-4 h-4 text-sky-400" />;
      case 'cultural': return <Globe2 className="w-4 h-4 text-emerald-400" />;
      case 'tradition': return <Sparkles className="w-4 h-4 text-amber-400" />;
      default: return <HelpCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'battle': return 'border-rose-500/30 bg-rose-500/10';
      case 'downfall': return 'border-purple-500/30 bg-purple-500/10';
      case 'political': return 'border-sky-500/30 bg-sky-500/10';
      case 'cultural': return 'border-emerald-500/30 bg-emerald-500/10';
      case 'tradition': return 'border-amber-500/30 bg-amber-500/10';
      default: return 'border-slate-500/30 bg-slate-500/10';
    }
  };

  const getFigureIcon = (type: string) => {
    switch (type) {
      case 'philosopher': return <Lightbulb className="w-4 h-4 text-amber-400" />;
      case 'poet': return <Book className="w-4 h-4 text-purple-400" />;
      case 'scientist': return <Globe2 className="w-4 h-4 text-sky-400" />;
      case 'artist': return <Palette className="w-4 h-4 text-rose-400" />;
      default: return <User className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getFigureColor = (type: string) => {
    switch (type) {
      case 'philosopher': return 'border-amber-500/30 bg-amber-500/10';
      case 'poet': return 'border-purple-500/30 bg-purple-500/10';
      case 'scientist': return 'border-sky-500/30 bg-sky-500/10';
      case 'artist': return 'border-rose-500/30 bg-rose-500/10';
      default: return 'border-emerald-500/30 bg-emerald-500/10';
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

  const getArtifactColor = (type: string) => {
    switch (type) {
      case 'monument': return 'border-amber-500/30 bg-amber-500/10';
      case 'architecture': return 'border-sky-500/30 bg-sky-500/10';
      case 'manuscript': return 'border-purple-500/30 bg-purple-500/10';
      default: return 'border-emerald-500/30 bg-emerald-500/10';
    }
  };

  const isLoading = activeTab === 'events' ? isLoadingAI : activeTab === 'figures' ? isLoadingAIFigures : isLoadingAIArtifacts;
  const handleFetch = () => {
    if (activeTab === 'events') {
      onFetchAIEvents(year);
    } else if (activeTab === 'figures') {
      onFetchAIFigures(year);
    } else {
      onFetchAIArtifacts(year);
    }
  };

  return (
    // ── On mobile: fixed bottom sheet. On desktop: a flex-col that fills the sidebar. ──
    <div 
      id="tour-events-panel-desktop" 
      className={`
        fixed sm:static
        bottom-0 sm:bottom-auto
        left-0 sm:left-auto
        w-full sm:w-auto sm:flex-1
        z-20 sm:z-auto
        flex flex-col
        sm:overflow-hidden
        pointer-events-none sm:pointer-events-auto
        calm-transition
        ${isOpen ? 'h-[70vh] sm:h-full' : 'h-16 sm:h-full'}
      `}
    >
      {/* Mobile Drag Handle / Header — hidden on desktop */}
      <div className="sm:hidden flex flex-col items-center pointer-events-auto liquid-glass border-t border-x border-white/10 rounded-t-3xl shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full py-3 flex flex-col items-center gap-1 cursor-pointer active:bg-white/5 transition-colors rounded-t-3xl"
        >
          <div className="w-12 h-1 bg-white/20 rounded-full mb-1" />
          <div className="flex justify-between items-center w-full px-6">
            <h3 className="font-serif font-bold text-white text-sm">
              {lang === 'en' ? 'Context of this Era' : 'زمینه این دوره'}
            </h3>
            <span className="text-xs font-mono text-slate-400 bg-black/20 px-2 py-0.5 rounded-lg border border-white/10">
              {Math.abs(year)}{year < 0 ? ' BC' : ' AD'}
            </span>
          </div>
        </div>
      </div>

      {/*
        Mobile: AnimatePresence slide-up sheet with its own glass box.
        Desktop: plain flex-col that fills the sidebar (no extra wrapper/glass).
      */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={typeof window !== 'undefined' && window.innerWidth < 640 ? { y: '100%' } : false}
            animate={typeof window !== 'undefined' && window.innerWidth < 640 ? { y: 0 } : {}}
            exit={typeof window !== 'undefined' && window.innerWidth < 640 ? { y: '100%' } : {}}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={
              /* Mobile: glass card rising from bottom */
              /* Desktop: transparent, fills sidebar, no border/shadow of its own */
              `w-full
               liquid-glass-heavy sm:bg-transparent
               border-x border-white/10 sm:border-0
               rounded-t-none
               overflow-hidden pointer-events-auto
               flex flex-col
               flex-1
               sm:h-full sm:overflow-hidden`
            }
            dir={lang === 'fa' ? 'rtl' : 'ltr'}
          >
            {/* ── Historian Card (always visible, above tabs) ── */}
            {isOpen && (
              <div className="relative border-b border-white/10 flex-shrink-0 max-h-[38%] overflow-y-auto custom-scrollbar">
                <HistorianCardSection
                  result={historianResult}
                  lang={lang}
                  onNavigate={(y) => onJumpToYear?.(y)}
                  isEnriching={isLoadingAI}
                  selectedVazir={selectedVazir}
                  onVazirClose={onVazirClose}
                />
                {/* Scroll-fade mask — appears only when content overflows */}
                <div className="sticky bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-slate-900/80 to-transparent pointer-events-none" />
              </div>
            )}

            {/* Tabs Row */}
            <div className="px-4 py-3 border-b border-white/5 flex flex-col gap-3">
              {/* Desktop Header (Hidden on Mobile) */}
              <div className="hidden sm:flex justify-between items-center">
                <h3 className="font-serif font-bold text-white text-sm">
                  {lang === 'en' ? 'Context of this Era' : 'زمینه این دوره'}
                </h3>
                <span className="text-xs font-mono text-slate-400 bg-black/20 px-2 py-1 rounded-lg border border-white/10">
                  {Math.abs(year)}{year < 0 ? ' BC' : ' AD'}
                </span>
              </div>
              
              <div className="flex bg-black/20 rounded-xl p-1 border border-white/5">
                <button
                  onClick={() => setActiveTab('events')}
                  className={`flex-1 py-1.5 sm:py-2 text-xs font-medium rounded-lg transition-all ${activeTab === 'events' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {lang === 'en' ? 'Events' : 'رویدادها'}
                </button>
                <button
                  onClick={() => setActiveTab('figures')}
                  className={`flex-1 py-1.5 sm:py-2 text-xs font-medium rounded-lg transition-all ${activeTab === 'figures' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {lang === 'en' ? 'Figures' : 'شخصیت‌ها'}
                </button>
                <button
                  onClick={() => setActiveTab('artifacts')}
                  className={`flex-1 py-1.5 sm:py-2 text-xs font-medium rounded-lg transition-all ${activeTab === 'artifacts' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {lang === 'en' ? 'Heritage' : 'میراث'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
              {activeTab === 'events' && (
                <>
                  {activeEvents.length > 0 ? (
                    activeEvents.map(event => (
                      <motion.div
                        key={event.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onEventClick(event)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all ${getEventColor(event.type)} hover:brightness-125 min-h-[44px] flex items-center mb-1 text-left rtl:text-right shrink-0`}
                      >
                        <div className="flex items-start gap-3 w-full">
                          <div className="mt-0.5 p-2 bg-black/20 rounded-full shadow-inner shrink-0">
                            {getEventIcon(event.type)}
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-slate-200 text-sm leading-tight truncate flex-1">{event.title[lang]}</h4>
                              <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap shrink-0">
                                {Math.abs(event.year)} {event.year < 0 ? 'BC' : 'AD'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{event.description[lang]}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-slate-500 text-sm italic">
                      {lang === 'en' ? 'No major events recorded in this era.' : 'هیچ رویداد مهمی در این دوره ثبت نشده است.'}
                    </div>
                  )}

                  {/* Myth card — reward at the bottom, not a competing headline */}
                  {mythsForEra.length > 0 && (
                    <MythCard
                      question={mythsForEra[0]}
                      lang={lang}
                      year={year}
                      hasApiKey={!!apiKey}
                      onOpenQuiz={() => onOpenQuiz(mythsForEra)}
                      onOpenSettings={() => setShowSettings && setShowSettings(true)}
                    />
                  )}
                  {mythsForEra.length === 0 && (
                    <MythCard
                      question={undefined}
                      lang={lang}
                      year={year}
                      hasApiKey={!!apiKey}
                      onOpenQuiz={() => onOpenQuiz(mythsForEra)}
                      onOpenSettings={() => setShowSettings && setShowSettings(true)}
                    />
                  )}
                </>
              )}
              
              {activeTab === 'figures' && (
                activeFigures.length > 0 ? (
                  activeFigures.map(figure => (
                    <motion.div
                      key={figure.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onFigureClick(figure)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all ${getFigureColor(figure.type)} hover:brightness-125 min-h-[44px] flex items-center mb-1 text-left rtl:text-right shrink-0`}
                    >
                      <div className="flex items-start gap-3 w-full">
                        <div className="mt-0.5 p-2 bg-black/20 rounded-full shadow-inner shrink-0">
                          {getFigureIcon(figure.type)}
                        </div>
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
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-500 text-sm italic">
                    {lang === 'en' ? 'No major figures recorded in this era.' : 'هیچ شخصیت مهمی در این دوره ثبت نشده است.'}
                  </div>
                )
              )}

              {activeTab === 'artifacts' && (
                activeArtifacts.length > 0 ? (
                  activeArtifacts.map(artifact => (
                    <motion.div
                      key={artifact.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onArtifactClick(artifact)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all ${getArtifactColor(artifact.type)} hover:brightness-125 min-h-[44px] flex items-center mb-1 text-left rtl:text-right shrink-0`}
                    >
                      <div className="flex items-start gap-3 w-full">
                        <div className="mt-0.5 p-2 bg-black/20 rounded-full shadow-inner shrink-0">
                          {getArtifactIcon(artifact.type)}
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-slate-200 text-sm leading-tight truncate flex-1">{artifact.name[lang]}</h4>
                            <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap shrink-0">
                              {Math.abs(artifact.year)}{artifact.year < 0 ? ' BC' : ' AD'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{artifact.currentLocation[lang]}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-500 text-sm italic">
                    {lang === 'en' ? 'No major heritage recorded in this era.' : 'هیچ میراث مهمی در این دوره ثبت نشده است.'}
                  </div>
                )
              )}
            </div>

            <div className="p-4 border-t border-white/5">
              <button
                id="tour-ai-fetch-desktop"
                onClick={handleFetch}
                disabled={isLoading || !apiKey}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 liquid-glass text-indigo-300 border border-white/10 rounded-2xl hover:bg-white/20 active:scale-[0.98] calm-transition disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>
                  {lang === 'en' 
                    ? (activeTab === 'events' ? 'Discover More with AI' : activeTab === 'figures' ? 'Find New Figures with AI' : 'See More Heritage with AI') 
                    : (activeTab === 'events' ? 'کشف رویدادهای بیشتر' : activeTab === 'figures' ? 'یافتن شخصیت‌های جدید' : 'مشاهده میراث بیشتر')}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
