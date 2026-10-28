import { describe, it, expect } from 'vitest';
import { formatYear, formatDuration, formatRange, toPersianDigits } from './format';

describe('format', () => {
  it('formats years per language with era labels', () => {
    expect(formatYear(-550, 'en')).toBe('550 BC');
    expect(formatYear(651, 'en')).toBe('651 AD');
    expect(formatYear(-550, 'fa')).toBe('۵۵۰ ق.م');
    expect(formatYear(651, 'fa')).toBe('۶۵۱ م');
  });
  it('uses Persian digits only in fa', () => {
    expect(toPersianDigits(1979)).toBe('۱۹۷۹');
    expect(formatDuration(27, 'fa')).toBe('۲۷ سال');
    expect(formatDuration(27, 'en')).toBe('27 yrs');
  });
  it('formats ranges', () => {
    expect(formatRange(-550, -330, 'en')).toBe('550 BC – 330 BC');
    expect(formatRange(1979, null, 'en')).toBe('1979 AD');
  });
});
