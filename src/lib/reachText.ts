import { getDynasty, getReach } from '../data/registry';
import { formatYear, toPersianDigits } from '../utils/format';

type Lang = 'en' | 'fa';
const num = (n: number, lang: Lang) => (lang === 'fa' ? toPersianDigits(n) : String(n));
const nameOf = (id: string, lang: Lang) => getDynasty(id)?.name[lang] ?? id;

export const TOTAL_REGIONS = 12;

/** Human sentence for the reach lens, e.g. "Ghaznavid Empire held 5 of 12 regions in 1020 AD — alongside Buyids, Ziyarids +3." */
export function describeReach(dynastyId: string, year: number, lang: Lang): string {
  const reach = getReach(dynastyId, year);
  const name = nameOf(dynastyId, lang);
  const when = formatYear(year, lang);

  if (reach.regions.length === 0) {
    return lang === 'fa' ? `${name} در ${when} فعال نبود.` : `${name} was not active in ${when}.`;
  }

  const shown = reach.concurrentDynastyIds.slice(0, 3).map(id => nameOf(id, lang));
  const extra = reach.concurrentDynastyIds.length - shown.length;
  const others = shown.length
    ? (lang === 'fa'
        ? ` — هم‌زمان با ${shown.join('، ')}${extra > 0 ? ` و ${num(extra, lang)} دیگر` : ''}.`
        : ` — alongside ${shown.join(', ')}${extra > 0 ? ` +${extra}` : ''}.`)
    : '.';

  if (reach.coreRegionCount === 0) {
    return lang === 'fa'
      ? `${name} در ${when} بر سرزمین‌هایی بیرون از ${num(TOTAL_REGIONS, lang)} ناحیه نقشه حکم می‌راند${others}`
      : `${name} held lands outside the ${TOTAL_REGIONS} mapped regions in ${when}${others}`;
  }
  return lang === 'fa'
    ? `${name} در ${when} بر ${num(reach.coreRegionCount, lang)} از ${num(TOTAL_REGIONS, lang)} ناحیه حکم می‌راند${others}`
    : `${name} held ${reach.coreRegionCount} of ${TOTAL_REGIONS} regions in ${when}${others}`;
}

export function counterLabel(count: number, year: number, lang: Lang) {
  const when = formatYear(year, lang);
  return lang === 'fa'
    ? { big: num(count, lang), small: `سلسله هم‌زمان · ${when}` }
    : { big: String(count), small: `${count === 1 ? 'dynasty' : 'dynasties'} ruling · ${when}` };
}
