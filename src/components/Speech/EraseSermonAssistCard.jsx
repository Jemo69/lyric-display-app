/**
 * EraseSermonAssistCard.jsx — one-click full erase (Phase 6, invariant 6).
 *
 * Plan 5.6: "A single action removes the engine directory, every model file,
 * the transcript history, the benchmark results, and the stored key, and
 * reports the bytes reclaimed. With history on by default this matters — a
 * shared church laptop is not a private machine, and the user should not have
 * to hunt for leftovers."
 *
 * ## Why this is two clicks and not one
 *
 * Because a real number is not available without looking. The confirmation
 * says "about 3.1 GB of downloaded models and 12 saved transcripts", and that
 * sentence comes from actually walking the disk. A single-click erase can
 * only say "this cannot be undone" — which is the one sentence that trains
 * people to click through destructive dialogs without reading them.
 *
 * So: preview → confirm. The preview touches nothing.
 *
 * ## What this card does NOT pretend
 *
 * The benchmark results live in localStorage, not on disk. The main process
 * cannot reach them, so `speech:uninstall` reports `rendererCleanup` and this
 * component does the clearing itself. If that hand-off ever broke, results
 * would survive the erase — so the card re-reads its own store afterwards and
 * says plainly when something is still there.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import useSpeechStore from '../../context/SpeechStore';

const bridge = () => (typeof window === 'undefined' ? null : window.electronAPI?.speech ?? null);

/**
 * Two-click erase with a real preview.
 *
 * @param {object} props
 * @param {boolean} [props.darkMode=true]
 * @param {string} [props.cardClass]
 * @param {string} [props.titleClass]
 */
const EraseSermonAssistCard = ({ darkMode = true, cardClass, titleClass }) => {
  const clearBenchmarkResults = useSpeechStore((state) => state.clearBenchmarkResults);
  const benchmarkResults = useSpeechStore((state) => state.benchmarkResults) ?? [];

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const card = cardClass ?? 'rounded-xl border p-5 space-y-3';
  const title = titleClass ?? 'text-[11px] font-bold uppercase tracking-wider';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const border = darkMode ? 'border-gray-800' : 'border-gray-200';
  const buttonClass = `rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
    darkMode
      ? 'border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
  }`;
  const dangerClass = `rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
    darkMode
      ? 'border-red-900 bg-red-950 text-red-200 hover:bg-red-900'
      : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
  }`;

  /** Walk the disk. Read-only — a preview must not be able to delete anything. */
  const loadPreview = useCallback(async () => {
    const speech = bridge();
    if (!speech || typeof speech.uninstall !== 'function') {
      setPreviewError('Erase is only available in the desktop app.');
      return;
    }
    setPreviewError(null);
    try {
      const reply = await speech.uninstall({ confirm: false });
      if (!mountedRef.current) return;
      if (!reply || reply.ok === false) {
        setPreviewError(reply?.message ?? 'Could not work out what would be removed.');
        return;
      }
      setPreview(reply);
    } catch {
      if (mountedRef.current) setPreviewError('Could not work out what would be removed.');
    }
  }, []);

  /**
   * The destructive half. Only reachable from an explicit confirm click.
   *
   * The renderer cleanup happens HERE, not in main, because the store is a
   * renderer module — and it happens even when some filesystem step failed, so
   * a partial erase still clears what it can rather than leaving measured
   * results describing a machine that no longer has those models.
   */
  const erase = useCallback(async () => {
    const speech = bridge();
    if (!speech || typeof speech.uninstall !== 'function') return;

    setBusy(true);
    try {
      const reply = await speech.uninstall({ confirm: true });
      if (!mountedRef.current) return;

      // Clear our own half. `rendererCleanup` is main's declaration of what it
      // could not do; acting on a name main invented would be trusting a
      // string, so this is an explicit local action instead.
      clearBenchmarkResults();

      setConfirming(false);
      setResult(reply);
      setPreview(null);
      await loadPreview();
    } catch {
      if (mountedRef.current) {
        setPreviewError('The erase could not be completed.');
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [clearBenchmarkResults, loadPreview]);

  const nothingToRemove = preview && preview.exists === false;

  return (
    <section aria-label="Erase sermon assist data" className={card} data-testid="erase-card">
      <h3 className={title}>Erase everything</h3>

      <p className={`text-xs leading-relaxed ${muted}`}>
        Removes every downloaded model, every saved transcript, and the speech engine itself from
        this computer, and reports how much space that frees. Useful before lending the machine
        to someone else, or after a service you would rather no one else could read.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="erase-preview"
          className={buttonClass}
          onClick={loadPreview}
          disabled={busy}
        >
          See what would be removed
        </button>

        {confirming ? (
          <>
            <button
              type="button"
              data-testid="erase-confirm"
              className={dangerClass}
              onClick={erase}
              disabled={busy}
            >
              {busy ? 'Erasing…' : 'Yes, erase it all'}
            </button>
            <button
              type="button"
              data-testid="erase-cancel"
              className={buttonClass}
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Keep it
            </button>
          </>
        ) : null}
      </div>

      {previewError ? (
        <p className="text-xs text-red-400" data-testid="erase-error">
          {previewError}
        </p>
      ) : null}

      {preview && !nothingToRemove ? (
        <div
          className={`rounded-lg border p-3 text-xs leading-relaxed ${border}`}
          data-testid="erase-preview-message"
          role="status"
        >
          {preview.message}
        </div>
      ) : null}

      {/* "Nothing to remove" is a real, useful answer — not an error, and not a
          button that then deletes nothing. */}
      {nothingToRemove ? (
        <div
          className={`rounded-lg border p-3 text-xs leading-relaxed ${border}`}
          data-testid="erase-nothing-to-remove"
          role="status"
        >
          {preview.message}
        </div>
      ) : null}

      {preview && !nothingToRemove && !confirming ? (
        <button
          type="button"
          data-testid="erase-start"
          className={dangerClass}
          onClick={() => setConfirming(true)}
          disabled={busy}
        >
          Erase everything
        </button>
      ) : null}

      {result ? (
        <div
          className={`rounded-lg border p-3 text-xs leading-relaxed ${
            result.errorCount > 0 ? 'text-amber-300' : ''
          } ${border}`}
          data-testid="erase-result"
          role="status"
        >
          <p>{result.message}</p>
          {result.engineStopped ? (
            <p className={`mt-1 ${muted}`}>The engine was stopped before the files were removed.</p>
          ) : null}
          {/* The honesty check. If the store still holds rows after an erase
              that claimed success, say so rather than let the user believe
              this button did everything. */}
          {benchmarkResults.length > 0 ? (
            <p className="mt-1 text-amber-400" data-testid="erase-results-survived">
              {benchmarkResults.length} benchmark result
              {benchmarkResults.length === 1 ? '' : 's'} still on screen. Close and reopen the
              app to clear them.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default EraseSermonAssistCard;