import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Mic,
  Cpu,
  Network,
  Cloud,
  RotateCcw,
  CircleSlash,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import useSpeechStore from '../../context/SpeechStore';
import useToast from '../../hooks/useToast';
import { useSpeechEnabled, useSpeechMode } from '../../hooks/useStoreSelectors';
import ProviderPicker from './ProviderPicker';
import InstallEngineWizard from './InstallEngineWizard';
import ModelCatalogList from './ModelCatalogList';
import AudioSourcePicker from './AudioSourcePicker';

// ---------------------------------------------------------------------------
// Live Sermon Assist — the settings surface (first-class section, NOT buried
// in Experimental).
//
// Local is the default posture: the three-way `where` control is the FIRST
// configuration control on the page, above the provider picker and above the
// model catalog, so a user who wants everything on their own hardware reaches
// a working provider without scrolling past a cloud form or entering a key.
//
// INVARIANTS held here:
//  - `enabled` only ever changes on an explicit user click of the master
//    Switch. Nothing in this file auto-enables the feature.
//  - No microphone code, no getUserMedia, no network requests, no spawn.
//  - `cloudProviderId` is cleared the moment the user leaves `cloud`, so a
//    stale cloud selection can never leak into a local run.
// ---------------------------------------------------------------------------

// Section 10 privacy requirement: an accurate, always-visible mode indicator.
// Same wording logic as the rail (SermonAssistPanel.jsx).
const modeLabelFor = ({ where, modelId, cloudProviderId }) => {
  if (where === 'local') return `Local · ${modelId}`;
  if (where === 'network') return 'Remote engine';
  return `Cloud · ${cloudProviderId ?? 'not configured'}`;
};

const WHERE_OPTIONS = [
  {
    id: 'local',
    label: 'This Device',
    Icon: Cpu,
    copy: 'Audio stays on this computer.',
  },
  {
    id: 'network',
    label: 'Network Device',
    Icon: Network,
    copy: 'Runs on another machine on your network, like a booth PC. Only text crosses the network.',
  },
  {
    id: 'cloud',
    label: 'Cloud',
    Icon: Cloud,
    copy: 'Audio is sent to a cloud provider. The live feed may contain audio that is not in the published recording.',
  },
];

// Phase 5 wires these: selection is stored in `cloudProviderId` only. API keys
// are never persisted here — see the `data-coming-soon` note below.
const CLOUD_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    copy: 'Zero setup, already-known quality, strong on accented English / chunked uploads mean more latency.',
  },
  {
    id: 'groq',
    name: 'Groq',
    copy: 'Whisper-large speed at low cost; best latency-per-cent / rate limits bite on long services.',
  },
  {
    id: 'deepgram',
    name: 'Deepgram',
    copy: 'True streaming, lowest latency / pricing is per second.',
  },
  {
    id: 'assemblyai',
    name: 'AssemblyAI',
    copy: 'Strong punctuation and formatting / per-second cost.',
  },
  {
    id: 'google',
    name: 'Google Cloud STT',
    copy: 'Best multi-dialect coverage / service-account credentials, heavier setup.',
  },
];

const SpeechSettingsSection = ({ darkMode = false }) => {
  const { enabled, setEnabled } = useSpeechEnabled();
  const { where, modelId, cloudProviderId } = useSpeechMode();
  const setWhere = useSpeechStore((state) => state.setWhere);
  const setCloudProviderId = useSpeechStore((state) => state.setCloudProviderId);
  const resetToDefaults = useSpeechStore((state) => state.resetToDefaults);
  const { showToast } = useToast();

  // API keys live only in this component's memory for the session — Phase 5
  // owns storage, so nothing here is written to the store or localStorage.
  const [draftKeys, setDraftKeys] = useState({});

  const handleToggle = (checked) => {
    // Explicit user click only — never called from an effect.
    setEnabled(checked);
    showToast({
      title: checked ? 'Sermon Assist enabled' : 'Sermon Assist disabled',
      message: checked
        ? 'Sermon Assist enabled — the rail is on the right of the control panel. No microphone is opened until you choose an audio source.'
        : 'Sermon Assist disabled — the rail is hidden and nothing is captured or sent.',
      variant: checked ? 'success' : 'info',
    });
  };

  const handleWhere = (value) => {
    setWhere(value);
    // Leaving cloud makes it unreachable: no stale cloud provider survives.
    if (value !== 'cloud') setCloudProviderId(null);
  };

  const handleReset = () => {
    resetToDefaults();
    setDraftKeys({});
    showToast({
      title: 'Sermon Assist reset',
      message: 'All Sermon Assist settings restored to defaults. The feature stays off until you turn it on.',
      variant: 'info',
    });
  };

  const activeWhere = WHERE_OPTIONS.find((option) => option.id === where) ?? WHERE_OPTIONS[0];

  const cardClass = `rounded-xl border p-5 space-y-4 transition-all ${
    darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white'
  }`;
  const labelClass = `text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`;
  const mutedClass = `text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`;
  const badgeBase =
    'text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded';

  return (
    <div className="space-y-6">
      <div>
        <h3
          className={`text-base font-semibold flex items-center gap-2 ${
            darkMode ? 'text-white' : 'text-gray-900'
          }`}
        >
          <Mic className="w-5 h-5 text-[#7DDBD3]" /> Speech &amp; AI
        </h3>
        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Live Sermon Assist transcribes the sermon while you run the service. Pick where it runs,
          which engine it uses, and which model it loads. Local is the default — cloud is one
          option, not the fallback.
        </p>
      </div>

      {/* -------------------------------------------------------------- (a)
          Master enable — off by default, only a user click flips it. */}
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={labelClass}>Sermon Assist</span>
              <span
                title="Sermon Assist never turns itself on — only you flip this switch."
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  darkMode
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                Off by default
              </span>
              <span
                className={`${badgeBase} ${
                  enabled
                    ? darkMode
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : darkMode
                      ? 'bg-gray-800 text-gray-400 border border-gray-700'
                      : 'bg-gray-100 text-gray-500 border border-gray-200'
                }`}
              >
                {enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <p className={mutedClass}>
              Transcribes the live sermon into the assist rail: next-lyric suggestions, Bible
              references, and sermon notes. Turning it on does not open a microphone — you choose
              the audio source separately below.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            aria-label="Enable Sermon Assist"
            data-testid="speech-enable-toggle"
          />
        </div>

        {enabled ? (
          <div
            className={`rounded-lg border p-3 text-xs leading-relaxed flex items-start gap-2.5 ${
              darkMode
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
            <div>
              <span className="font-semibold">Sermon Assist is ON</span> — the assist rail is on
              the right of the control panel. No microphone is opened until you choose an audio
              source, and the mode shown at the bottom of this page is what actually runs.
            </div>
          </div>
        ) : (
          <div
            className={`rounded-lg border p-3 text-xs leading-relaxed flex items-start gap-2.5 ${
              darkMode
                ? 'bg-gray-950/60 border-gray-800 text-gray-400'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            <CircleSlash className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
            <div>
              <span className="font-semibold">Sermon Assist is OFF</span> — no microphone access,
              no network requests, no engine installed. You can still choose where it runs and
              which model to load below; they take effect when you turn it on.
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------
          Configuration. Visible while disabled so the user can choose a
          model before enabling — just visibly inert (reduced opacity +
          aria-disabled), never hidden. */}
      <div aria-disabled={!enabled} className="space-y-6">
        {!enabled && (
          <p
            data-testid="speech-config-inert-note"
            className={`text-[11px] leading-relaxed ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}
          >
            Not active yet — you can still choose where Sermon Assist runs, which engine it uses,
            and which model it loads. Nothing starts until the switch above is ON.
          </p>
        )}

        <div className={enabled ? '' : 'opacity-60'}>
          {/* ---------------------------------------------------------- (b)
              The three-way question: which machine? First configuration
              control on the page, deliberately above every other choice. */}
          <div className={cardClass}>
            <div className="space-y-1.5">
              <span className={labelClass}>Where it runs</span>
              <p className={mutedClass}>
                The one question that matters first: does the sermon audio ever leave this
                computer?
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Where Sermon Assist runs"
              className="grid grid-cols-3 gap-2"
            >
              {WHERE_OPTIONS.map((option) => {
                const selected = where === option.id;
                const Icon = option.Icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`speech-where-${option.id}`}
                    onClick={() => handleWhere(option.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-center text-xs font-semibold transition-colors ${
                      selected
                        ? darkMode
                          ? 'border-[#7DDBD3] bg-[#7DDBD3]/10 text-[#7DDBD3]'
                          : 'border-[#1a5c54] bg-[#7DDBD3]/15 text-[#1a5c54]'
                        : darkMode
                          ? 'border-gray-700 bg-gray-900/40 text-gray-300 hover:border-gray-500'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className={mutedClass}>{activeWhere.copy}</p>
          </div>

          {/* ---------------------------------------------------------- (c)
              Provider picker — the local "who" axis. */}
          <div className="mt-6">
            <ProviderPicker darkMode={darkMode} />
          </div>

          {/* ---------------------------------------------------------- (d)
              Engine model install (Phase 2) above the catalog: the wizard
              owns the download lifecycle for the selected model, the catalog
              below owns per-model install/select states. */}
          <div className="mt-6">
            <InstallEngineWizard darkMode={darkMode} />
          </div>

          {/* ---------------------------------------------------------- (d2)
              Model catalog, filtered to the selected provider. */}
          <div className="mt-6">
            <ModelCatalogList darkMode={darkMode} />
          </div>

          {/* ---------------------------------------------------------- (e)
              Cloud block — only when `where === 'cloud'`. It sits BELOW the
              local options so choosing local never requires scrolling past
              it. Phase 5 wires key storage, requests, and cost metering;
              nothing here makes a network call. */}
          {where === 'cloud' && (
            <div className={`mt-6 ${cardClass}`} data-testid="speech-cloud-block">
              <div className="space-y-1.5">
                <span className={labelClass}>Cloud provider</span>
                <p className={mutedClass}>
                  Audio leaves this computer. The live feed may contain audio that is not in the
                  published recording.
                </p>
              </div>

              <div role="radiogroup" aria-label="Cloud provider" className="space-y-2">
                {CLOUD_PROVIDERS.map((provider) => {
                  const selected = cloudProviderId === provider.id;
                  return (
                    <div
                      key={provider.id}
                      className={`rounded-lg border p-3 space-y-2 transition-colors ${
                        selected
                          ? darkMode
                            ? 'border-[#7DDBD3] bg-[#7DDBD3]/10'
                            : 'border-[#1a5c54] bg-[#7DDBD3]/10'
                          : darkMode
                            ? 'border-gray-800 bg-gray-900/40'
                            : 'border-gray-200 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        data-testid={`speech-cloud-provider-${provider.id}`}
                        onClick={() => setCloudProviderId(provider.id)}
                        className="w-full text-left flex items-start justify-between gap-3"
                      >
                        <span className="space-y-1 min-w-0">
                          <span className={`block text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {provider.name}
                          </span>
                          <span className={`block text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {provider.copy}
                          </span>
                        </span>
                        <span
                          className={`${badgeBase} shrink-0 ${
                            selected
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : darkMode
                                ? 'bg-gray-800 text-gray-400 border border-gray-700'
                                : 'bg-gray-100 text-gray-500 border border-gray-200'
                          }`}
                        >
                          {selected ? 'Selected' : 'Select'}
                        </span>
                      </button>

                      {/* Masked key input per provider. Session-local only:
                          never read back, never persisted, never sent. */}
                      <label className="flex items-center gap-2">
                        <KeyRound className={`w-3.5 h-3.5 shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <Input
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          value={draftKeys[provider.id] ?? ''}
                          onChange={(event) =>
                            setDraftKeys((previous) => ({
                              ...previous,
                              [provider.id]: event.target.value,
                            }))
                          }
                          placeholder={`${provider.name} API key (not stored)`}
                          aria-label={`${provider.name} API key`}
                          className={`h-8 text-xs ${darkMode ? 'bg-gray-950 border-gray-800' : 'bg-white'}`}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              <p
                data-coming-soon="cloud-api-keys"
                className={`text-[11px] leading-relaxed rounded-lg border p-3 ${
                  darkMode
                    ? 'border-gray-800 bg-gray-950/60 text-gray-400'
                    : 'border-gray-200 bg-gray-50 text-gray-500'
                }`}
              >
                Keys arrive with the cloud phase — nothing typed above is stored or sent, and only
                your provider choice is kept. Running cost: cloud speech is billed per second or
                per minute of audio, so a 40-minute sermon typically costs cents, not dollars, on
                per-second providers and can cost more on per-minute ones during a long service.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------- (f)
          Audio source. AudioSourcePicker is cold on render: no permission
          request, no enumeration, no AudioContext until the user asks. */}
      <section className={cardClass}>
        <span className={labelClass}>Audio Source</span>
        <AudioSourcePicker darkMode={darkMode} />
      </section>

      {/* -------------------------------------------------------------- (g)
          Section 10 privacy requirement: accurate, always visible, no modal,
          no acknowledgement gate. Same wording as the rail. */}
      <div
        data-testid="speech-settings-mode"
        className={`rounded-lg border px-3 py-2 text-xs font-medium ${
          darkMode ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'
        }`}
      >
        {modeLabelFor({ where, modelId, cloudProviderId })}
      </div>

      {/* -------------------------------------------------------------- (h)
          Invariant 6 slice: one-click erase of everything this feature has
          stored. */}
      <div className={cardClass}>
        <div className="space-y-1.5">
          <span className={labelClass}>Reset</span>
          <p className={mutedClass}>
            Clears the master switch, where-it-runs, provider, model, cloud choice, and audio
            source back to their defaults. Sermon Assist stays off afterwards.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          className={`inline-flex items-center gap-2 ${
            darkMode ? 'border-gray-700 bg-transparent text-gray-200 hover:bg-gray-800' : ''
          }`}
        >
          <RotateCcw className="w-4 h-4" /> Reset all Sermon Assist settings
        </Button>
      </div>
    </div>
  );
};

export default SpeechSettingsSection;
