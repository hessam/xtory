import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HistoricalEvent } from '../data/historicalEvents';
import { HistoricalFigure } from '../data/figures';
import { Artifact } from '../data/artifacts';
import { Swords, Skull, Globe2, Landmark, Sparkles, ChevronRight, ChevronLeft, Loader2, User, Book, Lightbulb, Palette, HelpCircle, Building2, MapPin } from 'lucide-react';
import { useApiKey } from '../context/ApiKeyContext';
import { MythCard } from './MythCard';
import { getQuestionsForYear } from '../data/quizQuestions';
import { QuizQuestion } from '../types/quiz';

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
}

export const EventsPanel: React.FC<EventsPanelProps> = ({ year, lang, events, figures, artifacts, onEventClick, onFigureClick, onArtifactClick, onFetchAIEvents, onFetchAIFigures, onFetchAIArtifacts, isLoadingAI, isLoadingAIFigures, isLoadingAIArtifacts, setShowSettings, onOpenQuiz }) => {
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

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'battle': return <Swords className="w-4 h-4 text-rose-400" />;
      case 'downfall': return <Skull className="w-4 h-4 text-purple-400" />;
      case 'political': return <Landmark className="w-4 h-4 text-sky-400" />;
      case 'cultural': return <Globe2 className="w-4 h-4 text-emerald-400" />;
      default: return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'battle': return 'border-rose-500/30 bg-rose-500/10';
      case 'downfall': return 'border-purple-500/30 bg-purple-500/10';
      case 'political': return 'border-sky-500/30 bg-sky-500/10';
      case 'cultural': return 'border-emerald-500/30 bg-emerald-500/10';
      default: return 'border-amber-500/30 bg-amber-500/10';
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
    <div 
      id="tour-events-panel-desktop" 
      className={`fixed sm:absolute bottom-0 sm:bottom-auto sm:top-24 left-0 sm:left-auto sm:right-6 w-full sm:w-80 z-20 flex flex-col pointer-events-none calm-transition ${isOpen ? 'h-[70vh] sm:h-auto' : 'h-16 sm:h-auto'}`}
    >
      {/* Mobile Drag Handle / Header */}
      <div className="sm:hidden flex flex-col items-center pointer-events-auto bg-slate-900/90 backdrop-blur-xl border-t border-x border-white/10 rounded-t-3xl shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
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

      {/* Desktop Toggle Button */}
      <div className="hidden sm:flex self-end items-center gap-2 pointer-events-auto">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-3 liquid-glass border border-white/10 rounded-2xl shadow-2xl text-slate-300 hover:text-white hover:bg-white/10 calm-transition"
        >
          {isOpen ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={typeof window !== 'undefined' && window.innerWidth < 640 ? { y: '100%' } : { opacity: 0, x: 20 }}
            animate={typeof window !== 'undefined' && window.innerWidth < 640 ? { y: 0 } : { opacity: 1, x: 0 }}
            exit={typeof window !== 'undefined' && window.innerWidth < 640 ? { y: '100%' } : { opacity: 0, x: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`sm:mt-4 w-full sm:w-80 liquid-glass-heavy border-x sm:border border-white/10 rounded-t-none sm:rounded-[2rem] shadow-2xl overflow-hidden pointer-events-auto flex flex-col flex-1 sm:flex-none sm:max-h-[50vh] bg-slate-900/95 sm:bg-transparent calm-transition`}
            dir={lang === 'fa' ? 'rtl' : 'ltr'}
          >
            {/* Tabs Row */}
            <div className="px-3 sm:px-5 py-3 sm:py-5 border-b border-white/5 flex flex-col gap-3 bg-white/5 sm:bg-transparent">
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

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3 custom-scrollbar">
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
                    !mythsForEra.length && (
                      <div className="text-center py-12 text-slate-500 text-sm italic">
                        {lang === 'en' ? 'No major events recorded in this era.' : 'هیچ رویداد مهمی در این دوره ثبت نشده است.'}
                      </div>
                    )
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

            <div className="p-4 sm:p-5 border-t border-white/5 bg-white/5 sm:bg-transparent">
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
