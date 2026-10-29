import React, { useEffect, useState } from 'react';
import { Trophy, X, Copy, Check, Trash2, LogOut, KeyRound } from 'lucide-react';
import { ERAS } from '../data/eras';
import { factById } from '../data/facts';
import { toPersianDigits } from '../utils/format';
import { autoSync, fetchBoard, fetchShowcase, join, ProfileError, recover, remove, setNickname, signOut, sync, useMe, type Row } from './store';

type Lang = 'en' | 'fa';
const T = {
  open: { en: 'Leaderboard', fa: 'جدول امتیازات' },
  title: { en: 'Explorer profile', fa: 'پروفایل کاوشگر' },
  intro: { en: 'Save your finds and join the leaderboard. No email, no phone, no location — just a secret recovery code.', fa: 'یافته‌هایتان را ذخیره کنید و به جدول امتیازات بپیوندید. بدون ایمیل، بدون شماره، بدون موقعیت مکانی — فقط یک کد بازیابی محرمانه.' },
  join: { en: 'Join anonymously', fa: 'پیوستن به‌صورت ناشناس' },
  points: { en: 'points', fa: 'امتیاز' },
  facts: { en: 'facts', fa: 'واقعیت' },
  nick: { en: 'Nickname (optional, public)', fa: 'نام مستعار (اختیاری، عمومی)' },
  save: { en: 'Save', fa: 'ذخیره' },
  code: { en: 'Recovery code — keep it private', fa: 'کد بازیابی — محرمانه نگه دارید' },
  show: { en: 'Show code', fa: 'نمایش کد' },
  hide: { en: 'Hide', fa: 'پنهان' },
  copy: { en: 'Copy', fa: 'کپی' },
  copied: { en: 'Copied', fa: 'کپی شد' },
  recoverTitle: { en: 'Already have a code?', fa: 'کد بازیابی دارید؟' },
  recoverGo: { en: 'Restore', fa: 'بازیابی' },
  all: { en: 'All time', fa: 'کل' },
  week: { en: 'This week', fa: 'این هفته' },
  empty: { en: 'Nobody here yet — be the first.', fa: 'هنوز کسی نیست — اولین نفر باشید.' },
  signOut: { en: 'Sign out of this device', fa: 'خروج از این دستگاه' },
  del: { en: 'Delete my data', fa: 'حذف اطلاعات من' },
  delSure: { en: 'This erases your profile, nickname and leaderboard rows from our server. Your finds stay on this device. Delete?', fa: 'پروفایل، نام مستعار و ردیف‌های شما از سرور پاک می‌شود. یافته‌های شما روی این دستگاه می‌ماند. حذف شود؟' },
  close: { en: 'Close', fa: 'بستن' },
  you: { en: 'you', fa: 'شما' },
  showcase: { en: 'Explorer', fa: 'کاوشگر' },
  hidden: { en: 'A fact found with AI Dig deeper', fa: 'واقعیتی که با کندوکاو هوش مصنوعی پیدا شد' },
  taken: { en: 'That nickname is taken.', fa: 'این نام قبلاً گرفته شده.' },
  bad: { en: 'Use 3–20 letters, digits, _ or -. Not reserved or rude.', fa: 'از ۳ تا ۲۰ حرف، رقم، _ یا - استفاده کنید؛ نام رزرو یا نامناسب نباشد.' },
  wait: { en: 'Please wait a minute before changing it again.', fa: 'لطفاً یک دقیقه صبر کنید.' },
  unknownCode: { en: 'No profile matches that code.', fa: 'پروفایلی با این کد پیدا نشد.' },
  fail: { en: 'Could not reach the server. Try again later.', fa: 'ارتباط با سرور برقرار نشد. بعداً دوباره تلاش کنید.' },
} as const;
const t = (k: keyof typeof T, l: Lang) => T[k][l];
const fa = (l: Lang) => (l === 'fa' ? 'font-vazirmatn' : '');
const num = (n: number, l: Lang) => (l === 'fa' ? toPersianDigits(n) : String(n));
const eraLabel = (id: string, l: Lang) => ERAS.find(e => e.id === id)?.label[l] ?? id;
const errText = (e: unknown, l: Lang) => {
  if (!(e instanceof ProfileError)) return t('fail', l);
  if (e.code === 'nickname_taken') return t('taken', l);
  if (e.code === 'invalid_nickname') return t('bad', l);
  if (e.code === 'unknown_code') return t('unknownCode', l);
  if (e.code === 'rate_limited') return t('wait', l);
  return t('fail', l);
};

/** Trophy button next to the Discover pill. */
export const ProfileButton: React.FC<{ lang: Lang; onClick: () => void }> = ({ lang, onClick }) => (
  <button type="button" onClick={onClick} data-testid="profile-btn" aria-label={t('open', lang)}
          className="liquid-glass-heavy border border-amber-300/40 rounded-2xl w-[44px] h-[44px] flex items-center justify-center shadow-xl active:scale-95 calm-transition">
    <Trophy className="w-4 h-4 text-amber-300" aria-hidden />
  </button>
);

/** Your profile + leaderboard; `#/u/<nickname>` opens the public showcase of that player instead. Keeps the server inventory in step. */
export const ProfileSheet: React.FC<{ lang: Lang; open: boolean; onClose: () => void }> = ({ lang, open, onClose }) => {
  const me = useMe();
  const [showcaseNick, setShowcaseNick] = useState<string | null>(null);
  useEffect(() => autoSync(), []);
  useEffect(() => {
    const read = () => { const m = /^#\/u\/(.+)$/.exec(window.location.hash); setShowcaseNick(m ? decodeURIComponent(m[1]) : null); };
    read(); window.addEventListener('hashchange', read); return () => window.removeEventListener('hashchange', read);
  }, []);
  if (!open && !showcaseNick) return null;
  const close = () => { onClose(); if (showcaseNick) window.location.hash = ''; };
  return (
    <div className="absolute z-[1002] start-3 end-3 top-[64px] flex justify-center pointer-events-none max-sm:end-14" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      <section data-testid="profile-panel" className="pointer-events-auto w-full max-w-md max-h-[70vh] max-sm:max-h-[44vh] overflow-y-auto liquid-glass-heavy border border-amber-300/30 rounded-3xl p-4 shadow-2xl">
        <div className="flex items-start gap-2">
          <h2 className={`flex-1 text-lg font-bold text-amber-200 ${fa(lang)}`}>{showcaseNick ? t('showcase', lang) : t('title', lang)}</h2>
          <button type="button" onClick={close} aria-label={t('close', lang)} data-testid="profile-close" className="w-9 h-9 -m-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        {showcaseNick ? <Showcase nick={showcaseNick} lang={lang} /> : <Mine lang={lang} me={me} />}
      </section>
    </div>
  );
};

const Showcase: React.FC<{ nick: string; lang: Lang }> = ({ nick, lang }) => {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchShowcase>> | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { fetchShowcase(nick).then(setData).catch(() => setErr(true)); }, [nick]);
  if (err) return <p className={`mt-2 text-sm text-slate-400 ${fa(lang)}`}>{t('fail', lang)}</p>;
  if (!data) return null;
  return (
    <div data-testid="showcase">
      <p className="mt-1 text-xl font-bold text-slate-100" dir="auto">{data.nickname}</p>
      <p className={`text-xs text-slate-400 ${fa(lang)}`}>{num(data.points, lang)} {t('points', lang)} · {num(data.count, lang)} {t('facts', lang)}</p>
      <ul className="mt-3 space-y-1.5">
        {data.facts.map(id => (
          <li key={id} className={`text-sm text-slate-200 leading-snug ${fa(lang)}`}>✦ {factById(id)?.hook[lang] ?? t('hidden', lang)}</li>
        ))}
      </ul>
    </div>
  );
};

const Mine: React.FC<{ lang: Lang; me: ReturnType<typeof useMe> }> = ({ lang, me }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [nick, setNick] = useState('');
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');
  const [board, setBoard] = useState('all');
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { setNick(me?.nickname ?? ''); }, [me?.nickname]);
  useEffect(() => { setRows(null); fetchBoard(board).then(setRows).catch(() => setRows([])); }, [board, me?.points]);
  useEffect(() => { if (me) sync().catch(() => {}); }, [me?.profileId]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(errText(e, lang)); } finally { setBusy(false); } };
  const btn = `min-h-[44px] px-3 rounded-xl text-xs font-semibold active:scale-95 disabled:opacity-60 ${fa(lang)}`;

  return (
    <div>
      {!me ? (
        <>
          <p className={`mt-2 text-sm text-slate-300 leading-relaxed ${fa(lang)}`}>{t('intro', lang)}</p>
          <button type="button" disabled={busy} onClick={() => run(join)} data-testid="profile-join" className={`mt-3 ${btn} bg-amber-400 text-slate-900`}>{t('join', lang)}</button>
          <p className={`mt-4 text-xs text-slate-400 ${fa(lang)}`}>{t('recoverTitle', lang)}</p>
          <div className="mt-1 flex gap-2">
            <input value={code} onChange={e => setCode(e.target.value)} dir="ltr" placeholder="word-word-word-…" data-testid="profile-code-input" className="flex-1 min-w-0 min-h-[44px] rounded-xl bg-white/5 border border-white/15 px-3 text-xs text-slate-100" />
            <button type="button" disabled={busy || !code.trim()} onClick={() => run(() => recover(code))} className={`${btn} liquid-glass border border-white/15 text-slate-100`}>{t('recoverGo', lang)}</button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-xl font-bold text-slate-100" dir="auto" data-testid="profile-name">{me.name}</p>
          <p className={`text-xs text-slate-400 ${fa(lang)}`} data-testid="profile-points">{num(me.points, lang)} {t('points', lang)} · {num(me.count, lang)} {t('facts', lang)}</p>

          <label className={`mt-3 block text-[11px] text-slate-400 ${fa(lang)}`}>{t('nick', lang)}</label>
          <div className="mt-1 flex gap-2">
            <input value={nick} onChange={e => setNick(e.target.value)} maxLength={20} dir="auto" data-testid="profile-nick-input" className="flex-1 min-w-0 min-h-[44px] rounded-xl bg-white/5 border border-white/15 px-3 text-sm text-slate-100" />
            <button type="button" disabled={busy || nick.trim() === (me.nickname ?? '')} onClick={() => run(() => setNickname(nick.trim() || null))} data-testid="profile-nick-save" className={`${btn} bg-amber-400 text-slate-900`}>{t('save', lang)}</button>
          </div>
          {me.nickname && <a href={`#/u/${encodeURIComponent(me.nickname)}`} className="mt-1 inline-block text-[11px] text-amber-300 underline" dir="ltr">/u/{me.nickname}</a>}

          <p className={`mt-3 text-[11px] text-slate-400 flex items-center gap-1 ${fa(lang)}`}><KeyRound className="w-3 h-3" aria-hidden />{t('code', lang)}</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 min-w-0 break-words text-xs text-amber-200 bg-black/30 rounded-lg px-2 py-2" dir="ltr" data-testid="profile-secret">{reveal ? me.secret : '•••• •••• •••• ••••'}</code>
            <button type="button" onClick={() => setReveal(r => !r)} className={`${btn} text-slate-300`}>{reveal ? t('hide', lang) : t('show', lang)}</button>
            <button type="button" aria-label={t('copy', lang)} onClick={async () => { try { await navigator.clipboard.writeText(me.secret); setCopied(true); } catch { setReveal(true); } }} className={`${btn} text-slate-300`}>{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</button>
          </div>
        </>
      )}
      {err && <p className={`mt-2 text-xs text-rose-300 ${fa(lang)}`} role="alert" data-testid="profile-error">{err}</p>}

      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist">
        {[['all', t('all', lang)], ['week', t('week', lang)], ...ERAS.map(e => [e.id, eraLabel(e.id, lang)])].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={board === id} onClick={() => setBoard(id)}
                  className={`min-h-[36px] px-2.5 rounded-lg text-[11px] ${fa(lang)} ${board === id ? 'bg-amber-400 text-slate-900 font-semibold' : 'liquid-glass border border-white/10 text-slate-300'}`}>{label}</button>
        ))}
      </div>
      <ol className="mt-2 space-y-1" data-testid="leaderboard">
        {rows?.length === 0 && <li className={`text-xs text-slate-400 ${fa(lang)}`}>{t('empty', lang)}</li>}
        {rows?.map(r => (
          <li key={r.rank} className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1 ${me && r.name === me.name ? 'bg-amber-400/15' : ''}`}>
            <span className="w-6 text-slate-500 tabular-nums text-xs">{num(r.rank, lang)}</span>
            {r.named ? <a href={`#/u/${encodeURIComponent(r.name)}`} className="flex-1 truncate text-slate-100 hover:underline" dir="auto">{r.name}</a> : <span className="flex-1 truncate text-slate-300" dir="auto">{r.name}</span>}
            <span className="tabular-nums text-amber-200 text-xs">{num(r.points, lang)}</span>
          </li>
        ))}
      </ol>

      {me && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={signOut} className={`${btn} text-slate-400 hover:text-white flex items-center gap-1.5`}><LogOut className="w-3.5 h-3.5" />{t('signOut', lang)}</button>
          <button type="button" disabled={busy} data-testid="profile-delete" onClick={() => { if (window.confirm(t('delSure', lang))) run(remove); }} className={`${btn} text-rose-300 hover:text-rose-200 flex items-center gap-1.5`}><Trash2 className="w-3.5 h-3.5" />{t('del', lang)}</button>
        </div>
      )}
    </div>
  );
};
