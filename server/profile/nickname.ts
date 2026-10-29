/**
 * Nickname rules (optional, public on the leaderboard): 3–20 letters/digits/_/-, not reserved, not rude (fa + en), unique.
 * The profanity list is a deliberately small starter set: extend it by editing BANNED (substring match for entries of
 * 4+ characters, exact match for shorter ones, after the normalisation below so "p@ssw0rd" style spellings are caught).
 */
const RESERVED = ['admin', 'administrator', 'xtory', 'mod', 'moderator', 'support', 'staff', 'official', 'system', 'root', 'null', 'undefined', 'anonymous', 'deleted', 'explorer', 'api', 'www', 'owner', 'ادمین', 'مدیر', 'پشتیبانی', 'مدیریت', 'کاربر'];
const BANNED = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'rape', 'nazi', 'whore', 'slut', 'dick', 'cock', 'pussy', 'asshole', 'porn',
  'کیر', 'کون', 'کص', 'جنده', 'کسکش', 'کسخل', 'گاییدم', 'گایید', 'مادرجنده', 'حرومزاده', 'پفیوز', 'دیوث', 'ممه',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

/** Canonical form used for uniqueness and for the word lists. */
export function nickKey(s: string): string {
  return s.normalize('NFKC').toLowerCase()
    .replace(/[ً-ٰٟ‌‍]/g, '')           // harakat, ZWNJ, ZWJ
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')                       // Arabic yeh/kaf → Persian
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[_-]/g, '');
}
const lettersOnly = (s: string) => nickKey(s).replace(/[013457@$]/g, c => LEET[c]).replace(/[^\p{L}]/gu, '');

export type NickProblem = 'length' | 'charset' | 'reserved' | 'rude';
export function checkNickname(raw: unknown): { ok: true; nickname: string; key: string } | { ok: false; problem: NickProblem } {
  if (typeof raw !== 'string') return { ok: false, problem: 'charset' };
  const nickname = raw.trim();
  const len = [...nickname].length;
  if (len < 3 || len > 20) return { ok: false, problem: 'length' };
  if (!/^[\p{L}\p{N}_-]+$/u.test(nickname) || !/\p{L}/u.test(nickname)) return { ok: false, problem: 'charset' };
  const key = nickKey(nickname), letters = lettersOnly(nickname);
  if (RESERVED.some(r => letters === r || letters.startsWith(r) && /explorer|admin|xtory|moderator/.test(r))) return { ok: false, problem: 'reserved' };
  if (BANNED.some(b => (b.length >= 4 ? letters.includes(b) : letters === b))) return { ok: false, problem: 'rude' };
  return { ok: true, nickname, key };
}

/** "Explorer #4821": the default public name, derived from the random profile id (`p_<hex>`), never from anything personal. */
export const defaultName = (profileId: string) => `Explorer #${String((parseInt(profileId.slice(2, 10), 16) || 0) % 10000).padStart(4, '0')}`;
