import React, { useEffect, useRef } from 'react';
import {
  getMotionPreset,
  resolveMotionDim,
  shouldAnimateMotion,
  DEFAULT_MOTION_PRESET_ID,
} from '../../utils/motionPresets';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('CanvasMotionBackground');

/** Cap device-pixel-ratio so old booth PCs don't melt. */
const MAX_DPR = 1.5;

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Deterministic PRNG so the particle field is stable per preset. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function paintBase(ctx, w, h, base) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Contrast guard: dark overlay + subtle edge vignette so lyrics stay
 * readable no matter how bright a preset frame gets. Lyrics render in a
 * sibling layer above this canvas and are never touched.
 */
function paintDimGuard(ctx, w, h, dim) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dim.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function blob(ctx, x, y, radius, rgb, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawDrift(ctx, w, h, preset, t) {
  paintBase(ctx, w, h, preset.base);
  const rgbs = preset.palette.map(hexToRgb);
  const R = Math.max(w, h);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < rgbs.length; i++) {
    const sp = (0.10 + i * 0.045) * (0.4 + preset.speed);
    const x = w / 2 + Math.cos(t * sp + (i * Math.PI * 2) / rgbs.length) * w * 0.34;
    const y = h / 2 + Math.sin(t * sp * 0.8 + (i * Math.PI) / rgbs.length) * h * 0.30;
    blob(ctx, x, y, R * (0.42 - i * 0.05), rgbs[i], 0.5);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawRays(ctx, w, h, preset, t) {
  paintBase(ctx, w, h, preset.base);
  const rgbs = preset.palette.map(hexToRgb);
  const cx = w / 2;
  const cy = -h * 0.12;
  const len = Math.hypot(w, h) * 1.2;
  const beams = 5;
  ctx.save();
  ctx.translate(cx, cy);
  const sway = Math.sin(t * 0.08 * (0.5 + preset.speed)) * 0.06;
  ctx.rotate(sway);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < beams; i++) {
    const spread = (i - (beams - 1) / 2) * 0.22;
    const rgb = rgbs[i % rgbs.length];
    ctx.save();
    ctx.rotate(spread);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.34)`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g;
    const halfWidth = (w / beams) * 0.42;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-halfWidth, len);
    ctx.lineTo(halfWidth, len);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

function makeParticles(preset, count) {
  const rand = mulberry32(seedFromId(preset.id));
  const rgbs = preset.palette.map(hexToRgb);
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push({
      x: rand(),
      y: rand(),
      r: 1 + rand() * 3.2,
      v: 0.008 + rand() * 0.03,
      drift: (rand() - 0.5) * 0.02,
      a: 0.25 + rand() * 0.5,
      c: rgbs[Math.floor(rand() * rgbs.length)],
      ph: rand() * Math.PI * 2,
    });
  }
  return parts;
}

function drawRise(ctx, w, h, preset, t, particles) {
  paintBase(ctx, w, h, preset.base);
  ctx.globalCompositeOperation = 'lighter';
  const rise = (0.25 + preset.speed) * t;
  for (const p of particles) {
    const y = ((p.y - rise * p.v) % 1 + 1) % 1;
    const x = (p.x + Math.sin(t * 0.3 + p.ph) * 0.012 + p.drift * t * 0.1 + 1) % 1;
    const tw = 0.65 + 0.35 * Math.sin(t * 0.9 + p.ph);
    const px = x * w;
    const py = y * h;
    const pr = p.r * Math.min(w, h) / 900 + 0.6;
    ctx.globalAlpha = p.a * tw;
    ctx.fillStyle = `rgb(${p.c[0]},${p.c[1]},${p.c[2]})`;
    ctx.beginPath();
    ctx.arc(px, py, pr * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, p.a * tw + 0.35);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawWaves(ctx, w, h, preset, t) {
  paintBase(ctx, w, h, preset.base);
  const rgbs = preset.palette.map(hexToRgb);
  const layers = 3;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < layers; i++) {
    const rgb = rgbs[i % rgbs.length];
    const baseY = h * (0.38 + i * 0.2);
    const amp = h * (0.05 + i * 0.02);
    const freq = (1.1 + i * 0.5) / w;
    const phase = t * (0.25 + preset.speed * 0.5) * (1 + i * 0.25);
    const g = ctx.createLinearGradient(0, baseY - amp * 2, 0, h);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= w; x += Math.max(4, w / 120)) {
      ctx.lineTo(x, baseY + Math.sin(x * freq * Math.PI * 2 + phase + i) * amp);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawFrame(ctx, w, h, preset, t, particles, dim) {
  switch (preset.style) {
    case 'rays':
      drawRays(ctx, w, h, preset, t);
      break;
    case 'rise':
      drawRise(ctx, w, h, preset, t, particles);
      break;
    case 'waves':
      drawWaves(ctx, w, h, preset, t);
      break;
    case 'drift':
    default:
      drawDrift(ctx, w, h, preset, t);
      break;
  }
  paintDimGuard(ctx, w, h, dim);
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    else if (typeof mq.addListener === 'function') mq.addListener(onChange);
    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange);
      else if (typeof mq.removeListener === 'function') mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

/**
 * CanvasMotionBackground — offline generative motion layer for outputs.
 *
 * Props mirror the ButterchurnBackground interface from the original plan:
 * - presetId: motion preset slug (unknown ids fall back to the default).
 * - dim: 0..1 black-overlay override (preset default otherwise). Contrast guard.
 * - paused: when true, render one static frame (used for Low Power / GPU-off).
 * - performanceSettings: { lowPowerMode, gpuEffects } — forces static when off.
 *
 * The OS reduced-motion preference always forces a static frame. The canvas
 * is decorative (aria-hidden); lyrics render above it and are never dimmed.
 */
const CanvasMotionBackground = ({
  presetId = DEFAULT_MOTION_PRESET_ID,
  dim,
  paused = false,
  performanceSettings = null,
  className = '',
  style,
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const preset = getMotionPreset(presetId);
  const effectiveDim = resolveMotionDim(preset, dim);
  const animated = shouldAnimateMotion({ paused, performanceSettings, prefersReducedMotion });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      log.warn('2d canvas context unavailable — motion background disabled');
      return undefined;
    }

    let rafId = 0;
    let width = 0;
    let height = 0;
    const density = preset.style === 'rise'
      ? Math.round(40 + (preset.density ?? 0.5) * 70)
      : 0;
    const particles = preset.style === 'rise' ? makeParticles(preset, density) : [];

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(MAX_DPR, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
      width = Math.max(2, Math.round(rect.width * dpr));
      height = Math.max(2, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    resize();

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(container);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', resize);
    }

    const renderAt = (t) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawFrame(ctx, canvas.width, canvas.height, preset, t, particles, effectiveDim);
    };

    if (!animated) {
      // Static fallback: one deterministic frame, no loop (lyrics stay legible).
      renderAt(0);
      return () => {
        if (observer) observer.disconnect();
        else if (typeof window !== 'undefined') window.removeEventListener('resize', resize);
      };
    }

    const t0 = performance.now() / 1000;
    const loop = (now) => {
      // Don't burn CPU while the output tab is hidden.
      if (document.hidden) {
        rafId = requestAnimationFrame(loop);
        return;
      }
      renderAt(now / 1000 - t0);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      else if (typeof window !== 'undefined') window.removeEventListener('resize', resize);
    };
    // Re-init when the look changes or animation permission flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.id, effectiveDim, animated]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full overflow-hidden ${className}`}
      style={style}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
};

export default CanvasMotionBackground;
