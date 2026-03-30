import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, HelpCircle, CheckCircle, XCircle, Share2, Send, ExternalLink, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { QuizQuestion } from '../types/quiz';
import { pushToDataLayer } from '../services/tagManager';

interface QuizModalProps {
  year: number;
  questions: QuizQuestion[];
  hasApiKey: boolean;
  lang: 'en' | 'fa';
  isOpen: boolean;
  onClose: () => void;
  onJumpToYear: (year: number) => void;
  onRequestAiQuestion: (year: number, askedMyths: string[]) => Promise<QuizQuestion | string | null>;
  onEndQuiz?: () => void;
}

export const QuizModal: React.FC<QuizModalProps> = ({ 
  year,
  isOpen,
  questions: initialQuestions, 
  hasApiKey, 
  lang, 
  onClose, 
  onJumpToYear,
  onRequestAiQuestion,
  onEndQuiz
}) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [state, setState] = useState<'question' | 'reveal' | 'summary' | 'loading'>(
    initialQuestions.length === 0 ? 'loading' : 'question'
  );
  const [userAnswer, setUserAnswer] = useState<QuizQuestion['answer'] | null>(null);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  // Sync incoming new quiz seeds if changing sessions
  React.useEffect(() => {
    if (initialQuestions.length > 0 && questions[0]?.id !== initialQuestions[0]?.id) {
      setQuestions(initialQuestions);
      setCurrentIndex(0);
      setScore(0);
      setState('question');
      setUserAnswer(null);
    }
  }, [initialQuestions]);

  // Initial fetch if empty
  React.useEffect(() => {
    let active = true;
    if (initialQuestions.length === 0 && hasApiKey && state === 'loading') {
      setIsLoadingNext(true);
      onRequestAiQuestion(year, []).then(nextAi => {
        if (!active) return;
        setIsLoadingNext(false);
        if (nextAi && typeof nextAi !== 'string') {
          setQuestions([nextAi]);
          setState('question');
        } else if (typeof nextAi === 'string') {
          setErrorStatus(nextAi);
        } else {
          onClose();
          if (onEndQuiz) onEndQuiz();
        }
      });
    }
    return () => { active = false; };
  }, [initialQuestions.length, hasApiKey, year, state]); // remove onRequestAiQuestion from deps to avoid infinite loop safely

  const currentQuestion = questions[currentIndex] as QuizQuestion | undefined;

  const handleAnswer = (answer: QuizQuestion['answer']) => {
    if (!currentQuestion) return;
    setUserAnswer(answer);
    
    const isCorrect = answer === currentQuestion.answer;
    if (isCorrect) {
      setScore(prev => prev + 1);
    }
    
    pushToDataLayer('quiz_question_answered', {
      question_id: currentQuestion.id,
      is_correct: isCorrect,
      is_ai_generated: currentQuestion.is_ai_generated
    });
    
    setState('reveal');
  };

  const handleNext = async () => {
    // Hard limit: stop at 5 questions
    if (currentIndex >= 4) {
      setState('summary');
      pushToDataLayer('quiz_completed', {
        final_score: score,
        total_questions: 5
      });
      return;
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setState('question');
      setUserAnswer(null);
    } else {
      if (hasApiKey && currentQuestion) {
        setIsLoadingNext(true);
        setState('loading');
        const askedMyths = questions.map(q => q.myth);
        const nextAi = await onRequestAiQuestion(year, askedMyths);
        setIsLoadingNext(false);
        if (nextAi && typeof nextAi !== 'string') {
          setQuestions(prev => [...prev, nextAi]);
          setCurrentIndex(prev => prev + 1);
          setState('question');
          setUserAnswer(null);
          return;
        } else if (typeof nextAi === 'string') {
          setErrorStatus(nextAi);
          return;
        }
      }
      
      if (questions.length === 0) {
        onClose();
        if (onEndQuiz) onEndQuiz();
      } else {
        setState('summary');
        pushToDataLayer('quiz_completed', {
          final_score: score,
          total_questions: questions.length
        });
      }
    }
  };

  const handleShare = (platform: 'twitter' | 'telegram') => {
    const bestQuestion = questions.find(q => q.answer !== 'TRUE') || questions[0];
    if (!bestQuestion) return;
    const text = lang === 'en' 
      ? `I scored ${score}/5 on an Xtory history challenge! I learned that "${bestQuestion.myth}" is actually false. The real story is wild. Test yourself → https://xtroy.sbs`
      : `در چالش تاریخی اکس‌توری ${score} از ۵ گرفتم! تازه فهمیدم که "${bestQuestion.myth_fa}" درست نیست. داستان واقعی خیلی جالب‌تره. تو هم امتحان کن ← https://xtroy.sbs`;
    
    const url = platform === 'twitter' 
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
      : `https://t.me/share/url?url=https://xtroy.sbs&text=${encodeURIComponent(text)}`;
    
    window.open(url, '_blank');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="liquid-glass-heavy rounded-3xl shadow-2xl w-full max-w-md p-6 border border-white/10 max-h-[90vh] overflow-hidden flex flex-col calm-transition relative"
          dir={lang === 'fa' ? 'rtl' : 'ltr'}
        >
          {errorStatus ? (
            <div className="flex flex-col items-center justify-center p-8 gap-6 text-center">
              <div className="p-4 bg-rose-500/20 rounded-full">
                <XCircle className="w-12 h-12 text-rose-400" />
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white">
                  {lang === 'en' ? 'Something went wrong' : 'خطایی رخ داد'}
                </h3>
                <div 
                  className="text-sm text-slate-300 leading-relaxed bg-black/20 p-4 rounded-2xl border border-white/5 whitespace-pre-line"
                  dangerouslySetInnerHTML={{ __html: errorStatus.replace(/\*\*/g, '<b>').replace(/\*\*/g, '</b>') }} 
                />
              </div>
              <button
                onClick={() => {
                  onClose();
                  if (onEndQuiz) onEndQuiz();
                }}
                className="w-full py-4 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm font-bold text-white transition-all"
              >
                {lang === 'en' ? 'Close' : 'بستن'}
              </button>
            </div>
          ) : (
            <>
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-amber-500/20 text-amber-300 border-amber-500/30">
                  <HelpCircle className="w-3 h-3" />
                  {lang === 'en' ? 'History Challenge' : 'چالش تاریخ'}
                </span>
                {state !== 'summary' && currentQuestion?.is_ai_generated && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400/50 italic">
                    <Sparkles className="w-3 h-3" />
                    {lang === 'en' ? 'AI Generated' : 'تولید شده توسط هوش مصنوعی'}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold font-serif text-white">
                {state === 'summary' 
                  ? (lang === 'en' ? 'Session Summary' : 'خلاصه این بخش')
                  : (lang === 'en' ? 'Fact or Fiction?' : 'واقعیت یا افسانه؟')}
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Bar (not in DetailModal but useful here) */}
          {state !== 'summary' && (
            <div className="w-full h-1 bg-white/5 rounded-full mb-6 overflow-hidden">
              <motion.div 
                className="h-full bg-amber-500"
                initial={{ width: 0 }}
                animate={{ width: `${((currentIndex + 1) / Math.max(5, questions.length)) * 100}%` }}
              />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            {state === 'question' && currentQuestion && (
              <motion.div 
                key="question"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="p-6 liquid-glass rounded-2xl border border-white/5 text-center shadow-inner">
                  <p className="text-lg font-medium text-white leading-relaxed italic">
                    "{lang === 'en' ? currentQuestion.myth : currentQuestion.myth_fa}"
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {(['TRUE', 'FALSE', "IT'S COMPLICATED"] as const).map((ans) => (
                    <button
                      key={ans}
                      onClick={() => handleAnswer(ans)}
                      className="w-full py-4 px-6 liquid-glass border border-white/10 rounded-2xl text-sm font-bold text-slate-200 hover:text-white hover:bg-white/10 hover:border-amber-500/30 transition-all active:scale-[0.98]"
                    >
                      {lang === 'en' ? ans : (ans === 'TRUE' ? 'درست' : ans === 'FALSE' ? 'نادرست' : 'پیچیده است')}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {state === 'reveal' && currentQuestion && (
              <motion.div 
                key="reveal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-5"
              >
                <div className={`p-4 rounded-2xl border flex items-center gap-3 ${userAnswer === currentQuestion.answer ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                  {userAnswer === currentQuestion.answer ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  <span className="font-bold text-sm">
                    {userAnswer === currentQuestion.answer 
                      ? (lang === 'en' ? 'Correct!' : 'درست بود!')
                      : (lang === 'en' ? 'Not quite...' : 'نه کاملا...')}
                  </span>
                </div>

                <div className="p-5 liquid-glass rounded-2xl border border-white/5 space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-500">{lang === 'en' ? 'The Reality' : 'واقعیت ماجرا'}</h4>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {lang === 'en' ? currentQuestion.reality : currentQuestion.reality_fa}
                  </p>
                  <p className="text-sm text-amber-300 font-medium italic pt-2 border-t border-white/5">
                    {lang === 'en' ? currentQuestion.reveal_hook : currentQuestion.reveal_hook_fa}
                  </p>
                </div>

                {currentQuestion.sources.length > 0 && (
                  <div className="px-4 py-2 opacity-50">
                    <p className="text-[10px] text-slate-400 italic">
                      {lang === 'en' ? 'Sources: ' : 'منابع: '}{currentQuestion.sources.join(' · ')}
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {state === 'summary' && (
              <motion.div 
                key="summary"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-6"
              >
                <div className="py-8">
                  <div className="text-5xl font-bold text-white mb-2">{score}/5</div>
                  <p className="text-slate-400 text-sm">
                    {lang === 'en' ? 'Questions answered correctly' : 'سوال به درستی پاسخ داده شد'}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => handleShare('twitter')}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-white/5 border border-white/10 rounded-2xl text-sm font-bold text-white hover:bg-white/10 transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                    {lang === 'en' ? 'Share on X' : 'اشتراک‌گذاری در X'}
                  </button>
                  <button
                    onClick={() => handleShare('telegram')}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-white/5 border border-white/10 rounded-2xl text-sm font-bold text-white hover:bg-white/10 transition-all"
                  >
                    <Send className="w-4 h-4" />
                    {lang === 'en' ? 'Share on Telegram' : 'اشتراک‌گذاری در تلگرام'}
                  </button>
                </div>
              </motion.div>
            )}

            {state === 'loading' && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center p-8 mt-4 gap-6 min-h-[40vh]"
              >
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute inset-0 border-4 border-amber-500/10 rounded-full" />
                  <div className="absolute inset-0 border-4 border-amber-500 border-t-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s' }} />
                  <div className="absolute inset-1 border-4 border-rose-500/40 border-b-transparent border-r-transparent rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
                  <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
                </div>
                
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-bold text-white font-serif tracking-wide">
                    {lang === 'en' ? 'Unearthing History...' : 'در حال غبارروبی از تاریخ...'}
                  </h3>
                  <p className="text-sm text-amber-200/60 animate-pulse font-medium">
                    {lang === 'en' 
                      ? 'Consulting the royal archives for the next challenge' 
                      : 'در حال مشورت با آرشیوهای سلطنتی برای چالش بعدی'}
                  </p>
                </div>
              </motion.div>
            )}
          </div>


          {/* Action Buttons Footer */}
          {state === 'reveal' && currentQuestion && (
            <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  onJumpToYear(currentQuestion.era_link || year);
                  onClose();
                }}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-[11px] font-bold liquid-glass border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                {lang === 'en' ? 'See on Timeline' : 'مشاهده در تایم‌لاین'}
              </button>
              <button
                onClick={handleNext}
                disabled={isLoadingNext}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-all disabled:opacity-50"
              >
                {isLoadingNext ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                {lang === 'en' ? 'Next Challenge' : 'چالش بعدی'}
              </button>
            </div>
          )}

          {state === 'summary' && (
            <div className="mt-6 pt-6 border-t border-white/5">
              <button
                onClick={() => {
                  onClose();
                  if (onEndQuiz) onEndQuiz();
                }}
                className="w-full py-4 px-6 liquid-glass border border-amber-500/30 rounded-2xl text-sm font-bold text-amber-300 hover:text-white transition-all"
              >
                {lang === 'en' ? 'Explore the Map' : 'کاوش روی نقشه'}
              </button>
            </div>
          )}
          </>
          )}
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
};
