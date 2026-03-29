import React, { useState } from 'react';
import { Vazir } from '../data/vazirs';

interface Props {
  vazirs: Vazir[];           // 1 = single dot; 2+ = cluster
  x: number;                 // pixel x position on the map container
  y: number;                 // pixel y position on the map container
  lang: 'en' | 'fa';
  onClick: (vazir: Vazir) => void;
}

export const VazirDot: React.FC<Props> = ({ vazirs, x, y, lang, onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isCluster = vazirs.length > 1;
  const primary = vazirs[0];

  return (
    <div
      className="absolute"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)', zIndex: 10 }}
    >
      {/* The Dot */}
      <button
        className={`
          relative flex items-center justify-center
          rounded-full border-2 border-amber-400/80
          bg-amber-500/20 hover:bg-amber-500/40
          calm-transition cursor-pointer
          ${isCluster ? 'w-7 h-7' : 'w-4 h-4'}
        `}
        onClick={() => onClick(primary)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={primary.name[lang]}
      >
        {/* Pulse ring */}
        <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />

        {/* Cluster count badge */}
        {isCluster && (
          <span className="relative z-10 text-amber-300 text-[10px] font-bold">
            {vazirs.length}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && !isCluster && (
        <div
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2
                     liquid-glass border border-white/10 rounded-xl px-3 py-2
                     text-xs whitespace-nowrap pointer-events-none z-50"
          dir={lang === 'fa' ? 'rtl' : 'ltr'}
        >
          <p className="font-bold text-amber-300">{primary.name[lang]}</p>
          <p className="text-slate-400">{primary.rulerName[lang]}</p>
          <p className="text-slate-500 max-w-[180px] truncate">{primary.contribution[lang]}</p>
        </div>
      )}
    </div>
  );
};
