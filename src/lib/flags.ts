/**
 * Feature flags. A flag is on when, in priority order:
 *   1. the URL has ?ff=name (comma-separated list, "-name" forces off)
 *   2. localStorage "xtory_ff" contains it (comma-separated)
 *   3. VITE_FF_<NAME> is "1" at build time
 * Every new slice ships dark behind a flag (see docs/plans/GAME_ATLAS_PLAN.md).
 */
export type FlagName =
  | 'fragmentation'
  | 'board'
  | 'board_spike'
  | 'server_ai'
  | 'facts'
  | 'discovery'
  | 'leaderboard'
  | 'share'
  | 'meanwhile'
  | 'journey'
  | 'games';

export function parseFlagList(raw: string | null | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map(s => s.trim()).filter(Boolean));
}

export function isFlagOn(
  name: FlagName,
  opts: { search?: string; stored?: string | null; envValue?: string } = {}
): boolean {
  const search = opts.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  // ?ff=board,server_ai  and  ?ff=board&ff=server_ai  both work
  const fromUrl = parseFlagList(new URLSearchParams(search).getAll('ff').join(','));
  if (fromUrl.has(`-${name}`)) return false;
  if (fromUrl.has(name)) return true;

  let stored = opts.stored;
  if (stored === undefined && typeof window !== 'undefined') {
    try { stored = localStorage.getItem('xtory_ff'); } catch { stored = null; }
  }
  if (parseFlagList(stored).has(name)) return true;

  const envValue = opts.envValue ?? (import.meta.env?.[`VITE_FF_${name.toUpperCase()}`] as string | undefined);
  return envValue === '1';
}
