/**
 * SermonAssistSafetyPanel.jsx — Phase 6, on screen.
 *
 * Plan section 5.6: on a shared church laptop, the operator needs to see three
 * things without hunting for them — what the machine is allowed to use, whether
 * the engine has been suspended for exceeding it, and what redaction does and
 * does not catch.
 *
 * ## The one rule this panel must not break
 *
 * It may not tell the user the feature is safe when it is not. Specifically:
 * the redaction caveat is rendered NEXT TO the redaction toggle rather than
 * behind a "learn more", because a privacy feature that hides its own limits
 * is worse than no privacy feature — it manufactures trust it cannot back up.
 */
import React, { useState } from 'react';
import useSpeechStore from '../../context/SpeechStore';
import EraseSermonAssistCard from './EraseSermonAssistCard';
// From shared/, NOT main/: the disclosure must travel with the behaviour, and
// importing a node-only module into a renderer bundle would fail the build.
import { REDACTION_LIMITS } from '../../../shared/speech/redaction.js';

/**
 * @param {object} props
 * @param {object} props.limits from `speech:guardrail-limits`; null while loading
 * @param {object|null} props.guardrail the engine's current guardrail state
 * @param {(message: string) => void} [props.onErase] not used by the panel itself
 */
const SermonAssistSafetyPanel = ({ darkMode = true, cardClass, titleClass, limits = null, guardrail = null }) => {
  const historyEnabled = useSpeechStore((state) => state.historyEnabled);
  const setHistoryEnabled = useSpeechStore((state) => state.setHistoryEnabled);
  const noticeDismissed = useSpeechStore((state) => state.guardrailNoticeDismissed);
  const dismissGuardrailNotice = useSpeechStore((state) => state.dismissGuardrailNotice);
  const [redactionEnabled, setRedactionEnabled] = useState(true);

  const card = cardClass ?? 'rounded-xl border p-5 space-y-4';
  const title = titleClass ?? 'text-[11px] font-bold uppercase tracking-wider';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const border = darkMode ? 'border-gray-800' : 'border-gray-200';

  // A dismissal applies to the trip the user already saw. A NEW trip must be
  // shown again — the count next to it is what tells the two apart.
  const showSuspended = guardrail?.status === 'suspended' && noticeDismissed !== true;

  return (
    <div className="space-y-6" data-testid="sermon-assist-safety">
      {/* ---------------------------------------------------- resource limits */}
      <section className={card} data-testid="safety-limits-card">
        <h3 className={title}>What this computer allows</h3>

        {limits ? (
          <>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs" data-testid="safety-limits">
              {/* formatMb already carries its own unit — appending " MB" here
                  produced "4.8 GB MB". */}
              <Limit label="Memory ceiling" value={formatMb(limits.memoryMb)} hint="of this computer" />
              <Limit label="Installed" value={formatMb(limits.totalMemMb)} hint="total memory" />
              <Limit label="CPU ceiling" value={`${Math.round(limits.cpuFraction * 100)}%`} hint="of all cores" />
              <Limit label="Cores" value={String(limits.cpuCount)} hint="detected" />
              <Limit
                label="Times suspended"
                value={String(guardrail?.trips ?? 0)}
                hint="this session"
              />
            </dl>

            {/* Why the number is what it is. A limit with no reason looks
                arbitrary, and an arbitrary limit is one a user will raise. */}
            <p className={`text-xs ${muted}`} data-testid="safety-limits-rationale">
              The memory limit is {Math.round(limits.memoryFraction * 100)}% of this machine
              {limits.memoryMb !== limits.memoryMbByFraction
                ? `, capped at ${formatMb(limits.memoryMbCeiling)} MB`
                : ''}
              . It is calculated from this computer rather than fixed, because an 8 GB laptop and a
              64 GB desktop need different limits.
            </p>
          </>
        ) : (
          <p className={`text-xs ${muted}`} data-testid="safety-limits-loading">
            Working out what this computer can safely spare…
          </p>
        )}

        {showSuspended ? (
          <div
            className={`rounded-lg border p-3 text-xs leading-relaxed text-amber-300 ${border}`}
            role="status"
            data-testid="safety-suspended"
          >
            <span className="font-semibold">Transcription was suspended to protect this computer.</span>{' '}
            <p className={`mt-1 ${muted}`}>{guardrail?.lastMessage}</p>
            <p className={`mt-1 ${muted}`}>
              A smaller model will use far less of everything. This is not a fault — it is what
              happens when a large model meets a small machine.
            </p>
          </div>
        ) : null}

        {/* Dismiss the NOTICE only. The limits themselves are unchanged and
            still in force — a button that both hid the warning and raised the
            limit would be a trap, and the copy says so. */}
        {showSuspended ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="safety-dismiss"
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                darkMode
                  ? 'border-gray-700 bg-gray-900 text-gray-200'
                  : 'border-gray-300 bg-white text-gray-700'
              }`}
              onClick={dismissGuardrailNotice}
            >
              I understand — hide this
            </button>
            <p className={`self-center text-[11px] ${muted}`}>
              Hiding this does not raise the limit. Transcription will be suspended again if the
              machine is still over it.
            </p>
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------------------ privacy */}
      <section className={card} data-testid="safety-privacy-card">
        <h3 className={title}>Transcripts on this computer</h3>

        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            data-testid="safety-history-toggle"
            checked={Boolean(historyEnabled)}
            onChange={(event) => setHistoryEnabled(event.target.checked)}
          />
          <span>
            <span className="font-semibold">Save transcripts after each service</span>
            <p className={`${muted} mt-0.5`}>
              On by default, so you can search a service later. Turn it off and nothing is written
              at all — the transcript exists only while you are using it.
            </p>
          </span>
        </label>

        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            data-testid="safety-redaction-toggle"
            checked={redactionEnabled}
            onChange={(event) => setRedactionEnabled(event.target.checked)}
          />
          <span>
            <span className="font-semibold">Remove personal details before saving</span>
            <p className={`${muted} mt-0.5`}>{REDACTION_LIMITS.caveat}</p>
          </span>
        </label>

        {/* The caveat sits beside the toggle, never behind a link. */}
        {redactionEnabled ? (
          <div
            className={`rounded-lg border p-3 text-xs leading-relaxed ${border}`}
            data-testid="safety-redaction-limits"
          >
            <p className="font-semibold">It looks for:</p>
            <ul className={`mt-1 list-disc pl-5 ${muted}`}>
              {REDACTION_LIMITS.covers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="font-semibold mt-2">It cannot find:</p>
            <ul className={`mt-1 list-disc pl-5 ${muted}`}>
              {REDACTION_LIMITS.misses.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* -------------------------------------------------------------- erase */}
      <EraseSermonAssistCard darkMode={darkMode} />
    </div>
  );
};

/** One limit, with the reason it exists rather than the number alone. */
function Limit({ label, value, hint }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider opacity-70">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
      {hint ? <p className="text-[10px] opacity-60">{hint}</p> : null}
    </div>
  );
}

/**
 * MB rendered with its own unit.
 *
 * Kept local so the panel does not import from main/ at render time. The unit
 * is part of the returned string on purpose: an earlier version returned "4.8"
 * and the caller appended " MB", which rendered "4.8 GB MB".
 */
function formatMb(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`;
}

export default SermonAssistSafetyPanel;
export { formatMb };