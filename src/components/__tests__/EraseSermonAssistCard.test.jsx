/**
 * EraseSermonAssistCard — the two-click erase, and what it refuses to claim.
 *
 * The headline test is `a preview that deleted something is a bug`, and the
 * second is `says so when benchmark results survive`. Between them they cover
 * the two ways an erase can lie: doing damage before consent, and reporting
 * success while data is still on screen.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import EraseSermonAssistCard from '@/components/Speech/EraseSermonAssistCard';
import useSpeechStore, { speechDefaults } from '@/context/SpeechStore';

const resetStore = () => {
  useSpeechStore.setState({ ...speechDefaults(), benchmarkRunningId: null });
};

/** A preview reply as main builds it. */
const previewOf = (over = {}) => ({
  ok: true,
  confirm: false,
  exists: true,
  bytesReclaimed: 3_100_000_000,
  steps: [{ id: 'models', exists: true, bytes: 3_100_000_000 }],
  message:
    'This permanently deletes downloaded models from this computer — about 3.1 GB. It cannot be undone.',
  ...over,
});

function installBridge(uninstall) {
  const fn = vi.fn(uninstall);
  window.electronAPI = { speech: { uninstall: fn } };
  return fn;
}

describe('EraseSermonAssistCard', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    window.electronAPI = undefined;
  });

  afterEach(() => {
    delete window.electronAPI;
    vi.restoreAllMocks();
  });

  it('starts cold: no preview, no delete, nothing called', () => {
    const uninstall = installBridge(async () => previewOf());
    render(<EraseSermonAssistCard />);

    // Rendering must never walk the disk or delete. The card opens inert.
    expect(uninstall).not.toHaveBeenCalled();
    expect(screen.queryByTestId('erase-confirm')).toBeNull();
    expect(screen.queryByTestId('erase-result')).toBeNull();
  });

  it('a preview requests confirm:false and deletes nothing', async () => {
    const uninstall = installBridge(async () => previewOf());
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));

    await waitFor(() => expect(screen.getByTestId('erase-preview-message')).toBeInTheDocument());
    expect(uninstall).toHaveBeenCalledWith({ confirm: false });
    // The delete button is NOT yet available — only "See what would be removed".
    expect(screen.queryByTestId('erase-confirm')).toBeNull();
    expect(screen.getByTestId('erase-start')).toBeInTheDocument();
  });

  it('deleting needs an explicit second click, and then sends confirm:true', async () => {
    const uninstall = installBridge(async (payload) =>
      payload?.confirm
        ? { ok: true, confirm: true, bytesReclaimed: 1024, removed: [], errorCount: 0, message: 'Removed everything and freed 1.0 KB.' }
        : previewOf()
    );
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));
    await waitFor(() => expect(screen.getByTestId('erase-start')).toBeInTheDocument());

    // First click only reveals the confirm button. Still no delete.
    fireEvent.click(screen.getByTestId('erase-start'));
    expect(screen.getByTestId('erase-confirm')).toBeInTheDocument();
    expect(uninstall).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalledWith({ confirm: true });

    fireEvent.click(screen.getByTestId('erase-confirm'));
    await waitFor(() => expect(uninstall).toHaveBeenCalledWith({ confirm: true }));
  });

  it('“Keep it” backs out without deleting', async () => {
    const uninstall = installBridge(async () => previewOf());
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));
    await waitFor(() => expect(screen.getByTestId('erase-start')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('erase-start'));
    fireEvent.click(screen.getByTestId('erase-cancel'));

    expect(screen.queryByTestId('erase-confirm')).toBeNull();
    expect(uninstall).not.toHaveBeenCalledWith({ confirm: true });
  });

  it('reports the bytes reclaimed', async () => {
    installBridge(async (payload) =>
      payload?.confirm
        ? { ok: true, confirm: true, bytesReclaimed: 3_100_000_000, removed: [], errorCount: 0, message: 'Removed everything and freed 3.1 GB.' }
        : previewOf()
    );
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));
    await waitFor(() => expect(screen.getByTestId('erase-start')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('erase-start'));
    fireEvent.click(screen.getByTestId('erase-confirm'));

    await waitFor(() => expect(screen.getByTestId('erase-result')).toHaveTextContent('3.1 GB'));
  });

  it('a partial failure is shown as a partial success, not a clean one', async () => {
    installBridge(async (payload) =>
      payload?.confirm
        ? {
            ok: false,
            confirm: true,
            bytesReclaimed: 1024,
            removed: [{ id: 'models', ok: false, code: 'EBUSY' }],
            errorCount: 1,
            message: 'Freed 1.0 KB, but 1 item(s) could not be removed. Close the app and try again.',
          }
        : previewOf()
    );
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));
    await waitFor(() => expect(screen.getByTestId('erase-start')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('erase-start'));
    fireEvent.click(screen.getByTestId('erase-confirm'));

    // The user must not read a partial failure as "done".
    await waitFor(() => {
      expect(screen.getByTestId('erase-result')).toHaveTextContent('could not be removed');
    });
  });

  it('says when the engine was stopped for the erase', async () => {
    installBridge(async (payload) =>
      payload?.confirm
        ? { ok: true, confirm: true, bytesReclaimed: 10, removed: [], errorCount: 0, engineStopped: true, message: 'Removed everything and freed 10 bytes.' }
        : previewOf()
    );
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));
    await waitFor(() => expect(screen.getByTestId('erase-start')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('erase-start'));
    fireEvent.click(screen.getByTestId('erase-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('erase-result')).toHaveTextContent(/stopped before the files/i);
    });
  });

  // The half of the erase that main physically cannot do. Benchmark results
  // live in localStorage; a store left populated after "done" is exactly the
  // failure this card has to surface rather than paper over.
  it('clears benchmark results, which live in localStorage and not on disk', async () => {
    useSpeechStore.getState().recordBenchmarkResult({
      measured: true,
      modelId: 'large-v3',
      wer: 0.04,
      rtf: 0.5,
    });
    expect(useSpeechStore.getState().benchmarkResults).toHaveLength(1);

    installBridge(async (payload) =>
      payload?.confirm
        ? { ok: true, confirm: true, bytesReclaimed: 10, removed: [], errorCount: 0, message: 'Removed everything and freed 10 bytes.' }
        : previewOf()
    );
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));
    await waitFor(() => expect(screen.getByTestId('erase-start')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('erase-start'));
    fireEvent.click(screen.getByTestId('erase-confirm'));

    await waitFor(() => expect(useSpeechStore.getState().benchmarkResults).toHaveLength(0));
    // And the persistence layer followed, so a restart cannot resurrect them.
    const blob = JSON.parse(localStorage.getItem('speech-store') ?? '{}');
    expect(blob.state.benchmarkResults).toEqual([]);
  });

  it('admit it when benchmark results are still there after an erase', async () => {
    // Simulates the hand-off breaking: main says it is done, the store is not.
    useSpeechStore.getState().recordBenchmarkResult({ measured: true, modelId: 'large-v3', wer: 0.04, rtf: 0.5 });
    const uninstall = installBridge(async (payload) =>
      payload?.confirm
        ? { ok: true, confirm: true, bytesReclaimed: 10, removed: [], errorCount: 0, message: 'Removed everything and freed 10 bytes.' }
        : previewOf()
    );
    // The clear fails: the bridge clears nothing and we stub the store action
    // to a no-op, which is what a broken hand-off looks like from the UI.
    useSpeechStore.setState({ clearBenchmarkResults: () => {} });
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));
    await waitFor(() => expect(screen.getByTestId('erase-start')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('erase-start'));
    fireEvent.click(screen.getByTestId('erase-confirm'));

    // The card does NOT claim a clean erase while rows remain.
    await waitFor(() => {
      expect(screen.getByTestId('erase-results-survived')).toHaveTextContent(
        /still on screen/i
      );
    });
    expect(uninstall).toHaveBeenCalledWith({ confirm: true });
  });

  it('“nothing to remove” is a normal answer, and offers no delete button', async () => {
    installBridge(async () =>
      previewOf({
        exists: false,
        bytesReclaimed: 0,
        steps: [],
        message:
          'There is nothing to remove — no models, transcripts, or engine files are stored on this computer.',
      })
    );
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));

    await waitFor(() => expect(screen.getByTestId('erase-nothing-to-remove')).toBeInTheDocument());
    expect(screen.getByTestId('erase-nothing-to-remove')).toHaveTextContent(/nothing to remove/i);
    // No confirm path for a machine with nothing on it.
    expect(screen.queryByTestId('erase-start')).toBeNull();
  });

  it('reports a failed preview as an error, and offers no delete', async () => {
    installBridge(async () => ({ ok: false, code: 'erase-plan-failed', message: 'Could not work out what to remove.' }));
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));

    await waitFor(() =>
      expect(screen.getByTestId('erase-error')).toHaveTextContent(/could not work out/i)
    );
    expect(screen.queryByTestId('erase-start')).toBeNull();
  });

  it('says the desktop app is required rather than failing silently', async () => {
    render(<EraseSermonAssistCard />);
    fireEvent.click(screen.getByTestId('erase-preview'));
    await waitFor(() =>
      expect(screen.getByTestId('erase-error')).toHaveTextContent(/only available in the desktop app/i)
    );
  });

  it('a thrown bridge does not leave the button stuck on “Erasing…”', async () => {
    installBridge(async () => {
      throw new Error('IPC exploded');
    });
    render(<EraseSermonAssistCard />);

    fireEvent.click(screen.getByTestId('erase-preview'));
    await waitFor(() =>
      expect(screen.getByTestId('erase-error')).toHaveTextContent(/could not work out/i)
    );
    expect(screen.getByTestId('erase-preview')).not.toBeDisabled();
  });
});