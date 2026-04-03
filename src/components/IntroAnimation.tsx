// src/components/IntroAnimation.tsx
// Cinematic entrance — Arkham-tier atmospheric intro with GPU-accelerated rendering

import { useEffect, useRef, useState, useCallback } from 'react';
import { createIntroAudio } from '../services/introAudio';

interface Props {
  onComplete: (autoRunTour: boolean) => void;
  lang: 'en' | 'fa';
}

// ─── Easing Functions ────────────────────────────────────────────────────────

// Arkham-style: very slow start, explosive middle, graceful settle
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

// ─── Particle System (Canvas-based, zero DOM) ────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
  decay: number;
}

function initParticles(count: number, W: number, H: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -Math.random() * 0.25 - 0.05,
      size: Math.random() * 1.5 + 0.3,
      alpha: Math.random() * 0.4 + 0.05,
      decay: 0.9985 + Math.random() * 0.001,
    });
  }
  return particles;
}

function tickParticles(particles: Particle[], ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.clearRect(0, 0, W, H);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.alpha *= p.decay;
    if (p.y < -10 || p.alpha < 0.01) {
      p.x = Math.random() * W;
      p.y = H + 10;
      p.alpha = Math.random() * 0.3 + 0.05;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(201,169,110,${p.alpha})`;
    ctx.fill();
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IntroAnimation({ onComplete, lang }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const pathRef      = useRef<SVGPathElement>(null);
  const glowPathRef  = useRef<SVGPathElement>(null);
  const overlayRef   = useRef<HTMLDivElement>(null);
  const labelRef     = useRef<HTMLDivElement>(null);
  const subLabelRef  = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef<number>(0);
  const audioRef     = useRef<ReturnType<typeof createIntroAudio>>(null);
  const particlesRef = useRef<Particle[]>([]);

  const [phase, setPhase] = useState<'black' | 'draw' | 'morph' | 'title' | 'dissolve' | 'done'>('black');
  const [titleVisible, setTitleVisible] = useState(false);
  const [dedicationVisible, setDedicationVisible] = useState(false);
  const [skipVisible, setSkipVisible] = useState(false);

  const complete = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.stop();
    localStorage.setItem('atlas_intro_seen', '1');
    onComplete(true);
  }, [onComplete]);

  useEffect(() => {
    // ── Guards ────────────────────────────────────────────────────────────
    if (localStorage.getItem('atlas_intro_seen')) { onComplete(false); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onComplete(false); return; }

    const svg      = svgRef.current;
    const pathEl   = pathRef.current;
    const glowEl   = glowPathRef.current;
    const overlay  = overlayRef.current;
    const label    = labelRef.current;
    const subLabel = subLabelRef.current;
    const canvas   = canvasRef.current;
    const container = containerRef.current;
    if (!svg || !pathEl || !glowEl || !overlay || !label || !subLabel || !canvas || !container) return;

    // Load heavy dependencies ONLY if intro is actually going to play
    let isMounted = true;
    Promise.all([
      import('flubber'),
      import('d3'),
      import('../data/introKeyframes')
    ]).then(([
      { interpolate: flubberInterpolate },
      { geoPath, geoMercator },
      { INTRO_KEYFRAMES }
    ]) => {
      if (!isMounted) return;

      const W = window.innerWidth;
      const H = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for perf
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

      // ─── GeoJSON → SVG Path ─────────────────────────────────────────────────────
      const geojsonToPath = (geojson: any, width: number, height: number): string => {
        const projection = geoMercator()
          .center([53, 32])
          .scale(width * 0.9)
          .translate([width / 2, height / 2]);
        const pathGen = geoPath().projection(projection);
        return pathGen(geojson.geometry) ?? '';
      };

      // Canvas setup at device pixel ratio
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      const ctx2d = canvas.getContext('2d')!;
      ctx2d.scale(dpr, dpr);

      // Pre-compute SVG paths
      const paths = INTRO_KEYFRAMES.map(kf => geojsonToPath(kf.geojson, W, H));

      // Init particles (dust motes)
      particlesRef.current = initParticles(80, W, H);

      // Init audio
      audioRef.current = createIntroAudio();

      // Skip button after 800ms
      const skipTimer = setTimeout(() => setSkipVisible(true), 800);

      // Particle animation loop (runs throughout entire intro)
      let particleRunning = true;
      function particleLoop() {
        if (!particleRunning || !isMounted) return;
        tickParticles(particlesRef.current, ctx2d, W, H);
        requestAnimationFrame(particleLoop);
      }

      // ════════════════════════════════════════════════════════════════════════
      //  BEAT 1 — THE VOID (0.0–1.2s)
      //  Black screen slowly reveals terrain. Vignette intensifies.
      // ════════════════════════════════════════════════════════════════════════

      let t0: number | null = null;
      const BEAT1_DURATION = 1200;

      const isMobile = W < 640;
      const endOpacity = isMobile ? 0.4 : 0.08;

      function beat1(ts: number) {
        if (!t0) t0 = ts;
        const p = Math.min((ts - t0) / BEAT1_DURATION, 1);
        const ep = easeOutExpo(p);

        // Overlay dissolves — on mobile we keep it much darker (40% vs 8%) to ensure text stays readable against map
        overlay.style.opacity = String(1 - ep * (1 - endOpacity));

        if (p < 1) {
          rafRef.current = requestAnimationFrame(beat1);
        } else {
          overlay.style.opacity = String(endOpacity);
          audioRef.current?.fadeIn();
          requestAnimationFrame(particleLoop); // start dust
          beat2();
        }
      }

      // ════════════════════════════════════════════════════════════════════════
      //  BEAT 2 — THE REVEAL (1.2–2.8s)
      //  Achaemenid border draws with a glowing pen. Label fades up.
      // ════════════════════════════════════════════════════════════════════════

      function beat2() {
        setPhase('draw');

        pathEl.setAttribute('d', paths[0]);
        pathEl.style.fill = 'none';
        pathEl.style.stroke = 'rgba(201,169,110,0.85)';
        pathEl.style.strokeWidth = '1.5';
        pathEl.style.opacity = '1';

        // Ghost glow path (wider, blurred, follows the same shape)
        glowEl.setAttribute('d', paths[0]);
        glowEl.style.fill = 'none';
        glowEl.style.stroke = 'rgba(201,169,110,0.25)';
        glowEl.style.strokeWidth = '8';
        glowEl.style.opacity = '1';

        const totalLen = pathEl.getTotalLength();
        pathEl.style.strokeDasharray = String(totalLen);
        pathEl.style.strokeDashoffset = String(totalLen);
        glowEl.style.strokeDasharray = String(totalLen);
        glowEl.style.strokeDashoffset = String(totalLen);

        // Label reveal with vertical slide
        label.textContent = INTRO_KEYFRAMES[0].label[lang];
        label.style.opacity = '0';
        label.style.transform = 'translateX(-50%) translateY(8px)';
        setTimeout(() => {
          label.style.transition = 'opacity 800ms ease, transform 800ms ease';
          label.style.opacity = '1';
          label.style.transform = 'translateX(-50%) translateY(0)';
        }, 400);

        let drawT0: number | null = null;
        const DRAW_DURATION = 1600; // Slower, more deliberate

        function drawStroke(ts: number) {
          if (!drawT0) drawT0 = ts;
          const p = Math.min((ts - drawT0) / DRAW_DURATION, 1);
          const ep = easeInOutQuart(p);
          const offset = totalLen * (1 - ep);
          pathEl.style.strokeDashoffset = String(offset);
          glowEl.style.strokeDashoffset = String(offset);

          if (p < 1) {
            rafRef.current = requestAnimationFrame(drawStroke);
          } else {
            pathEl.style.strokeDashoffset = '0';
            glowEl.style.strokeDashoffset = '0';
            setTimeout(beat3, 300);
          }
        }

        rafRef.current = requestAnimationFrame(drawStroke);
      }

      // ════════════════════════════════════════════════════════════════════════
      //  BEAT 3 — THE CONTRACTION (2.8–5.0s)
      //  Fill fades in. Shape morphs through empires with breathe pauses.
      // ════════════════════════════════════════════════════════════════════════

      function beat3() {
        setPhase('morph');

        // Cinematic fill — not instant, grows from 0
        pathEl.style.transition = 'fill 600ms ease';
        pathEl.style.fill = 'rgba(201,120,40,0.18)';
        glowEl.style.transition = 'fill 600ms ease';
        glowEl.style.fill = 'rgba(201,120,40,0.06)';

        let idx = 0;

        function morphNext() {
          idx++;
          if (idx >= INTRO_KEYFRAMES.length) {
            // Final shape reached — breathe, then title
            setTimeout(beat4, 200);
            return;
          }

          const kf = INTRO_KEYFRAMES[idx];
          const from = paths[idx - 1];
          const to = paths[idx];

          // Audio heartbeat
          audioRef.current?.pulse();

          // Label crossfade with direction
          label.style.transition = 'opacity 200ms ease, transform 200ms ease';
          label.style.opacity = '0';
          label.style.transform = 'translateX(-50%) translateY(-6px)';

          setTimeout(() => {
            label.textContent = kf.label[lang];
            label.style.transform = 'translateX(-50%) translateY(6px)';
            requestAnimationFrame(() => {
              label.style.transition = 'opacity 400ms ease, transform 400ms ease';
              label.style.opacity = '1';
              label.style.transform = 'translateX(-50%) translateY(0)';
            });
          }, 250);

          // Morph with flubber
          const morphDuration = kf.morphMs > 0 ? kf.morphMs + 200 : 400; // pad for cinematic feel
          const interp = flubberInterpolate(from, to, { maxSegmentLength: 6 });
          let mT0: number | null = null;

          function doMorph(ts: number) {
            if (!mT0) mT0 = ts;
            const p = Math.min((ts - mT0) / morphDuration, 1);
            const d = interp(easeInOutQuart(p));
            pathEl.setAttribute('d', d);
            glowEl.setAttribute('d', d);

            if (p < 1) {
              rafRef.current = requestAnimationFrame(doMorph);
            } else {
              setTimeout(morphNext, kf.holdMs + 100);
            }
          }

          rafRef.current = requestAnimationFrame(doMorph);
        }

        // Hold on Achaemenid before morphing
        setTimeout(morphNext, INTRO_KEYFRAMES[0].holdMs + 200);
      }

      // ════════════════════════════════════════════════════════════════════════
      //  BEAT 4 — THE RESOLVE (5.0–6.5s)
      //  Modern Iran settles. Sonar ring. Product title rises from depth.
      // ════════════════════════════════════════════════════════════════════════

      function beat4() {
        setPhase('title');
        audioRef.current?.resolve();

        // ── Sonar ring (SVG clone, GPU-animated via CSS)
        const sonarEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        sonarEl.setAttribute('d', pathEl.getAttribute('d') ?? '');
        sonarEl.style.cssText = `
          fill: none;
          stroke: rgba(201,169,110,0.5);
          stroke-width: 2;
          transform-origin: center;
          opacity: 0.5;
          will-change: transform, opacity;
        `;
        svg.appendChild(sonarEl);

        let sT0: number | null = null;
        const SONAR_DURATION = 1000;

        function doSonar(ts: number) {
          if (!sT0) sT0 = ts;
          const p = Math.min((ts - sT0) / SONAR_DURATION, 1);
          const ep = easeOutQuint(p);
          sonarEl.style.transform = `scale(${1 + ep * 0.06})`;
          sonarEl.style.opacity = String(0.5 * (1 - ep));

          if (p < 1) {
            rafRef.current = requestAnimationFrame(doSonar);
          } else {
            svg.removeChild(sonarEl);
          }
        }

        rafRef.current = requestAnimationFrame(doSonar);

        // Fade out era label
        label.style.transition = 'opacity 500ms ease';
        label.style.opacity = '0';

        // Rise product title
        setTitleVisible(true);

        // Show dedication 900ms after title appears
        setTimeout(() => setDedicationVisible(true), 900);

        // Dissolve after dedication has had time to breathe
        setTimeout(beat5, 3200);
      }

      // ════════════════════════════════════════════════════════════════════════
      //  BEAT 5 — THE HANDOFF (6.5–8.0s)
      //  Everything dissolves to atlas. Polygon fades. Particles drift away.
      // ════════════════════════════════════════════════════════════════════════

      function beat5() {
        setPhase('dissolve');

        // Slow, cinematic fade of the SVG layer
        if (svgRef.current) {
          svgRef.current.style.transition = 'opacity 1200ms cubic-bezier(0.4, 0, 0.2, 1)';
          svgRef.current.style.opacity = '0';
        }

        // Fade canvas particles
        if (canvasRef.current) {
          canvasRef.current.style.transition = 'opacity 1200ms cubic-bezier(0.4, 0, 0.2, 1)';
          canvasRef.current.style.opacity = '0';
        }

        // Kill particles
        setTimeout(() => { particleRunning = false; }, 1300);

        // Full container dissolve
        if (containerRef.current) {
          containerRef.current.style.transition = 'opacity 1000ms cubic-bezier(0.4, 0, 0.2, 1)';
          setTimeout(() => {
            if (containerRef.current) containerRef.current.style.opacity = '0';
          }, 400);
        }

        setTimeout(complete, 1500);
      }

      // ── Start ────────────────────────────────────────────────────────────────
      rafRef.current = requestAnimationFrame(beat1);

      return () => {
        clearTimeout(skipTimer);
        cancelAnimationFrame(rafRef.current);
        audioRef.current?.stop();
        particleRunning = false;
      };
    });

    return () => {
      isMounted = false;
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
    };
  }, [lang, complete, onComplete]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: phase === 'dissolve' || phase === 'done' ? 'none' : 'auto',
        willChange: 'opacity',
      }}
    >
      {/* ── Cinematic Vignette (CSS radial gradient, zero cost) ─────────── */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 10,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* ── Letterbox Bars (cinematic 2.35:1 aspect feel) ──────────────── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '8vh', zIndex: 11, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, #050708, transparent)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: '8vh', zIndex: 11, pointerEvents: 'none',
        background: 'linear-gradient(to top, #050708, transparent)',
      }} />

      {/* ── Black overlay for initial void ─────────────────────────────── */}
      <div
        ref={overlayRef}
        style={{
          position: 'absolute', inset: 0,
          background: '#050708', zIndex: 1,
          willChange: 'opacity',
        }}
      />

      {/* ── Particle Canvas (GPU-composited, behind SVG) ───────────────── */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0,
          zIndex: 2, pointerEvents: 'none',
          willChange: 'opacity',
        }}
      />

      {/* ── SVG Animation Layer ────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          zIndex: 3, willChange: 'opacity',
        }}
      >
        <defs>
          {/* Outer glow (atmospheric bloom) */}
          <filter id="intro-bloom" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="bloom" />
            <feMerge>
              <feMergeNode in="bloom" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Inner glow (pen tip) */}
          <filter id="intro-pen" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="2" result="penGlow" />
            <feMerge>
              <feMergeNode in="penGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Atmospheric glow layer (wider, blurred) */}
        <path
          ref={glowPathRef}
          filter="url(#intro-bloom)"
          style={{ willChange: 'stroke-dashoffset, d' }}
        />

        {/* Primary stroke (sharp, glowing pen) */}
        <path
          ref={pathRef}
          filter="url(#intro-pen)"
          style={{ willChange: 'stroke-dashoffset, d' }}
        />
      </svg>

      {/* ── Era Label ──────────────────────────────────────────────────── */}
      <div
        ref={labelRef}
        style={{
          position: 'absolute',
          bottom: '28%', left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: lang === 'fa' ? "'Vazirmatn', serif" : "'Cinzel', serif",
          fontSize: 'clamp(11px, 1.4vw, 15px)',
          fontWeight: 400,
          color: 'rgba(201,169,110,0.75)',
          letterSpacing: lang === 'fa' ? 'normal' : '0.18em',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          zIndex: 6, opacity: 0,
          textShadow: '0 0 20px rgba(0,0,0,1), 0 0 40px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,1)',
          pointerEvents: 'none',
          willChange: 'opacity, transform',
        }}
      />

      {/* ── Sub-label (year range — appears during morph) ──────────────── */}
      <div
        ref={subLabelRef}
        style={{
          position: 'absolute',
          bottom: '24%', left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: "'Cinzel', serif",
          fontSize: '10px',
          color: 'rgba(201,169,110,0.3)',
          letterSpacing: '0.3em',
          textAlign: 'center',
          zIndex: 6, opacity: 0,
          pointerEvents: 'none',
        }}
      />

      {/* ── Product Title (appears in beat 4) ──────────────────────────── */}
      {titleVisible && (
        <div
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 8,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            animation: 'introTitleRise 1200ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          {/* Decorative rule above */}
          <div style={{
            width: '60px', height: '1px',
            background: 'linear-gradient(to right, transparent, rgba(201,169,110,0.5), transparent)',
            animation: 'introRuleExpand 800ms ease 200ms forwards',
            opacity: 0,
          }} />

          <h1 style={{
            fontFamily: lang === 'fa' ? "'Vazirmatn', serif" : "'Cinzel', serif",
            fontSize: 'clamp(18px, 3vw, 32px)',
            fontWeight: 400,
            color: 'rgba(212,184,122,0.95)',
            letterSpacing: lang === 'fa' ? 'normal' : '0.06em',
            textAlign: 'center',
            margin: 0,
            textShadow: '0 0 40px rgba(201,169,110,0.3), 0 0 80px rgba(201,169,110,0.1), 0 2px 4px rgba(0,0,0,1)',
          }}>
            {lang === 'fa' ? 'اطلس زنده‌ی ایران بزرگ' : 'The Living Atlas of Greater Iran'}
          </h1>

          {/* Decorative rule below */}
          <div style={{
            width: '60px', height: '1px',
            background: 'linear-gradient(to right, transparent, rgba(201,169,110,0.5), transparent)',
            animation: 'introRuleExpand 800ms ease 400ms forwards',
            opacity: 0,
          }} />

          {/* ── Dedication: Built with Love for Iran ───────────── */}
          {dedicationVisible && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginTop: '16px',
                animation: 'introLoveFade 1400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
                opacity: 0,
              }}
            >
              <span style={{
                fontFamily: lang === 'fa' ? "'Vazirmatn', serif" : "'Cinzel', serif",
                fontSize: 'clamp(9px, 1.2vw, 12px)',
                fontWeight: 300,
                color: 'rgba(180,170,150,0.6)',
                textTransform: lang === 'fa' ? 'none' : 'uppercase',
                letterSpacing: lang === 'fa' ? 'normal' : '0.18em',
              }}>
                {lang === 'fa' ? 'ساخته شده با' : 'Built with'}
              </span>

              {/* Animated SVG heart — draws itself then pulses */}
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                style={{
                  animation: 'heartPulse 2s ease-in-out 0.8s infinite',
                  filter: 'drop-shadow(0 0 6px rgba(244,63,94,0.4))',
                }}
              >
                <defs>
                  <linearGradient id="heart-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fb7185" />
                    <stop offset="100%" stopColor="#e11d48" />
                  </linearGradient>
                </defs>
                <path
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                  fill="url(#heart-grad)"
                />
              </svg>

              {/* "for Iran" with travelling shimmer */}
              <span style={{
                fontFamily: lang === 'fa' ? "'Vazirmatn', serif" : "'Cinzel', serif",
                fontSize: 'clamp(9px, 1.2vw, 12px)',
                fontWeight: 300,
                textTransform: lang === 'fa' ? 'none' : 'uppercase',
                letterSpacing: lang === 'fa' ? 'normal' : '0.18em',
                background: 'linear-gradient(90deg, rgba(180,170,150,0.6) 0%, rgba(180,170,150,0.6) 40%, rgba(212,184,122,1) 50%, rgba(180,170,150,0.6) 60%, rgba(180,170,150,0.6) 100%)',
                backgroundSize: '200% 100%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'loveShimmer 3s ease-in-out 1.5s infinite',
              }}>
                {lang === 'fa' ? 'برای ایران' : 'for Iran'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Skip Button ────────────────────────────────────────────────── */}
      {skipVisible && phase !== 'dissolve' && phase !== 'done' && (
        <button
          onClick={complete}
          style={{
            position: 'absolute',
            bottom: '24px', right: '24px',
            background: 'rgba(10,12,10,0.5)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: '6px',
            color: 'rgba(201,169,110,0.4)',
            fontFamily: "'Cinzel', serif",
            fontSize: '10px',
            padding: '6px 16px',
            cursor: 'pointer',
            zIndex: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            transition: 'all 300ms ease',
            animation: 'introSkipFade 600ms ease forwards',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'rgba(201,169,110,0.8)';
            e.currentTarget.style.borderColor = 'rgba(201,169,110,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(201,169,110,0.4)';
            e.currentTarget.style.borderColor = 'rgba(201,169,110,0.15)';
          }}
        >
          {lang === 'fa' ? 'رد کردن' : 'Skip Intro'}
        </button>
      )}

      {/* ── Film Grain (pure CSS, negligible cost) ─────────────────────── */}
      <div
        style={{
          position: 'absolute', inset: 0,
          zIndex: 9, pointerEvents: 'none',
          opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
}
