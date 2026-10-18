/**
 * QuoteLaneOptIn.jsx — consent for the quote lane (Phase 7).
 *
 * WHY THIS COMPONENT EXISTS AND WHY IT IS SEPARATE.
 *
 * The quote lane is the first thing in Live Sermon Assist that would send the
 * pastor's actual words to a third party. Cloud transcription sends AUDIO to a
 * provider and gets text back; that is bad and it is gated. This sends the
 * transcript — mid-sentence, including anything not in the published
 * recording — to a model that reasons over it. A different promise, so a
 * different gate.
 *
 * TWO RULES THIS COMPONENT CANNOT BREAK.
 *
 * 1. THE WORDING SHOWN AND THE WORDING ENFORCED ARE THE SAME STRING. Both come
 *    from shared/speech/quotePolicy.js. This file imports no copy of its own,
 *    because a consent dialog that describes something other than what is
 *    checked is a consent dialog that means nothing.
 *
 * 2. IT IS OFF, AND STAYING OFF IS THE DEFAULT. There is no auto-detect, no
 *    "just this once", no preselected provider. The lane begins disabled and a
 *    provider must be chosen deliberately.
 *
 * THE ORDER IS THREE STEPS, CHEAPEST FIRST: choose a provider, save a key,
 * confirm. Choosing a provider asks for nothing and is reversible; the
 * confirmation is the one that actually commits someone to sending sermon text
 * somewhere, so it comes last.
 *
 * NO KEY IS STORED HERE. The typed key goes to main, which puts it in the
 * existing safeStorage keyring, and the component's own copy is cleared in a
 * finally block — so a failed save does not leave it sitting in a
 * re-renderable tree.
 */

import React, { useEffect, useState } from 'react';
import useSpeechStore from '../../context/SpeechStore';
import {
  consentTextFor,
  egressFor,
  quoteLaneState,
  selectableQuoteProviders,
} from '../../../shared/speech/quotePolicy.js';

const bridge = () => (typeof window === 'undefined' ? null : window.electronAPI?.speech ?? null);

/**
 * @param {object} props
 * @param {boolean} [props.enabled] the Sermon Assist master switch
 */
const QuoteLaneOptIn = ({ darkMode = true, enabled = true, cardClass, titleClass }) => {
  const providerId = useSpeechStore((state) => state.quoteProviderId);
  const setQuoteProviderId = useSpeechStore((state) => state.setQuoteProviderId);
  const quoteConsented = useSpeechStore((state) => state.quoteConsented);
  const setQuoteConsented = useSpeechStore((state) => state.setQuoteConsented);
  const quoteKeyReady = useSpeechStore((state) => state.quoteKeyReady);
  const setQuoteKeyReady = useSpeechStore((state) => state.setQuoteKeyReady);

  const [draftKey, setDraftKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [checked, setChecked] = useState(false);

  const card = cardClass ?? 'rounded-xl border p-5 space-y-4';
  const title = titleClass ?? 'text-[11px] font-bold uppercase tracking-wider';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';

  const provider = selectableQuoteProviders().find((entry) => entry.id === providerId) ?? null;
  const lane = quoteLaneState({ providerId, consented: quoteConsented, providerReady: quoteKeyReady });
  const egress = egressFor(providerId);

  // Choosing a different provider invalidates a consent given for the previous
  // one. Consent to send text to Ollama is not consent to send it to OpenAI, and
  // leaving the box ticked across a provider change would be exactly the kind of
  // "it remembers what you agreed to" surprise this gate exists to prevent.
  useEffect(() => {
    setChecked(false);
    setDraftKey('');
    setNotice(null);
  }, [providerId]);

  const saveKey = async () => {
    const speech = bridge();
    if (!speech?.quoteSetKey || !draftKey.trim()) return;
    setBusy(true);
    try {
      const ok = await speech.quoteSetKey({ providerId, apiKey: draftKey.trim() });
      if (ok?.ok) {
        setQuoteKeyReady(true);
        setNotice('Key saved to this machine.');
      } else {
        setNotice(ok?.error || 'That key was not accepted.');
      }
    } catch {
      setNotice('Could not save the key.');
    } finally {
      // Cleared unconditionally: a failed save must not leave a key sitting in
      // a component tree that can re-render.
      setDraftKey('');
      setBusy(false);
    }
  };

  const applyConsent = () => {
    if (!checked) {
      setNotice('Tick the box to confirm before turning the lane on.');
      return;
    }
    setQuoteConsented(true);
    setNotice('Quote lane on for this service.');
  };

  if (!enabled) return null;

  return (
    <div className="space-y-4" data-testid="quote-lane-opt-in">
      <div className={card} data-testid="quote-lane-card">
        <h3 className={title}>Sermon quote suggestions (optional)</h3>

        <p className={`text-xs leading-snug ${muted}`}>
          Off by default. When on, the app looks for a quotable takeaway in the live
          transcript and offers it as a note for you to keep or discard. It never puts
          anything on the screens.
        </p>

        {/* step 1 — provider */}
        <div className="space-y-2">
          <label className={`block text-xs font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            Where should the transcript be analysed?
          </label>
          <select
            data-testid="quote-provider-select"
            value={providerId ?? 'none'}
            onChange={(event) => setQuoteProviderId(event.target.value)}
            className="w-full rounded-md border border-gray-600 bg-transparent px-2 py-1.5 text-xs"
          >
            <option value="none">Not configured</option>
            {selectableQuoteProviders().map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          {provider ? (
            <p data-testid="quote-provider-note" className={`text-[11px] ${muted}`}>
              {provider.description}
            </p>
          ) : null}
        </div>

        {/* step 2 — key, only when the provider needs one */}
        {provider?.requiresKey ? (
          <div className="space-y-2">
            <label className={`block text-xs font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              API key for {provider.name}
            </label>
            <input
              data-testid="quote-key-input"
              type="password"
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              placeholder="Stored encrypted on this machine"
              className="w-full rounded-md border border-gray-600 bg-transparent px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              data-testid="quote-save-key"
              disabled={busy || !draftKey.trim()}
              onClick={saveKey}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                darkMode
                  ? 'border-gray-600 text-gray-200 disabled:opacity-40'
                  : 'border-gray-400 text-gray-700 disabled:opacity-40'
              }`}
            >
              {busy ? 'Saving…' : 'Save key'}
            </button>
            {quoteKeyReady ? (
              <p data-testid="quote-key-ready" className={`text-[11px] ${muted}`}>
                A key is saved for {provider.name}.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* step 3 — the consent that actually matters, so it comes last */}
        {provider ? (
          <div className="space-y-2 border-t border-gray-700 pt-3">
            <p data-testid="quote-consent-text" className={`text-xs leading-snug ${muted}`}>
              {consentTextFor(provider.id)}
            </p>
            {egress === 'remote' ? (
              <p data-testid="quote-egress-warning" className={`text-xs font-semibold ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                This sends sermon text off this computer.
              </p>
            ) : null}
            <label className="flex items-start gap-2 text-xs">
              <input
                data-testid="quote-consent-checkbox"
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
                className="mt-0.5"
              />
              <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                I understand what leaves this machine, and I want this on for this service.
              </span>
            </label>
            {quoteConsented ? (
              <button
                type="button"
                data-testid="quote-turn-off"
                onClick={() => setQuoteConsented(false)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  darkMode ? 'border-gray-600 text-gray-200' : 'border-gray-400 text-gray-700'
                }`}
              >
                Turn off for this service
              </button>
            ) : (
              <button
                type="button"
                data-testid="quote-turn-on"
                disabled={!checked}
                onClick={applyConsent}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                  darkMode ? 'border-violet-500/60 text-violet-300' : 'border-violet-400 text-violet-700'
                }`}
              >
                Turn on for this service
              </button>
            )}
          </div>
        ) : null}

        {notice ? (
          <p data-testid="quote-lane-notice" className={`text-[11px] ${muted}`}>
            {notice}
          </p>
        ) : null}

        <p data-testid="quote-lane-reason" data-enabled={String(lane.enabled)} className={`text-[11px] ${muted}`}>
          {lane.enabled
            ? 'On for this service.'
            : lane.reason}
        </p>
      </div>
    </div>
  );
};

export default QuoteLaneOptIn;