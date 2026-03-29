import React from 'react';
import { motion } from 'motion/react';
import { HelpCircle, Sparkles, Lock } from 'lucide-react';
import { QuizQuestion } from '../types/quiz';
import { formatYear } from '../utils/format';

interface MythCardProps {
  question?: QuizQuestion;
  lang: 'en' | 'fa';
  year?: number;
  hasApiKey?: boolean;
  onOpenQuiz: () => void;
  onOpenSettings?: () => void;
}

export const MythCard: React.FC<MythCardProps> = ({ question, lang, year, hasApiKey, onOpenQuiz, onOpenSettings }) => {
  /* ── Shared outer shell: subdued, footnote-weight ── */
  const shellClass = `
    mt-1 p-3 rounded-xl border cursor-pointer transition-all
    border-amber-500/15 bg-amber-500/5
    hover:bg-amber-500/10 hover:border-amber-500/25
    text-left rtl:text-right shrink-0
  `;

  /* ── "Generate quiz" state (no question yet) ── */
  if (!question) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.98 }}
        onClick={hasApiKey ? onOpenQuiz : onOpenSettings}
        className={shellClass}
      >
        <div className="flex items-center gap-3 w-full">
          <div className="p-1.5 bg-amber-500/10 rounded-lg shrink-0">
            {hasApiKey
              ? <Sparkles className="w-3.5 h-3.5 text-amber-400/70" />
              : <Lock className="w-3.5 h-3.5 text-amber-400/50" />}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/60">
              {lang === 'en' ? 'History Challenge' : 'چالش تاریخ'}
            </span>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
              {hasApiKey
                ? (lang === 'en'
                    ? `Generate a quiz for ${formatYear(year!, 'en')} →`
                    : `تولید کوییز برای ${formatYear(year!, 'fa')} ←`)
                : (lang === 'en' ? 'Add API key to unlock →' : 'برای فعال‌سازی کلید API اضافه کنید ←')}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  /* ── Question available ── */
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpenQuiz}
      className={shellClass}
    >
      <div className="flex items-start gap-3 w-full">
        <div className="mt-0.5 p-1.5 bg-amber-500/10 rounded-lg shrink-0">
          <HelpCircle className="w-3.5 h-3.5 text-amber-400/70" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/60">
              {lang === 'en' ? 'Most people get this wrong' : 'بیشتر مردم اشتباه می‌کنند'}
            </span>
            {question.is_ai_generated && <Sparkles className="w-2.5 h-2.5 text-amber-400/40" />}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed line-clamp-2 italic">
            "{lang === 'en' ? question.myth : question.myth_fa}"
          </p>
          <p className="text-[10px] text-slate-500 mt-1.5">
            {lang === 'en' ? 'Tap to verify →' : 'برای بررسی ضربه بزنید ←'}
          </p>
        </div>
      </div>
    </motion.div>
  );
};
