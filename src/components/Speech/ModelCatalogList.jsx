import React, { useMemo } from 'react';
import { CheckCircle2, Download, Gauge } from 'lucide-react';
import { getProvider, modelsForProvider } from 'shared/speech';
import useSpeechStore from '../../context/SpeechStore';

// ---------------------------------------------------------------------------
// ModelCatalogList — the model selection surface, filtered to whichever
// provider is selected. One card per catalog entry. The default is the best
// model, not the smallest: large-v3 opens pre-selected and badged.
//
// No download happens here — this is the selection surface. State labels
// (not installed / downloading / installed / benchmarked / active) arrive
// with the phases that own them; the benchmark affordance is present but
// honestly disabled rather than silently absent.
// ---------------------------------------------------------------------------

const TIER_ORDER = ['flagship', 'fast', 'english', 'weak', 'floor'];

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return null;
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const rounded =
    index === 0 || value >= 100 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[index]}`;
};

const tierRank = (tier) => {
  const index = TIER_ORDER.indexOf(tier);
  return index === -1 ? TIER_ORDER.length : index;
};

const sortModels = (models) =>
  [...models].sort((a, b) => {
    // 1. The default opens first — the best model, not the smallest.
    const defaultRank = (b.default === true ? 1 : 0) - (a.default === true ? 1 : 0);
    if (defaultRank !== 0) return defaultRank;
    // 2. Then tier order: flagship, fast, english, weak, floor.
    const tierDiff = tierRank(a.tier) - tierRank(b.tier);
    if (tierDiff !== 0) return tierDiff;
    // 3. Then download size ascending.
    return (a.downloadBytes ?? Infinity) - (b.downloadBytes ?? Infinity);
  });

const ModelCatalogList = ({ darkMode = false }) => {
  const providerId = useSpeechStore((state) => state.providerId);
  const modelId = useSpeechStore((state) => state.modelId);
  const setModelId = useSpeechStore((state) => state.setModelId);

  const provider = useMemo(() => getProvider(providerId), [providerId]);
  const models = useMemo(() => sortModels(modelsForProvider(providerId)), [providerId]);

  const cardClass = `rounded-xl border p-5 space-y-4 transition-all ${
    darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white'
  }`;
  const labelClass = `text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`;
  const mutedClass = `text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`;
  const badgeBase = 'text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded';

  const emptyReads = () => {
    if (!provider) return 'This engine is not in the model catalog.';
    const reads = Array.isArray(provider.reads) ? provider.reads : [];
    if (!reads.length) {
      return 'It uses a built-in speech service instead — nothing to download.';
    }
    return `It reads ${reads.join(', ')} supplied separately — those models are not in this catalog yet.`;
  };

  return (
    <div className={cardClass}>
      <div className="space-y-1.5">
        <span className={labelClass}>Model</span>
        <p className={mutedClass}>
          The default is the best model in the catalog, not the smallest. Size is a deliberate
          downgrade for weak machines, not the expected path.
        </p>
      </div>

      {models.length === 0 ? (
        <div
          className={`rounded-lg border p-4 space-y-1.5 ${
            darkMode ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <p className={`text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            No downloadable models for this provider
          </p>
          <p className={mutedClass}>{emptyReads()}</p>
        </div>
      ) : (
        <ul className="space-y-3" role="list">
          {models.map((model) => {
            const selected = model.id === modelId;
            const isDefault = model.default === true;
            const size = formatBytes(model.downloadBytes) ?? model.downloadLabel ?? '—';
            const digestMissing = model.sha256 === null || model.sha256 === undefined;
            return (
              <li key={model.id}>
                <div
                  className={`rounded-lg border p-3 space-y-2.5 transition-colors ${
                    selected
                      ? darkMode
                        ? 'border-[#7DDBD3] bg-[#7DDBD3]/10 shadow-sm'
                        : 'border-[#1a5c54] bg-[#7DDBD3]/10 shadow-sm'
                      : darkMode
                        ? 'border-gray-800 bg-gray-900/40'
                        : 'border-gray-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    data-testid={`speech-model-${model.id}`}
                    onClick={() => setModelId(model.id)}
                    className="w-full text-left space-y-2.5"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="space-y-1 min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {model.displayName}
                          </span>
                          {isDefault && (
                            <span
                              className={`${badgeBase} ${
                                darkMode
                                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              Default
                            </span>
                          )}
                          {model.tier && (
                            <span
                              className={`${badgeBase} ${
                                darkMode
                                  ? 'bg-gray-800 text-gray-300 border border-gray-700'
                                  : 'bg-gray-100 text-gray-600 border border-gray-200'
                              }`}
                            >
                              {model.tier}
                            </span>
                          )}
                        </span>
                        {isDefault && (
                          <span className={`block text-[11px] leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Best accuracy in the catalog — recommended for capable hardware.
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold ${
                          selected
                            ? darkMode
                              ? 'text-[#7DDBD3]'
                              : 'text-[#1a5c54]'
                            : darkMode
                              ? 'text-gray-500'
                              : 'text-gray-400'
                        }`}
                      >
                        {selected && <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
                        {selected ? 'Selected' : 'Select'}
                      </span>
                    </span>

                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          darkMode
                            ? 'border-gray-700 bg-gray-900 text-gray-300'
                            : 'border-gray-200 bg-gray-100 text-gray-600'
                        }`}
                      >
                        <Download className="w-3 h-3" aria-hidden="true" /> {size}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          darkMode
                            ? 'border-gray-700 bg-gray-900 text-gray-300'
                            : 'border-gray-200 bg-gray-100 text-gray-600'
                        }`}
                      >
                        RAM ~{model.ramGb} GB
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          darkMode
                            ? 'border-gray-700 bg-gray-900 text-gray-300'
                            : 'border-gray-200 bg-gray-100 text-gray-600'
                        }`}
                      >
                        {model.quantization}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          darkMode
                            ? 'border-gray-700 bg-gray-900 text-gray-300'
                            : 'border-gray-200 bg-gray-100 text-gray-600'
                        }`}
                      >
                        {model.languages}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          darkMode
                            ? 'border-gray-700 bg-gray-900 text-gray-300'
                            : 'border-gray-200 bg-gray-100 text-gray-600'
                        }`}
                      >
                        {model.params} params · {model.license}
                      </span>
                    </span>

                    <span className={`block text-[11px] leading-relaxed ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      {model.verdict}
                    </span>

                    <span
                      className={`block text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}
                    >
                      {digestMissing
                        ? 'digest not pinned yet'
                        : `sha256 ${String(model.sha256).slice(0, 12)}…`}
                    </span>
                  </button>

                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                      Not installed
                    </span>
                    <button
                      type="button"
                      disabled
                      title="Benchmarking arrives in Phase 3"
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold cursor-not-allowed opacity-60 ${
                        darkMode
                          ? 'border-gray-800 bg-gray-900/60 text-gray-500'
                          : 'border-gray-200 bg-gray-50 text-gray-400'
                      }`}
                    >
                      <Gauge className="w-3 h-3" aria-hidden="true" /> Run benchmark
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ModelCatalogList;
