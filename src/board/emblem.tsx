import React from 'react';
import { tint } from './model';

const SHAPES = ['shield', 'pennant', 'round', 'diamond'] as const;
const PATTERNS = ['stripe', 'chevron', 'cross', 'dots', 'bend', 'plain'] as const;

const PATHS: Record<(typeof SHAPES)[number], string> = {
  shield: 'M-0.8 -0.9H0.8V0.1Q0.8 0.8 0 1Q-0.8 0.8 -0.8 0.1Z',
  pennant: 'M-0.7 -0.9H0.7V0.7L0 1L-0.7 0.7Z',
  round: 'M0 -0.95A0.95 0.95 0 1 1 0 0.95A0.95 0.95 0 1 1 0 -0.95Z',
  diamond: 'M0 -1L0.9 0L0 1L-0.9 0Z',
};

/** Deterministic procedural emblem: same dynasty → same banner everywhere. */
export function emblemOf(seed: number) {
  return { shape: SHAPES[seed % SHAPES.length], pattern: PATTERNS[Math.floor(seed / 7) % PATTERNS.length] };
}

/** Clip paths for the four shapes; render once inside an <svg><defs>. */
export const EmblemDefs = () => (
  <>{SHAPES.map(s => <clipPath key={s} id={`emb-${s}`}><path d={PATHS[s]} /></clipPath>)}</>
);

export const Emblem: React.FC<{ x: number; y: number; size: number; color: string; seed: number; active?: boolean; dyn: string }> = ({ x, y, size, color, seed, active, dyn }) => {
  const { shape, pattern } = emblemOf(seed);
  const light = tint(color, 0.7);
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`} data-kind="emblem" data-dyn={dyn} style={{ cursor: 'pointer' }}>
      <circle r={1.7} fill="transparent" /> {/* generous hit target */}
      <path d={PATHS[shape]} fill={color} stroke={active ? '#ffffff' : '#05080f'} strokeWidth={active ? 0.22 : 0.14} />
      <g clipPath={`url(#emb-${shape})`} fill={light} fillOpacity={0.9} pointerEvents="none">
        {pattern === 'stripe' && <rect x={-0.2} y={-1} width={0.4} height={2} />}
        {pattern === 'chevron' && <path d="M-1 -0.1L0 0.6L1 -0.1V0.2L0 0.9L-1 0.2Z" />}
        {pattern === 'cross' && <path d="M-0.15 -1H0.15V-0.15H1V0.15H0.15V1H-0.15V0.15H-1V-0.15H-0.15Z" />}
        {pattern === 'dots' && <><circle cx={-0.4} cy={-0.3} r={0.18} /><circle cx={0.4} cy={-0.3} r={0.18} /><circle cx={0} cy={0.35} r={0.18} /></>}
        {pattern === 'bend' && <path d="M-1 -0.6L-0.6 -1L1 0.6L0.6 1Z" />}
      </g>
    </g>
  );
};
