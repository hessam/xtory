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
  if (!question) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={hasApiKey ? onOpenQuiz : onOpenSettings}
        className="p-4 rounded-2xl border cursor-pointer transition-all border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-orange-500/10 hover:brightness-125 min-h-[44px] flex items-center mb-4 text-left rtl:text-right shrink-0 shadow-lg shadow-amber-900/10"
      >
        <div className="flex items-start gap-4 w-full">
          <div className="mt-0.5 p-2 bg-amber-500/20 rounded-full shadow-inner shrink-0 ring-1 ring-amber-500/30">
            {hasApiKey ? <Sparkles className="w-5 h-5 text-amber-300" /> : <Lock className="w-5 h-5 text-amber-300 opacity-80" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                {lang === 'en' ? 'AI History Challenge' : 'چالش تاریخ هوش مصنوعی'}
              </span>
            </div>
            <h4 className="font-bold text-white text-sm leading-tight line-clamp-2">
              {lang === 'en' 
                ? `Generate a unique historical challenge for ${formatYear(year!, 'en')}`
                : `تولید یک چالش تاریخی برای ${formatYear(year!, 'fa')}`}
            </h4>
            <p className="text-[11px] text-amber-200/60 mt-2 font-medium">
              {hasApiKey 
                ? (lang === 'en' ? 'Tap to generate quiz →' : 'برای تولید کوییز ضربه بزنید ←')
                : (lang === 'en' ? 'Requires Gemini API Key →' : 'نیاز به کلید API جمینای دارد ←')}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpenQuiz}
      className="p-4 rounded-2xl border cursor-pointer transition-all border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-orange-500/10 hover:brightness-125 min-h-[44px] flex items-center mb-4 text-left rtl:text-right shrink-0 shadow-lg shadow-amber-900/10"
    >
      <div className="flex items-start gap-4 w-full">
        <div className="mt-0.5 p-2 bg-amber-500/20 rounded-full shadow-inner shrink-0 ring-1 ring-amber-500/30">
          <HelpCircle className="w-5 h-5 text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
              {lang === 'en' ? 'Most people get this wrong' : 'بیشتر مردم در این مورد اشتباه می‌کنند'}
            </span>
            {question.is_ai_generated && <Sparkles className="w-3 h-3 text-amber-400 opacity-50" />}
          </div>
          <h4 className="font-bold text-white text-sm leading-tight line-clamp-2">
            "{lang === 'en' ? question.myth : question.myth_fa}"
          </h4>
          <p className="text-[11px] text-amber-200/60 mt-2 font-medium animate-pulse">
            {lang === 'en' ? 'What do you think? Tap to verify →' : 'شما چه فکر می‌کنید؟ برای بررسی ضربه بزنید ←'}
          </p>
        </div>
      </div>
    </motion.div>
  );
};
