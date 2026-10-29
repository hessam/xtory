import React, { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Lock, Star, X } from 'lucide-react';
import { chapters, hashFor, parseHash, type Chapter, type Step } from './data';
import { isUnlocked, recordStars, starsFor, useStars } from './progress';
import { formatYear, toPersianDigits } from '../utils/format';

type Lang = 'en' | 'fa';
const T = {
  btn: { en: 'Journey', fa: 'سفر تاریخی' },
  path: { en: 'Journey', fa: 'سفر تاریخی' },
  start: { en: 'Start', fa: 'شروع' },
  resume: { en: 'Continue', fa: 'ادامه' },
  locked: { en: 'Finish the chapter before this one', fa: 'ابتدا فصل قبلی را تمام کنید' },
  next: { en: 'Next', fa: 'بعدی' },
  back: { en: 'Back', fa: 'قبلی' },
  quizBtn: { en: 'Myth or reality?', fa: 'افسانه یا واقعیت؟' },
  myth: { en: 'Myth', fa: 'افسانه' },
  real: { en: 'Reality', fa: 'واقعیت' },
  score: { en: 'You got', fa: 'درست پاسخ دادید:' },
  ofThree: { en: 'of 3', fa: 'از ۳' },
  again: { en: 'Replay the chapter', fa: 'تکرار فصل' },
  nextChapter: { en: 'Next chapter', fa: 'فصل بعدی' },
  allDone: { en: 'You have reached the end of the journey for now.', fa: 'تا اینجا به پایان سفر رسیدید.' },
  atlas: { en: 'Back to the atlas', fa: 'بازگشت به اطلس' },
  close: { en: 'Close', fa: 'بستن' },
  source: { en: 'Sources', fa: 'منابع' },
  draft: { en: 'Drafted with AI, not yet reviewed by a historian.', fa: 'با کمک هوش مصنوعی تهیه شده، هنوز توسط مورخ بازبینی نشده.' },
} as const;
const t = (k: keyof typeof T, l: Lang) => T[k][l];
const fa = (l: Lang) => (l === 'fa' ? 'font-vazirmatn' : '');
const num = (n: number, l: Lang) => (l === 'fa' ? toPersianDigits(n) : String(n));
const ARROW_BACK = (l: Lang) => (l === 'fa' ? ChevronRight : ChevronLeft);
const ARROW_NEXT = (l: Lang) => (l === 'fa' ? ChevronLeft : ChevronRight);

/** Journey button + sheet. The route lives in the hash (#/journey/<eraId>/<beat|quiz>) so a beat can be shared as a link. */
export const JourneyLayer: React.FC<{ lang: Lang; setYear: (y: number) => void }> = ({ lang, setYear }) => {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const read = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const stars = useStars();
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  const visible = open || !!route;

  const go = (eraId: string | null, step: Step) => { window.location.hash = eraId ? hashFor(eraId, step) : ''; if (!eraId) setRoute(null); };
  const leave = () => { setOpen(false); window.location.hash = ''; setRoute(null); };

  // moving to a beat moves the timeline there, so the map shows what the story is talking about
  useEffect(() => {
    if (route && route.step.kind === 'beat') setYear(route.chapter.beats[route.step.index].year);
  }, [route, setYear]);

  return (
    <>
      <button type="button" onClick={() => { if (route) { window.location.hash = ''; setRoute(null); } setOpen(o => !o || !!route); }} data-testid="journey-btn"
              className={`absolute z-[1000] pointer-events-auto start-3 top-[116px] liquid-glass-heavy border border-emerald-300/40 rounded-2xl px-3 min-h-[44px] flex items-center gap-1.5 text-xs text-slate-100 shadow-xl active:scale-95 calm-transition ${fa(lang)}`} dir={dir}>
        <BookOpen className="w-4 h-4 text-emerald-300" aria-hidden />{t('btn', lang)}
      </button>
      {visible && (
        <div className="absolute z-[1002] start-3 end-3 top-[160px] max-sm:end-14 flex justify-center pointer-events-none" dir={dir}>
          <section data-testid="journey-panel" className="pointer-events-auto w-full max-w-md max-h-[60vh] max-sm:max-h-[46vh] overflow-y-auto liquid-glass-heavy border border-emerald-300/30 rounded-3xl p-4 shadow-2xl">
            <div className="flex items-start gap-2">
              <h2 className={`flex-1 text-base font-bold text-emerald-200 ${fa(lang)}`}>{route ? route.chapter.title[lang] : t('path', lang)}</h2>
              <button type="button" onClick={leave} aria-label={t('close', lang)} data-testid="journey-close" className="w-9 h-9 -m-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            {!route && <Path lang={lang} stars={stars} onStart={eraId => go(eraId, { kind: 'beat', index: 0 })} />}
            {route && route.step.kind === 'beat' && <Beat lang={lang} chapter={route.chapter} index={route.step.index} go={go} atlas={leave} />}
            {route && route.step.kind === 'quiz' && <Quiz lang={lang} chapter={route.chapter} go={go} />}
          </section>
        </div>
      )}
    </>
  );
};

const Path: React.FC<{ lang: Lang; stars: Record<string, number>; onStart: (eraId: string) => void }> = ({ lang, stars, onStart }) => (
  <ol className="mt-2 space-y-1.5" data-testid="journey-path">
    {chapters.map((c, i) => {
      const unlocked = isUnlocked(i, stars), got = stars[c.eraId] ?? 0;
      return (
        <li key={c.eraId}>
          <button type="button" disabled={!unlocked} onClick={() => onStart(c.eraId)} data-testid={`journey-chapter-${c.eraId}`} aria-label={unlocked ? c.name[lang] : t('locked', lang)}
                  className={`w-full min-h-[48px] flex items-center gap-2 rounded-xl px-3 py-2 text-start ${unlocked ? 'liquid-glass border border-white/15 active:scale-[0.99]' : 'opacity-50 border border-white/5'}`}>
            <span className={`w-7 h-7 shrink-0 rounded-full text-xs flex items-center justify-center font-bold ${got ? 'bg-emerald-400 text-slate-900' : 'bg-white/10 text-slate-300'}`}>{num(i + 1, lang)}</span>
            <span className={`flex-1 min-w-0 ${fa(lang)}`}>
              <span className="block text-sm text-slate-100 truncate">{c.name[lang]}</span>
              <span className="block text-[10px] text-slate-400 tabular-nums">{formatYear(c.yearRange.start, lang)} – {formatYear(c.yearRange.end, lang)}</span>
            </span>
            {unlocked
              ? <span className="flex gap-0.5 shrink-0" aria-label={`${got}/3`}>{[1, 2, 3].map(s => <Star key={s} className={`w-3.5 h-3.5 ${s <= got ? 'fill-amber-300 text-amber-300' : 'text-slate-600'}`} />)}</span>
              : <Lock className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />}
          </button>
        </li>
      );
    })}
  </ol>
);

const Beat: React.FC<{ lang: Lang; chapter: Chapter; index: number; go: (eraId: string, s: Step) => void; atlas: () => void }> = ({ lang, chapter, index, go, atlas }) => {
  const beat = chapter.beats[index], last = index === chapter.beats.length - 1, Back = ARROW_BACK(lang), Next = ARROW_NEXT(lang);
  return (
    <div data-testid="journey-beat">
      <div className="mt-2 flex gap-1" aria-label={`${index + 1} / ${chapter.beats.length}`}>
        {chapter.beats.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-emerald-400' : 'bg-white/10'}`} />)}
      </div>
      <p className={`mt-3 text-[11px] text-emerald-300 tabular-nums ${fa(lang)}`}>{formatYear(beat.year, lang)}</p>
      <p className={`mt-1 text-base leading-relaxed text-slate-100 ${fa(lang)}`} data-testid="journey-text">{beat.text[lang]}</p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => index > 0 ? go(chapter.eraId, { kind: 'beat', index: index - 1 }) : atlas()}
                className={`min-h-[44px] px-3 rounded-xl text-xs liquid-glass border border-white/15 text-slate-200 flex items-center gap-1 ${fa(lang)}`}>
          <Back className="w-3.5 h-3.5" />{index > 0 ? t('back', lang) : t('atlas', lang)}
        </button>
        <button type="button" data-testid="journey-next" onClick={() => last ? go(chapter.eraId, { kind: 'quiz' }) : go(chapter.eraId, { kind: 'beat', index: index + 1 })}
                className={`flex-1 min-h-[44px] px-3 rounded-xl text-xs font-semibold bg-emerald-400 text-slate-900 flex items-center justify-center gap-1 ${fa(lang)}`}>
          {last ? t('quizBtn', lang) : t('next', lang)}<Next className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className={`mt-3 text-[10px] text-slate-500 ${fa(lang)}`}>📚 {chapter.sources.join(' · ')}</p>
      <p className={`mt-1 text-[10px] text-amber-400/80 ${fa(lang)}`}>✦ {t('draft', lang)}</p>
    </div>
  );
};

const Quiz: React.FC<{ lang: Lang; chapter: Chapter; go: (eraId: string, s: Step) => void }> = ({ lang, chapter, go }) => {
  const [answers, setAnswers] = useState<(boolean | null)[]>(() => chapter.quiz.map(() => null));
  const [done, setDone] = useState(false);
  const idx = answers.findIndex(a => a === null);
  const correct = chapter.quiz.filter((q, i) => answers[i] === q.reality).length;
  const nextIndex = chapters.findIndex(c => c.eraId === chapter.eraId) + 1;
  const nextChapter = chapters[nextIndex];
  const answer = (guessReality: boolean) => {
    const next = [...answers]; next[idx] = guessReality; setAnswers(next);
    if (next.every(a => a !== null)) {
      const c = chapter.quiz.filter((q, i) => next[i] === q.reality).length;
      recordStars(chapter.eraId, starsFor(c)); setDone(true);
    }
  };
  const restart = () => { setAnswers(chapter.quiz.map(() => null)); setDone(false); go(chapter.eraId, { kind: 'beat', index: 0 }); };

  return (
    <div data-testid="journey-quiz">
      {!done && idx >= 0 && (
        <>
          <p className={`mt-2 text-[11px] text-slate-400 ${fa(lang)}`}>{num(idx + 1, lang)} / {num(chapter.quiz.length, lang)}</p>
          <p className={`mt-1 text-base text-slate-100 leading-relaxed ${fa(lang)}`} data-testid="journey-statement">{chapter.quiz[idx].statement[lang]}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => answer(false)} data-testid="quiz-myth" className={`flex-1 min-h-[48px] rounded-xl text-sm liquid-glass border border-rose-300/30 text-rose-200 ${fa(lang)}`}>{t('myth', lang)}</button>
            <button type="button" onClick={() => answer(true)} data-testid="quiz-real" className={`flex-1 min-h-[48px] rounded-xl text-sm liquid-glass border border-emerald-300/30 text-emerald-200 ${fa(lang)}`}>{t('real', lang)}</button>
          </div>
        </>
      )}
      {!done && idx > 0 && (
        <p className={`mt-3 text-xs text-slate-300 leading-relaxed ${fa(lang)}`} data-testid="journey-why">{chapter.quiz[idx - 1].why[lang]}</p>
      )}
      {done && (
        <div data-testid="journey-result">
          <p className={`mt-2 text-sm text-slate-300 ${fa(lang)}`}>{t('score', lang)} <b className="text-amber-200">{num(correct, lang)}</b> {t('ofThree', lang)}</p>
          <div className="mt-2 flex gap-1">{[1, 2, 3].map(s => <Star key={s} className={`w-6 h-6 ${s <= starsFor(correct) ? 'fill-amber-300 text-amber-300' : 'text-slate-600'}`} />)}</div>
          <ul className={`mt-3 space-y-2 text-xs text-slate-300 ${fa(lang)}`}>
            {chapter.quiz.map((q, i) => <li key={i}>{answers[i] === q.reality ? '✓' : '✗'} {q.why[lang]}</li>)}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={restart} className={`min-h-[44px] px-3 rounded-xl text-xs liquid-glass border border-white/15 text-slate-200 ${fa(lang)}`}>{t('again', lang)}</button>
            {nextChapter
              ? <button type="button" onClick={() => { setDone(false); setAnswers(chapter.quiz.map(() => null)); go(nextChapter.eraId, { kind: 'beat', index: 0 }); }} data-testid="journey-next-chapter" className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold bg-emerald-400 text-slate-900 ${fa(lang)}`}>{t('nextChapter', lang)}</button>
              : <p className={`text-xs text-slate-400 ${fa(lang)}`}>{t('allDone', lang)}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
