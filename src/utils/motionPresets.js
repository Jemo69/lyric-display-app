/**
 * motionPresets.js — Offline generative motion-background presets (feature #08).
 *
 * Dependency-free alternative to butterchurn / butterchurn-presets.
 * Why not butterchurn: butterchurn-presets is ~12 MB unpacked (offline bundle
 * bloat), and butterchurn is audio-reactive while lyric outputs have no audio
 * source, so its visuals would sit flat. This module is pure data + pure
 * helpers (no window/document access) so it runs in vitest node env and
 * anywhere the renderer runs, 100% offline.
 *
 * Church-safe rules baked into every preset:
 * - Slow speeds only (speed <= 0.6, no strobe / flash / rapid motion).
 * - Dark, desaturated palettes drawn over a near-black base.
 * - A `dim` default (black-overlay fraction) that guards lyric contrast.
 *   Lyrics always render above the motion layer; dim only affects the canvas.
 */

export const MOTION_STYLES = Object.freeze(['drift', 'rays', 'rise', 'waves']);

/** Absolute bounds for per-preset dim defaults (black-overlay fraction). */
export const MOTION_PRESET_DIM_RANGE = Object.freeze({ min: 0.4, max: 0.9 });

/** Hard cap for preset speed — keeps every preset slow and worship-appropriate. */
export const MOTION_PRESET_MAX_SPEED = 0.6;

export const DEFAULT_MOTION_PRESET_ID = 'amber-drift';

/** Default dim applied when a preset id is unknown (fail dark, lyrics win). */
export const FALLBACK_MOTION_DIM = 0.65;

/**
 * A preset: { id, name, style, palette, base, speed, dim, density? }
 * - id: kebab-case slug, unique.
 * - name: human label shown in the output-settings preset picker.
 * - style: one of MOTION_STYLES (rendered by CanvasMotionBackground).
 * - palette: 3+ hex colors used by the renderer.
 * - base: near-black background color the animation is painted over.
 * - speed: 0..MOTION_PRESET_MAX_SPEED (normalized, slow by design).
 * - dim: MOTION_PRESET_DIM_RANGE-bounded black-overlay default for contrast.
 * - density: optional 0..1 particle/band density hint (rise/waves styles).
 */
export const MOTION_PRESETS = Object.freeze([
  // ---- drift: slow radial glows on Lissajous paths ----
  { id: 'amber-drift', name: 'Amber Glow Drift', style: 'drift', palette: ['#8a5a1e', '#5c3a12', '#2e1f0c'], base: '#060402', speed: 0.22, dim: 0.6 },
  { id: 'deep-well-blue', name: 'Deep Well Blue', style: 'drift', palette: ['#1d3a6e', '#12294f', '#0a1830'], base: '#030509', speed: 0.2, dim: 0.62 },
  { id: 'violet-haze', name: 'Violet Haze', style: 'drift', palette: ['#4b2a7a', '#331c58', '#1d1033'], base: '#050309', speed: 0.24, dim: 0.6 },
  { id: 'emerald-calm', name: 'Emerald Calm', style: 'drift', palette: ['#14532d', '#0c3a20', '#071f12'], base: '#020604', speed: 0.18, dim: 0.62 },
  { id: 'crimson-dusk', name: 'Crimson Dusk', style: 'drift', palette: ['#6e1d24', '#4a1218', '#280b0e'], base: '#070203', speed: 0.2, dim: 0.68 },
  { id: 'sapphire-night', name: 'Sapphire Night', style: 'drift', palette: ['#1e2a6e', '#141c4f', '#0b102e'], base: '#020309', speed: 0.22, dim: 0.6 },
  { id: 'candlelight', name: 'Candlelight', style: 'drift', palette: ['#9a6a24', '#6b4718', '#3a270d'], base: '#070502', speed: 0.26, dim: 0.58 },
  { id: 'midnight-teal', name: 'Midnight Teal', style: 'drift', palette: ['#134e4a', '#0c3633', '#06201e'], base: '#020505', speed: 0.2, dim: 0.62 },

  // ---- rays: soft slow beams from above ----
  { id: 'sanctuary-rays', name: 'Sanctuary Rays', style: 'rays', palette: ['#a8823c', '#6e5626', '#40331a'], base: '#060502', speed: 0.16, dim: 0.62 },
  { id: 'azure-beams', name: 'Azure Beams', style: 'rays', palette: ['#2c4f8a', '#1c3560', '#101f3a'], base: '#020409', speed: 0.15, dim: 0.64 },
  { id: 'violet-beams', name: 'Violet Beams', style: 'rays', palette: ['#5b3a8a', '#3d2760', '#231738'], base: '#040309', speed: 0.17, dim: 0.62 },
  { id: 'dawn-beams', name: 'Dawn Beams', style: 'rays', palette: ['#96684a', '#68452f', '#3d281c'], base: '#070403', speed: 0.18, dim: 0.6 },
  { id: 'emerald-beams', name: 'Emerald Beams', style: 'rays', palette: ['#1e6b52', '#144a39', '#0b2a21'], base: '#020605', speed: 0.15, dim: 0.64 },
  { id: 'still-night', name: 'Still Night', style: 'rays', palette: ['#232c4a', '#171d33', '#0d111e'], base: '#020307', speed: 0.12, dim: 0.7 },

  // ---- rise: slow rising embers / dust motes ----
  { id: 'ember-rise', name: 'Ember Rise', style: 'rise', palette: ['#b07a2e', '#7a4f1c', '#45300f'], base: '#060402', speed: 0.3, dim: 0.6, density: 0.55 },
  { id: 'dust-motes', name: 'Dust Motes', style: 'rise', palette: ['#5a6a8a', '#3c4860', '#232a3a'], base: '#030407', speed: 0.22, dim: 0.62, density: 0.5 },
  { id: 'golden-ash', name: 'Golden Ash', style: 'rise', palette: ['#9a7a34', '#685322', '#3a2f14'], base: '#060502', speed: 0.28, dim: 0.6, density: 0.5 },
  { id: 'blue-cinders', name: 'Blue Cinders', style: 'rise', palette: ['#3a5a9a', '#274068', '#16243c'], base: '#020409', speed: 0.26, dim: 0.62, density: 0.45 },
  { id: 'violet-motes', name: 'Violet Motes', style: 'rise', palette: ['#6a4a9a', '#483168', '#2a1c3c'], base: '#040309', speed: 0.24, dim: 0.62, density: 0.5 },
  { id: 'hearth-glow', name: 'Hearth Glow', style: 'rise', palette: ['#8a3a24', '#5e2718', '#36150d'], base: '#070302', speed: 0.28, dim: 0.66, density: 0.55 },

  // ---- waves: layered slow sine bands ----
  { id: 'still-waters', name: 'Still Waters', style: 'waves', palette: ['#1d3a5e', '#12263f', '#0a1626'], base: '#020408', speed: 0.2, dim: 0.6, density: 0.6 },
  { id: 'royal-waves', name: 'Royal Waves', style: 'waves', palette: ['#452a6e', '#2f1c4e', '#1c102e'], base: '#040309', speed: 0.22, dim: 0.6, density: 0.6 },
  { id: 'jade-waves', name: 'Jade Waves', style: 'waves', palette: ['#14524a', '#0d3831', '#07211d'], base: '#020505', speed: 0.2, dim: 0.62, density: 0.55 },
  { id: 'ember-tide', name: 'Ember Tide', style: 'waves', palette: ['#6e3a1d', '#4a2712', '#2a150a'], base: '#060302', speed: 0.22, dim: 0.64, density: 0.55 },
  { id: 'night-tide', name: 'Night Tide', style: 'waves', palette: ['#232c3e', '#171e2b', '#0d1119'], base: '#020306', speed: 0.18, dim: 0.66, density: 0.5 },
  { id: 'grace-waves', name: 'Grace Waves', style: 'waves', palette: ['#2e2a6e', '#1f1c4e', '#12102e'], base: '#020309', speed: 0.2, dim: 0.6, density: 0.6 },
]);

const PRESET_BY_ID = new Map(MOTION_PRESETS.map((p) => [p.id, p]));

export function getMotionPreset(id) {
  if (typeof id === 'string' && PRESET_BY_ID.has(id)) return PRESET_BY_ID.get(id);
  return PRESET_BY_ID.get(DEFAULT_MOTION_PRESET_ID);
}

export function getMotionPresetIds() {
  return MOTION_PRESETS.map((p) => p.id);
}

const clamp01 = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
};

/**
 * Resolve the effective dim (black-overlay fraction 0..1).
 * A finite user override wins (clamped); otherwise the preset default.
 * Unknown presets fail dark so lyrics always win.
 */
export function resolveMotionDim(presetOrId, override) {
  const preset = typeof presetOrId === 'string' ? getMotionPreset(presetOrId) : (presetOrId || getMotionPreset(DEFAULT_MOTION_PRESET_ID));
  const user = clamp01(override);
  if (user !== null) return user;
  const presetDim = clamp01(preset?.dim);
  if (presetDim !== null) return presetDim;
  return FALLBACK_MOTION_DIM;
}

/**
 * Pure playback gate shared by every output surface.
 * Motion animates ONLY when: not paused by caller, GPU effects on,
 * low-power mode off, and the OS does not request reduced motion.
 * Anything else → render a single static frame (lyrics stay legible).
 */
export function shouldAnimateMotion({ paused = false, performanceSettings = null, prefersReducedMotion = false } = {}) {
  if (paused) return false;
  if (prefersReducedMotion) return false;
  if (!performanceSettings) return true;
  if (performanceSettings.lowPowerMode) return false;
  if (performanceSettings.gpuEffects === false) return false;
  return true;
}
