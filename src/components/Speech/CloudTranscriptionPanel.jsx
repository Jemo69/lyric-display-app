/**
 * CloudTranscriptionPanel.jsx — sending a sermon off this computer (Phase 5).
 *
 * ## What this panel is built around
 *
 * Three steps, cheapest first: choose a provider, save a key, confirm. That
 * order is not cosmetic — choosing a provider asks for nothing and is
 * reversible, while the confirmation is the one that actually commits someone
 * to sending audio to a third party. It comes last because it should.
 *
 * ## Two rules this component cannot break
 *
 * 1. The wording shown and the wording enforced are the SAME string. Both come
 *    from main (shared/speech/cloudPolicy.js) — the panel imports no copy of
 *    its own, because a consent dialog that describes something other than
 *    what is checked is a consent dialog that means nothing.
 * 2. The typed key is sent once and then forgotten. It is held in component
 *    state for the length of one request and cleared in a finally block, so a
 *    failed save does not leave it sitting in a re-renderable tree.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import useSpeechStore from '../../context/SpeechStore';
import { KeyRound, ExternalLink, Trash2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
// The provider LIST is static data, so it renders from the shared constant
// rather than waiting on IPC — and keeps working if main cannot be reached.
// The STATUS (keys, acknowledgement, the gate) still comes only from main,
// because only main knows what is actually stored.
import { CLOUD_PROVIDERS } from '../../../shared/speech/cloudPolicy.js';

const bridge = () => (typeof window === 'undefined' ? null : window.electronAPI?.speech ?? null);

const CloudTranscriptionPanel = ({ darkMode = true, cardClass, labelClass, mutedClass, badgeBase }) => {
  const cloudProviderId = useSpeechStore((state) => state.cloudProviderId);
  const setCloudProviderId = useSpeechStore((state) => state.setCloudProviderId);

  const [status, setStatus] = useState(null);
  const [draftKey, setDraftKey] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [cloudProviderId]);

  /** One read on mount. The gate changes when the operator changes something, so a poll would be a second source of truth. */
  const refresh = useCallback(async () => {
    const speech = bridge();
    if (!speech?.cloudStatus) return;
    try {
      // The selection travels with the request: main otherwise only learns
      // which provider is chosen from speech:start, so the panel would report on
      // a stale provider while the gate checked a different one.
      const next = await speech.cloudStatus({ where: 'cloud', cloudProviderId });
      if (mounted.current) setStatus(next?.ok ? next : null);
    } catch {
      // No report: the panel renders its own "not available" copy rather
      // than a guess about whether a key is stored.
      if (mounted.current) setStatus(null);
    }
  }, [cloudProviderId]);

  useEffect(() => {
    refresh();
  }, [refresh, cloudProviderId]);

  /** Save the typed key, then forget it from component state either way. */
  const saveKey = useCallback(async () => {
    const speech = bridge();
    if (!speech?.cloudKey) return;
    const key = draftKey;
    setBusy(true);
    setNotice(null);
    try {
      const reply = await speech.cloudKey({ providerId: cloudProviderId, key });
      if (!mounted.current) return;
      setNotice(
        reply?.ok === false
          ? { tone: 'error', text: reply?.message ?? 'The key could not be saved.' }
          : { tone: 'ok', text: 'Key saved to this computer\u2019s secure key store. It cannot be read back.' }
      );
    } catch {
      if (mounted.current) setNotice({ tone: 'error', text: 'The key could not be saved.' });
    } finally {
      // Cleared unconditionally: the typed value has no reason to outlive the
      // request, successful or not.
      setDraftKey('');
      if (mounted.current) setBusy(false);
      refresh();
    }
  }, [cloudProviderId, draftKey, refresh]);

  const forgetKey = useCallback(async () => {
    const speech = bridge();
    if (!speech?.cloudKey) return;
    setBusy(true);
    try {
      const reply = await speech.cloudKey({ providerId: cloudProviderId, clear: true });
      if (!mounted.current) return;
      setNotice(
        reply?.removed === false
          ? { tone: 'ok', text: 'There was no saved key to remove.' }
          : { tone: 'ok', text: 'Key removed from this computer.' }
      );
    } catch {
      if (mounted.current) setNotice({ tone: 'error', text: 'The key could not be removed.' });
    } finally {
      if (mounted.current) setBusy(false);
      refresh();
    }
  }, [cloudProviderId, refresh]);

  /**
   * Record or withdraw the confirmation.
   *
   * Only ever sends `acknowledged: true` after the operator has ticked the box
   * AND read the text — the box is cleared of its own accord when the text
   * changes, so a stale yes cannot ride along with new wording.
   */
  const setAcknowledgement = useCallback(
    async (acknowledged) => {
      const speech = bridge();
      if (!speech?.cloudAcknowledge) return;
      try {
        await speech.cloudAcknowledge({ acknowledged });
        if (mounted.current) {
          setChecked(acknowledged);
          setNotice(
            acknowledged
              ? { tone: 'ok', text: 'Confirmed. Audio may be sent to your provider while Cloud is selected.' }
              : { tone: 'ok', text: 'Confirmation withdrawn. Cloud transcription will not start.' }
          );
        }
      } catch {
        if (mounted.current) setNotice({ tone: 'error', text: 'That answer could not be saved.' });
      }
      refresh();
    },
    [refresh]
  );

  // Main echoes the same constant; either source is the same list.
  const providers = status?.providers ?? CLOUD_PROVIDERS;
  const selected = providers.find((p) => p.id === cloudProviderId) ?? null;
  const storedForSelected = status?.provider?.id === cloudProviderId && status?.provider?.stored;
  const confirmed = status?.acknowledged === true;

  const card = cardClass ?? 'rounded-xl border p-5 space-y-4';
  const muted = mutedClass ?? 'text-gray-400';
  const border = darkMode ? 'border-gray-800' : 'border-gray-200';

  return (
    <div className={card} data-testid="cloud-transcription-panel">
      <div className="space-y-1.5">
        <span className={labelClass}>Cloud provider</span>
        <p className={muted}>
          Audio leaves this computer. The live feed may contain audio that is not in the
          published recording.
        </p>
      </div>

      {/* Step 1 — cheapest first. */}
      <div className="space-y-2">
        <Step n={1} label="Choose a provider" done={Boolean(selected)} />
        <div role="radiogroup" aria-label="Cloud provider" className="space-y-2">
          {providers.map((provider) => {
            const isSelected = cloudProviderId === provider.id;
            return (
              <div
                key={provider.id}
                className={`rounded-lg border p-3 space-y-2 transition-colors ${
                  isSelected ? 'border-[#7DDBD3] bg-[#7DDBD3]/10' : darkMode ? 'border-gray-800 bg-gray-900/40' : 'border-gray-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  // The OLD test id, kept so the settings tests that describe
                  // this surface keep working. Renaming a handle is not a
                  // refactor — it is breaking every assertion pointed at it.
                  data-testid={'speech-cloud-provider-' + provider.id}
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
                  <span className={`${badgeBase ?? 'rounded-full px-2 py-0.5 text-[10px] font-semibold'} shrink-0`}>
                    {isSelected ? 'Selected' : 'Select'}
                  </span>
                </button>

                <a
                  href={provider.docUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={`inline-flex items-center gap-1 text-[11px] underline ${muted}`}
                >
                  <ExternalLink className="w-3 h-3" />
                  Where to find my key
                </a>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 2 — the key. */}
      <div className="space-y-2">
        <Step n={2} label="Save an API key" done={storedForSelected === true} />

        {status && status.keyStoreAvailable === false ? (
          <p className="text-xs text-amber-400" data-testid="cloud-keystore-unavailable" role="status">
            {status.keyStoreReason ||
              'This computer has no secure key store, so LyricDisplay will not save your API key. Use “This Device” instead.'}
          </p>
        ) : selected ? (
          <div className="space-y-2">
            {storedForSelected ? (
              <div className={`flex items-center justify-between gap-2 rounded-lg border p-2 text-xs ${border}`}>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span data-testid="cloud-key-stored">
                    Saved — {status?.provider?.masked || 'hidden'}
                  </span>
                </span>
                <button
                  type="button"
                  data-testid="cloud-forget-key"
                  onClick={forgetKey}
                  disabled={busy}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 font-semibold ${darkMode ? 'border-gray-700 text-gray-300' : 'border-gray-300 text-gray-600'}`}
                >
                  <Trash2 className="w-3 h-3" />
                  Remove
                </button>
              </div>
            ) : null}

            <label className="flex items-center gap-2">
              <KeyRound className={`w-3.5 h-3.5 shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draftKey}
                onChange={(event) => setDraftKey(event.target.value)}
                placeholder={storedForSelected ? 'Replace the saved key' : `${selected.name} API key`}
                aria-label={`${selected.name} API key`}
                data-testid="cloud-key-input"
                className={`h-8 text-xs ${darkMode ? 'bg-gray-950 border-gray-800' : 'bg-white'}`}
              />
              <button
                type="button"
                data-testid="cloud-save-key"
                onClick={saveKey}
                disabled={busy || draftKey.trim().length === 0}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${darkMode ? 'border-gray-700 bg-gray-900 text-gray-200' : 'border-gray-300 bg-white text-gray-700'}`}
              >
                Save key
              </button>
            </label>
            <p className={`text-[11px] leading-relaxed ${muted}`}>
              The key is encrypted by this computer\u2019s operating system before it is written,
              and there is no way to read it back out of LyricDisplay. If this computer has no
              secure key store, the key is not saved at all rather than saved in the clear.
            </p>
          </div>
        ) : (
          <p className={`text-xs ${muted}`} data-testid="cloud-key-needs-provider">
            Choose a provider first, then paste the key from their dashboard.
          </p>
        )}
      </div>

      {/* Step 3 — the commitment. */}
      <div className="space-y-2">
        <Step n={3} label="Confirm audio leaves this computer" done={confirmed} />
        <div className={`rounded-lg border p-3 text-xs leading-relaxed ${border}`} data-testid="cloud-ack-text">
          <p>{status?.ackText ?? 'Loading the exact wording you would be agreeing to…'}</p>
          <p className={`mt-2 ${muted}`}>{status?.costText ?? ''}</p>

          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              data-testid="cloud-ack-checkbox"
              checked={confirmed}
              onChange={(event) => setAcknowledgement(event.target.checked)}
              disabled={!status?.ackText}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold">I understand that audio is sent to {selected?.name ?? 'my provider'} and billed to me.</span>
              <span className={`block ${muted}`}>You can withdraw this at any time, and switching to This Device stops sending audio immediately.</span>
            </span>
          </label>
        </div>
      </div>

      {/* The gate's own verdict, rendered from main's answer rather than
          recomputed here — two implementations of a consent check is one too
          many, and only main knows what is actually stored. */}
      {status && status.canStart === false && status.blockedBy ? (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${border} ${confirmed ? '' : 'text-amber-300'}`}
          role="status"
          data-testid="cloud-gate-blocked"
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{status.blockedMessage}</span>
        </div>
      ) : null}

      {notice ? (
        <p
          className={`text-xs ${notice.tone === 'error' ? 'text-red-400' : muted}`}
          role="status"
          data-testid="cloud-notice"
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
};

/** One numbered step. Done state visible without reading the whole card. */
function Step({ n, label, done }) {
  return (
    <p className="text-xs flex items-center gap-2" data-testid={`cloud-step-${n}`}>
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold ${
          done ? 'border-emerald-500 text-emerald-400' : 'border-gray-600 text-gray-500'
        }`}
      >
        {done ? '\u2713' : n}
      </span>
      <span className={done ? 'line-through opacity-70' : ''}>{label}</span>
    </p>
  );
}

export default CloudTranscriptionPanel;
