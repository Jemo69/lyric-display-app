import { describe, it, expect } from 'vitest';
import {
  MOTION_PRESETS,
  MOTION_STYLES,
  MOTION_PRESET_DIM_RANGE,
  MOTION_PRESET_MAX_SPEED,
  DEFAULT_MOTION_PRESET_ID,
  FALLBACK_MOTION_DIM,
  getMotionPreset,
  getMotionPresetIds,
  resolveMotionDim,
  shouldAnimateMotion,
} from '../motionPresets';

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('motion presets shape (feature #08)', () => {
  it('ships ~26 curated presets', () => {
    expect(MOTION_PRESETS.length).toBe(26);
  });

  it('has unique kebab-case ids and non-empty names', () => {
    const ids = MOTION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of MOTION_PRESETS) {
      expect(p.id).toMatch(KEBAB);
      expect(typeof p.name).toBe('string');
      expect(p.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('uses only known renderer styles', () => {
    for (const p of MOTION_PRESETS) {
      expect(MOTION_STYLES).toContain(p.style);
    }
  });

  it('uses valid dark palettes and base colors', () => {
    for (const p of MOTION_PRESETS) {
      expect(Array.isArray(p.palette)).toBe(true);
      expect(p.palette.length).toBeGreaterThanOrEqual(3);
      for (const c of p.palette) expect(c).toMatch(HEX6);
      expect(p.base).toMatch(HEX6);
    }
  });

  it('keeps speeds slow (church-safe, no strobe-like motion)', () => {
    for (const p of MOTION_PRESETS) {
      expect(p.speed).toBeGreaterThan(0);
      expect(p.speed).toBeLessThanOrEqual(MOTION_PRESET_MAX_SPEED);
    }
  });

  it('keeps dim defaults inside the contrast-guard range', () => {
    for (const p of MOTION_PRESETS) {
      expect(p.dim).toBeGreaterThanOrEqual(MOTION_PRESET_DIM_RANGE.min);
      expect(p.dim).toBeLessThanOrEqual(MOTION_PRESET_DIM_RANGE.max);
    }
  });

  it('exposes a default preset that exists', () => {
    expect(getMotionPresetIds()).toContain(DEFAULT_MOTION_PRESET_ID);
    expect(getMotionPreset(DEFAULT_MOTION_PRESET_ID).id).toBe(DEFAULT_MOTION_PRESET_ID);
  });

  it('falls back to the default preset for unknown ids', () => {
    expect(getMotionPreset('nope-missing').id).toBe(DEFAULT_MOTION_PRESET_ID);
    expect(getMotionPreset(undefined).id).toBe(DEFAULT_MOTION_PRESET_ID);
    expect(getMotionPreset(null).id).toBe(DEFAULT_MOTION_PRESET_ID);
  });
});

describe('resolveMotionDim', () => {
  it('prefers a finite user override, clamped to 0..1', () => {
    expect(resolveMotionDim('amber-drift', 0.8)).toBeCloseTo(0.8);
    expect(resolveMotionDim('amber-drift', 2)).toBe(1);
    expect(resolveMotionDim('amber-drift', -1)).toBe(0);
  });

  it('uses the preset default when no override is given', () => {
    const preset = getMotionPreset('amber-drift');
    expect(resolveMotionDim('amber-drift', undefined)).toBeCloseTo(preset.dim);
    expect(resolveMotionDim(preset, Number.NaN)).toBeCloseTo(preset.dim);
  });

  it('fails dark for unknown presets (default preset dim)', () => {
    expect(resolveMotionDim('missing-id', undefined)).toBe(getMotionPreset(DEFAULT_MOTION_PRESET_ID).dim);
  });

  it('uses the fallback dim when a preset object carries no valid dim', () => {
    expect(resolveMotionDim({ id: 'x', dim: Number.NaN }, undefined)).toBe(FALLBACK_MOTION_DIM);
  });
});

describe('shouldAnimateMotion', () => {
  const on = { lowPowerMode: false, gpuEffects: true };

  it('animates when everything is on', () => {
    expect(shouldAnimateMotion({ performanceSettings: on })).toBe(true);
  });

  it('goes static when paused, low-power, GPU-off, or reduced-motion', () => {
    expect(shouldAnimateMotion({ paused: true, performanceSettings: on })).toBe(false);
    expect(shouldAnimateMotion({ performanceSettings: { ...on, lowPowerMode: true } })).toBe(false);
    expect(shouldAnimateMotion({ performanceSettings: { ...on, gpuEffects: false } })).toBe(false);
    expect(shouldAnimateMotion({ performanceSettings: on, prefersReducedMotion: true })).toBe(false);
  });
});
