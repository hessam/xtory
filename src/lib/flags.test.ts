import { describe, it, expect } from 'vitest';
import { isFlagOn } from './flags';

describe('isFlagOn', () => {
  it('is off by default', () => {
    expect(isFlagOn('board', { search: '', stored: null, envValue: undefined })).toBe(false);
  });
  it('turns on from the URL', () => {
    expect(isFlagOn('board', { search: '?ff=journey,board', stored: null })).toBe(true);
  });
  it('accepts repeated ff parameters as well as comma lists', () => {
    expect(isFlagOn('server_ai', { search: '?ff=board&ff=server_ai', stored: null })).toBe(true);
    expect(isFlagOn('board', { search: '?ff=board&ff=server_ai', stored: null })).toBe(true);
    expect(isFlagOn('facts', { search: '?ff=board&ff=server_ai', stored: null })).toBe(false);
  });
  it('turns on from storage and env', () => {
    expect(isFlagOn('facts', { search: '', stored: 'facts' })).toBe(true);
    expect(isFlagOn('facts', { search: '', stored: null, envValue: '1' })).toBe(true);
  });
  it('URL can force a flag off', () => {
    expect(isFlagOn('board', { search: '?ff=-board', stored: 'board', envValue: '1' })).toBe(false);
  });
});
