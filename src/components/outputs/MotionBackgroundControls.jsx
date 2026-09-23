import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { MOTION_PRESETS, MOTION_STYLES } from '../../utils/motionPresets';
import { usePerformanceSettings } from '../../hooks/useStoreSelectors';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('MotionBackgroundControls');

const STYLE_LABELS = {
  drift: 'Drift',
  rays: 'Rays',
  rise: 'Rise',
  waves: 'Waves',
};

/**
 * MotionBackgroundControls — shared preset + dim picker used by both the
 * regular OutputSettingsPanel and the StageSettingsPanel (feature #08).
 * Additive: renders nothing outside its own rows.
 */
const MotionBackgroundControls = ({
  darkMode = false,
  presetId,
  dim = 0.65,
  onPresetChange,
  onDimChange,
  disabled = false,
}) => {
  const { settings: performanceSettings } = usePerformanceSettings();
  const motionPausedByPerf = Boolean(
    performanceSettings?.lowPowerMode || performanceSettings?.gpuEffects === false,
  );

  const dimPercent = Math.round(Number(dim ?? 0.65) * 100);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 ml-auto min-w-0 max-w-full">
        <Tooltip content="Church-safe generative preset. Fully offline — no downloads, no streaming." side="top">
          <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>26 offline presets</span>
        </Tooltip>
        <Select value={presetId} onValueChange={onPresetChange} disabled={disabled}>
          <SelectTrigger
            disabled={disabled}
            aria-label="Motion background preset"
            className={`w-[220px] ${darkMode
              ? 'bg-gray-700 border-gray-600 text-gray-200'
              : 'bg-white border-gray-300'
              } ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            <SelectValue placeholder="Choose preset" />
          </SelectTrigger>
          <SelectContent className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}>
            {MOTION_STYLES.map((style) => (
              <React.Fragment key={style}>
                {MOTION_PRESETS.filter((p) => p.style === style).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {STYLE_LABELS[style] || style} · {p.name}
                  </SelectItem>
                ))}
              </React.Fragment>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3 ml-auto w-full max-w-[320px]">
        <Tooltip content="Dark overlay over the motion background. Higher = calmer background, easier-to-read lyrics. Lyrics themselves are never dimmed." side="top">
          <label className={`text-xs whitespace-nowrap ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Dim · {dimPercent}%
          </label>
        </Tooltip>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={dimPercent}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value) / 100;
            log.debug('Motion dim changed', { next });
            onDimChange(next);
          }}
          className="w-full accent-[#7DDBD3]"
          aria-label="Motion background dim (text contrast guard)"
        />
      </div>

      {motionPausedByPerf && (
        <p className={`text-[11px] text-right ${darkMode ? 'text-amber-400/90' : 'text-amber-700'}`}>
          Motion is paused by Performance settings (Low Power / GPU Effects off) — outputs show a static frame.
        </p>
      )}
    </div>
  );
};

export default MotionBackgroundControls;
