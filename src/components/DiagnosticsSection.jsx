import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCopy, FileText, RefreshCw } from 'lucide-react';
import { getDiagnosticsEntries } from '../utils/diagnosticsLog';

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
};

const bridge = () => (typeof window === 'undefined' ? null : window.electronAPI?.diagnostics ?? null);

/**
 * DiagnosticsSection — the support journal, readable and copyable.
 *
 * The app keeps a detailed log (timings, outcomes, counts, error codes —
 * never transcript, audio, token, or verse text) in
 * `lyricdisplay-diagnostics.log`. This section shows where that file lives,
 * how big it is, and copies its tail to the clipboard in one press, so an
 * operator reporting "it doesn't work" can paste the facts instead of
 * describing them.
 *
 * Without the Electron bridge (browser build, unit tests) there is no log
 * file; the button then copies the in-memory ring instead, and says so.
 */
const DiagnosticsSection = ({ darkMode = false }) => {
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [copyState, setCopyState] = useState('idle');

  const refresh = useCallback(async () => {
    const api = bridge();
    if (!api?.info) {
      setInfo({ source: 'memory', entries: getDiagnosticsEntries().length });
      return;
    }
    try {
      const result = await api.info();
      setInfo(result.ok ? { ...result, source: 'file' } : { ...result, source: 'file' });
    } catch (error) {
      setInfo({ ok: false, reason: 'unreachable', error: error?.message || String(error), source: 'file' });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const copyLogs = useCallback(async () => {
    setCopyState('working');
    setStatus(null);
    try {
      const api = bridge();
      let text = '';
      let where = '';
      if (api?.read) {
        const result = await api.read({ maxBytes: 256 * 1024 });
        if (!result?.ok) throw new Error(result?.error || result?.reason || 'Log file is not available.');
        text = result.content || '';
        where = result.path || '';
        if (result.truncated) text = `… (tail of ${where}; older lines omitted) …\n${text}`;
      } else {
        // No bridge: the ring is the log.
        text = getDiagnosticsEntries()
          .map((entry) => {
            const details = entry.details ? ` ${JSON.stringify(entry.details)}` : '';
            return `[${entry.ts}] [${String(entry.level).toUpperCase()}] [${entry.category}] ${entry.message}${details}`;
          })
          .join('\n');
        where = 'in-memory session log (no Electron bridge)';
      }
      if (!text) {
        setStatus('The log is empty — use the app for a bit, then copy again.');
        setCopyState('idle');
        return;
      }
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setStatus(`Copied ${formatBytes(text.length)} from ${where || 'the log'}.`);
      setCopyState('done');
    } catch (error) {
      setStatus(`Could not copy the log: ${error?.message || String(error)}`);
      setCopyState('idle');
    }
  }, []);

  const cardClass = `rounded-xl border p-5 space-y-4 transition-all ${
    darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white'
  }`;
  const labelClass = `text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`;
  const mutedClass = `text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`;

  return (
    <div className="space-y-5">
      <div>
        <h3 className={`text-base font-semibold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          <FileText className="w-5 h-5" /> Diagnostics
        </h3>
        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          A detailed journal of what the app did — timings, outcomes, and error codes from Bible display
          to Sermon Assist. Never transcript text, audio, or secrets.
        </p>
      </div>

      <div className={cardClass} data-testid="diagnostics-card">
        <div className="space-y-1.5">
          <span className={labelClass}>Support log</span>
          <p className={mutedClass}>
            {info?.source === 'file'
              ? info?.ok
                ? `Log file: ${info.path} (${formatBytes(info.bytes)}).`
                : `Log file: ${info?.path || 'not available yet'} (${info?.reason || 'unknown'}).`
              : `In-memory session log (${info?.entries ?? getDiagnosticsEntries().length} entries). The file appears when running in Electron.`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={copyLogs}
            disabled={copyState === 'working'}
            data-testid="diagnostics-copy-logs"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors bg-[#1a5c54] text-white hover:bg-[#134a43] disabled:opacity-60"
          >
            <ClipboardCopy className="w-3.5 h-3.5" aria-hidden="true" />
            {copyState === 'working' ? 'Copying…' : copyState === 'done' ? 'Copied' : 'Copy logs'}
          </button>
          <button
            type="button"
            onClick={refresh}
            data-testid="diagnostics-refresh"
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold ${
              darkMode
                ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Refresh
          </button>
        </div>

        {status ? (
          <p data-testid="diagnostics-status" className={mutedClass} role="status">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default DiagnosticsSection;
