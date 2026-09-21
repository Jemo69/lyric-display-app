import React from 'react';
import { ScreenShare } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { useDarkModeState } from '../hooks/useStoreSelectors';
import { useNdiStatus } from '../hooks/useNdiStatus';
import { defaultNdiSourceName, describeNdiSnapshot } from '../utils/ndi';
import { createLogger } from '../utils/logger.js';

const log = createLogger('NdiOutputSection');

/**
 * Per-output NDI video-over-IP toggle + live status (output settings).
 *
 * Volunteer-safe contract:
 * - Default OFF everywhere; the app boots and builds identically with no
 *   NDI runtime installed.
 * - Enabling without a runtime lands the sender in an honest `error` state
 *   ("NDI runtime not installed") instead of failing silently or crashing.
 * - Status is never color-alone: glyph + text label + aria-live region.
 * - The toggle + source name persist inside the existing per-output
 *   settings object (updateOutputSettings), so zustand persistence,
 *   custom-output cloning, and style-sync carry them for free.
 */
const NdiOutputSection = ({ outputKey, settings, update }) => {
  const { darkMode } = useDarkModeState();
  const ndiEnabled = Boolean(settings?.ndiEnabled);
  const sourceName = settings?.ndiSourceName || defaultNdiSourceName(outputKey);
  const { supported, snapshot, setEnabled, refresh } = useNdiStatus(outputKey, {
    initialEnabled: ndiEnabled,
    initialSourceName: settings?.ndiSourceName || '',
  });
  const described = describeNdiSnapshot(snapshot);
  const [nameDraft, setNameDraft] = React.useState(sourceName);

  React.useEffect(() => {
    setNameDraft(sourceName);
  }, [sourceName]);

  const handleToggle = React.useCallback(
    async (checked) => {
      update('ndiEnabled', checked);
      if (!supported) return;
      try {
        await setEnabled(checked, checked ? sourceName : undefined);
      } catch (error) {
        log.warn('NDI toggle IPC failed (non-fatal):', error?.message || error);
      }
    },
    [update, supported, setEnabled, sourceName]
  );

  const commitSourceName = React.useCallback(() => {
    const next = (nameDraft || '').trim() || defaultNdiSourceName(outputKey);
    if (next !== (settings?.ndiSourceName || '')) {
      update('ndiSourceName', next === defaultNdiSourceName(outputKey) ? '' : next);
    }
    if (supported && ndiEnabled) {
      setEnabled(true, next).catch((error) => {
        log.warn('NDI rename IPC failed (non-fatal):', error?.message || error);
      });
    }
  }, [nameDraft, outputKey, settings, update, supported, ndiEnabled, setEnabled]);

  const showRuntimeNote =
    supported && ndiEnabled && snapshot && !snapshot.runtime?.available && described.state !== 'live';

  return (
    <div
      className={`mt-4 space-y-3 rounded-xl border p-4 ${
        darkMode ? 'border-gray-800 bg-gray-950/40' : 'border-gray-200 bg-gray-50/50'
      }`}
      data-testid={`ndi-section-${outputKey}`}
    >
      <div className="flex items-center justify-between gap-4">
        <Tooltip
          content="Send this output as NDI video-over-IP to a switcher (vMix, TriCaster, ATEM) on the local network"
          side="right"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ScreenShare className={`w-4 h-4 shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            <div className="min-w-0">
              <label className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                NDI output (video over network)
              </label>
              <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                For the broadcast room. Off by default; safe to leave off.
              </p>
            </div>
          </div>
        </Tooltip>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${described.pill} ${
              darkMode ? 'bg-gray-900/60' : 'bg-white'
            }`}
            role="status"
            aria-live="polite"
            aria-label={`NDI status: ${described.label}`}
            title={described.detail}
          >
            <span aria-hidden="true">{described.glyph}</span>
            {described.label}
          </span>
          <Switch
            checked={ndiEnabled}
            onCheckedChange={handleToggle}
            disabled={!supported}
            aria-label={`Toggle NDI output for ${outputKey}`}
            title={supported ? 'Toggle NDI output' : 'NDI output is available in the desktop app'}
            className={`!h-7 !w-14 !border-0 shadow-sm transition-colors ${
              darkMode
                ? 'data-[state=checked]:bg-green-400 data-[state=unchecked]:bg-gray-600'
                : 'data-[state=checked]:bg-black data-[state=unchecked]:bg-gray-300'
            }`}
            thumbClassName="!h-5 !w-6 data-[state=checked]:!translate-x-7 data-[state=unchecked]:!translate-x-1"
          />
        </div>
      </div>

      {ndiEnabled && (
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor={`ndi-source-${outputKey}`}
            className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}
          >
            Source name
          </label>
          <Input
            id={`ndi-source-${outputKey}`}
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitSourceName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            maxLength={96}
            placeholder={defaultNdiSourceName(outputKey)}
            disabled={!supported}
            className={`w-56 ${
              darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'
            }`}
          />
        </div>
      )}

      {described.state === 'error' && (
        <p className={`text-xs ${darkMode ? 'text-red-200' : 'text-red-700'}`} role="alert">
          <span aria-hidden="true">▲ </span>
          {described.detail}{' '}
          {supported && (
            <button
              type="button"
              onClick={() => refresh()}
              className={`underline underline-offset-2 ${darkMode ? 'hover:text-red-100' : 'hover:text-red-900'} focus-visible:outline-2 focus-visible:outline-offset-2`}
            >
              Check again
            </button>
          )}
        </p>
      )}

      {showRuntimeNote && described.state !== 'error' && (
        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          NDI runtime not installed on this PC — the sender cannot go live yet. The app works normally
          without it.
        </p>
      )}

      {!supported && (
        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          NDI output is available in the desktop app. This toggle is kept off here.
        </p>
      )}

      <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
        Tip: for clean keying on the switcher, use a transparent background (Background opacity 0) on
        this output.
      </p>
    </div>
  );
};

export default NdiOutputSection;
