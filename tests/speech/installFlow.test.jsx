/**
 * tests/speech/installFlow.test.jsx — Live Sermon Assist Phase 2.
 *
 * The renderer half of the install flow, against a stubbed
 * `window.electronAPI.speech` bridge (no Electron, no network, no download):
 *
 *   - a cold render starts NOTHING (install is only ever a user click),
 *   - not-installed -> downloading -> installed -> first-benchmark-pending,
 *   - Cancel really sends `{ modelId, cancel: true }`,
 *   - failures surface as one sentence that names the offline drop-in
 *     directory,
 *   - the catalog's per-model states: Install / Resume / Installed, and a
 *     click on an installed card goes through speech:select-model.
 *
 * The target model defaults to the store's modelId (large-v3) — installing
 * the best model, not the smallest.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import UserPreferencesModal from '@/components/UserPreferencesModal';
import { chooseModelAfterInstall } from '@/components/Speech/InstallEngineWizard';
import useSpeechStore, { speechDefaults } from '@/context/SpeechStore';
import { modelsForProvider } from 'shared/speech';

const MODELS_DIR = '/home/user/.config/LyricDisplay/speech-engine/models';

// These tests transform and mount the whole preferences modal while the rest
// of the suite runs; the assertions are synchronous, so give them headroom
// rather than letting load contention flake them.
const itFlow = (name, fn) => it(name, fn, 30000);

const emptyInstallState = () => ({
  available: false,
  mode: 'none',
  endpoint: null,
  entry: null,
  reason: 'no engine installed',
  modelsDir: MODELS_DIR,
  installed: [],
  partials: [],
  activeDownloads: [],
});

/** A deterministic stand-in for the preload speech bridge. */
const createBridge = (installState = emptyInstallState()) => {
  const state = { installState };
  const listeners = { progress: [], installState: [], error: [] };
  const subscribe = (key, callback) => {
    listeners[key].push(callback);
    return () => {
      listeners[key] = listeners[key].filter((entry) => entry !== callback);
    };
  };

  let pendingInstall = null;

  const speech = {
    installCalls: [],
    selectCalls: [],
    getState: vi.fn(async () => ({
      ok: true,
      status: 'idle',
      running: false,
      installState: state.installState,
    })),
    install: vi.fn((payload) => {
      speech.installCalls.push(payload);
      if (payload?.cancel === true) {
        const pending = pendingInstall;
        pendingInstall = null;
        pending?.resolve({ ok: false, code: 'cancelled', message: 'Download cancelled.' });
        return Promise.resolve({
          ok: true,
          cancelled: true,
          modelId: payload.modelId,
          bytesReclaimed: 4096,
        });
      }
      // The real download is long-lived: hold the promise open until the
      // test decides how it settles.
      return new Promise((resolve) => {
        pendingInstall = { resolve };
      });
    }),
    selectModel: vi.fn(async (payload) => {
      speech.selectCalls.push(payload);
      return { ok: true, verified: true, modelId: payload.modelId, digestSource: 'catalog-sha256' };
    }),
    onProgress: (callback) => subscribe('progress', callback),
    onInstallState: (callback) => subscribe('installState', callback),
    onError: (callback) => subscribe('error', callback),
    emit: (key, payload) => [...listeners[key]].forEach((callback) => callback(payload)),
    setInstallState: (next) => {
      state.installState = next;
    },
    currentInstallState: () => state.installState,
    resolveInstall: (result) => {
      const pending = pendingInstall;
      pendingInstall = null;
      pending?.resolve(result);
    },
  };
  return speech;
};

const renderPrefs = () =>
  // Experimental, not a first-class "localAi" section — see
  // tests/SpeechSettingsSection.test.jsx for why that was reversed.
  render(<UserPreferencesModal darkMode={false} onClose={() => {}} initialSection="experimental" />);

const resetStore = () => {
  useSpeechStore.setState({
    ...speechDefaults(),
    status: 'idle',
    health: null,
    lastError: null,
  });
};

describe('install flow (renderer, stubbed bridge)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    delete window.electronAPI;
  });

  afterEach(() => {
    delete window.electronAPI;
  });

  itFlow('renders cold: no install, no download, catalog still lists 12 models', async () => {
    const bridge = createBridge();
    window.electronAPI = { speech: bridge };

    renderPrefs();
    await screen.findByTestId('speech-install-not-installed');

    // Reading state is allowed; acting is not.
    expect(bridge.getState).toHaveBeenCalled();
    expect(bridge.install).not.toHaveBeenCalled();
    expect(bridge.selectModel).not.toHaveBeenCalled();

    // The default target is the store's model — large-v3, the best model.
    expect(screen.getByText('Install Large v3')).toBeInTheDocument();
    expect(useSpeechStore.getState().modelId).toBe('large-v3');

    // The offline drop-in directory is stated up front, not only on failure.
    const dropin = screen.getByTestId('speech-install-dropin');
    expect(dropin).toHaveTextContent('ggml-large-v3.bin');
    expect(dropin).toHaveTextContent(MODELS_DIR);

    // Per-card states are honest before anything is installed.
    expect(screen.getByTestId('speech-card-status-large-v3')).toHaveTextContent('Not installed');
    expect(
      document.querySelectorAll('[data-testid^="speech-model-"]')
    ).toHaveLength(modelsForProvider('whispercpp').length);

    // Hardware never gates the install; it only shapes later recommendations.
    expect(screen.getByText(/never blocks this install/)).toBeInTheDocument();
  });

  itFlow('walks not-installed -> downloading -> installed -> first-benchmark-pending', async () => {
    const bridge = createBridge();
    window.electronAPI = { speech: bridge };

    renderPrefs();
    await screen.findByTestId('speech-install-not-installed');

    fireEvent.click(screen.getByTestId('speech-install-start'));
    expect(bridge.install).toHaveBeenCalledWith({ modelId: 'large-v3' });

    // The wizard flips to downloading the moment the click lands.
    await screen.findByTestId('speech-install-downloading');
    expect(screen.getByTestId('speech-install-progress')).toBeInTheDocument();

    act(() =>
      bridge.emit('progress', {
        taskId: 'download:large-v3',
        modelId: 'large-v3',
        receivedBytes: 1555000000,
        totalBytes: 3110000000,
        mbps: 12.5,
      })
    );
    const bar = screen.getByRole('progressbar', { name: /Downloading Large v3/ });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText(/12\.5 MB\/s/)).toBeInTheDocument();

    // The download finishes: main republishes install state, then answers.
    bridge.setInstallState({
      ...emptyInstallState(),
      installed: [
        {
          id: 'large-v3',
          fileName: 'ggml-large-v3.bin',
          bytes: 3110000000,
          sha256: '64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2',
          digestRecorded: true,
          sizeMatchesRecord: true,
          source: 'download',
        },
      ],
      activeDownloads: [],
    });
    act(() => bridge.emit('installState', bridge.currentInstallState()));
    bridge.resolveInstall({ ok: true, modelId: 'large-v3', digestSource: 'catalog-sha256' });

    const installedCard = await screen.findByTestId('speech-install-installed');
    expect(installedCard).toHaveTextContent('Large v3 is installed');
    expect(installedCard).toHaveTextContent('digest verified against the recorded checksum');

    fireEvent.click(screen.getByTestId('speech-install-continue'));
    const pending = screen.getByTestId('speech-install-benchmark-pending');
    // Model verified on disk. The copy must NOT promise a transcript: this
    // platform may not ship an engine (macOS does not yet), and saying "this
    // is the model that will transcribe" is the same class of overclaim that
    // pulled the previous release — just moved from the badge to the prose.
    expect(pending).toHaveTextContent('Large v3 is downloaded and verified');
    expect(pending).toHaveTextContent(/Windows and Linux bundle whisper\.cpp/i);
    expect(pending).toHaveTextContent(/macOS\s+does not yet/i);
    expect(pending).not.toHaveTextContent(/is the model that will transcribe/i);
    expect(pending).not.toHaveTextContent(/test scaffold/i);
    expect(pending).not.toHaveTextContent(/nothing will transcribe/i);
    expect(pending).not.toHaveTextContent(/Ready to transcribe/);
    expect(pending).not.toHaveTextContent(/is what loads/);

    const benchmark = screen.getByTestId('speech-install-benchmark');
    expect(benchmark).toBeDisabled();
    expect(benchmark).toHaveAttribute('title', 'Benchmarking arrives in Phase 3');
    expect(pending).toHaveTextContent(/only ever recommends/);

    // Nothing else fired: no uninstall, no benchmark, no extra install.
    expect(bridge.install).toHaveBeenCalledTimes(1);
  });

  itFlow('sends the documented cancel payload and stops showing progress', async () => {
    const bridge = createBridge();
    window.electronAPI = { speech: bridge };

    renderPrefs();
    await screen.findByTestId('speech-install-not-installed');

    fireEvent.click(screen.getByTestId('speech-install-start'));
    await screen.findByTestId('speech-install-downloading');
    expect(screen.getByTestId('speech-install-cancel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('speech-install-cancel'));
    await waitFor(() =>
      expect(bridge.installCalls).toContainEqual({ modelId: 'large-v3', cancel: true })
    );

    // The cancelled install resolves as cancelled: no error banner, back to
    // the not-installed state.
    await screen.findByTestId('speech-install-not-installed');
    expect(screen.queryByTestId('speech-install-error')).not.toBeInTheDocument();
  });

  itFlow('surfaces a failed download as one sentence naming the drop-in directory', async () => {
    const bridge = createBridge();
    window.electronAPI = { speech: bridge };

    renderPrefs();
    await screen.findByTestId('speech-install-not-installed');

    fireEvent.click(screen.getByTestId('speech-install-start'));
    await screen.findByTestId('speech-install-downloading');

    bridge.resolveInstall({
      ok: false,
      code: 'network-unreachable',
      message:
        'Could not reach the model host (ECONNREFUSED). Offline install: place ' +
        `ggml-large-v3.bin into ${MODELS_DIR} — the app detects it on the next launch.`,
    });

    const error = await screen.findByTestId('speech-install-error');
    expect(error).toHaveTextContent(MODELS_DIR);
    expect(error).toHaveTextContent('ggml-large-v3.bin');
    // Still resumable from the user's point of view: the Install action is back.
    expect(screen.getByTestId('speech-install-start')).toBeInTheDocument();
    expect(screen.queryByTestId('speech-install-downloading')).not.toBeInTheDocument();
  });

  itFlow('resumes a kept partial: the card offers Resume and says how much is left', async () => {
    const bridge = createBridge({
      ...emptyInstallState(),
      partials: [
        { id: 'base.en-q8_0', fileName: 'ggml-base.en-q8_0.bin', receivedBytes: 100, totalBytes: 1000 },
      ],
    });
    window.electronAPI = { speech: bridge };

    renderPrefs();
    await waitFor(() =>
      expect(screen.getByTestId('speech-card-status-base.en-q8_0')).toHaveTextContent(
        'Paused · 10% downloaded'
      )
    );

    const resume = screen.getByTestId('speech-card-install-base.en-q8_0');
    expect(resume).toHaveTextContent('Resume');
    fireEvent.click(resume);
    expect(bridge.install).toHaveBeenCalledWith({ modelId: 'base.en-q8_0' });
  });

  itFlow('marks an installed card Installed, and clicking it verifies via speech:select-model', async () => {
    const bridge = createBridge({
      ...emptyInstallState(),
      installed: [
        {
          id: 'large-v3-q5_0',
          fileName: 'ggml-large-v3-q5_0.bin',
          bytes: 1610000000,
          digestRecorded: true,
          sizeMatchesRecord: true,
          source: 'download',
        },
      ],
    });
    window.electronAPI = { speech: bridge };

    renderPrefs();
    await waitFor(() =>
      expect(screen.getByTestId('speech-card-status-large-v3-q5_0')).toHaveTextContent('Installed')
    );
    expect(screen.getByTestId('speech-card-status-large-v3')).toHaveTextContent('Not installed');
    expect(screen.queryByTestId('speech-card-install-large-v3-q5_0')).not.toBeInTheDocument();

    const card = screen.getByTestId('speech-model-large-v3-q5_0');
    fireEvent.click(card);
    expect(bridge.selectModel).toHaveBeenCalledWith({ modelId: 'large-v3-q5_0' });

    await waitFor(() => expect(useSpeechStore.getState().modelId).toBe('large-v3-q5_0'));
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('speech-card-status-large-v3-q5_0')).toHaveTextContent('Active');
    await waitFor(() => expect(screen.queryByTestId('speech-card-error-large-v3-q5_0')).toBeNull());
  });

  itFlow('refuses to select a model that fails verification, and says why on the card', async () => {
    const bridge = createBridge({
      ...emptyInstallState(),
      installed: [
        {
          id: 'large-v3-q5_0',
          fileName: 'ggml-large-v3-q5_0.bin',
          bytes: 1610000000,
          digestRecorded: false,
          sizeMatchesRecord: false,
          source: 'drop-in',
        },
      ],
    });
    bridge.selectModel.mockResolvedValueOnce({
      ok: false,
      code: 'digest-mismatch',
      message: `The installed ggml-large-v3-q5_0.bin does not match its recorded digest. Delete it from ${MODELS_DIR} and install it again.`,
    });
    window.electronAPI = { speech: bridge };

    renderPrefs();
    await waitFor(() =>
      expect(screen.getByTestId('speech-card-status-large-v3-q5_0')).toHaveTextContent('Installed')
    );

    fireEvent.click(screen.getByTestId('speech-model-large-v3-q5_0'));

    const error = await screen.findByTestId('speech-card-error-large-v3-q5_0');
    expect(error).toHaveTextContent(MODELS_DIR);
    // The selection never committed.
    expect(useSpeechStore.getState().modelId).toBe('large-v3');
    expect(screen.getByTestId('speech-model-large-v3-q5_0')).toHaveAttribute('aria-pressed', 'false');
  });

  itFlow('never renders a dead benchmark control or an extra speech-model card', async () => {
    const bridge = createBridge();
    window.electronAPI = { speech: bridge };

    renderPrefs();
    await screen.findByTestId('speech-install-not-installed');

    // Exactly one card per catalog model — the wizard adds none.
    expect(
      document.querySelectorAll('[data-testid^="speech-model-"]')
    ).toHaveLength(modelsForProvider('whispercpp').length);
    // The wizard's own benchmark affordance is present but honestly disabled.
    const wizardInstall = within(screen.getByTestId('speech-install-wizard'));
    expect(wizardInstall.queryByRole('button', { name: /Run benchmark/ })).toBeNull();
    expect(bridge.install).not.toHaveBeenCalled();
  });

  itFlow('points the app at a model it just installed when nothing installed could run', async () => {
    const bridge = createBridge();
    window.electronAPI = { speech: bridge };

    renderPrefs();
    await screen.findByTestId('speech-install-not-installed');

    // The store starts on large-v3 (2.9 GB) — the catalog default, and not a
    // file on this machine.
    expect(useSpeechStore.getState().modelId).toBe('large-v3');

    fireEvent.click(screen.getByTestId('speech-card-install-tiny.en-q5_1'));
    expect(bridge.install).toHaveBeenCalledWith({ modelId: 'tiny.en-q5_1' });

    bridge.setInstallState({
      ...emptyInstallState(),
      installed: [
        {
          id: 'tiny.en-q5_1',
          fileName: 'ggml-tiny.en-q5_1.bin',
          bytes: 32166155,
          digestRecorded: true,
          sizeMatchesRecord: true,
          source: 'download',
        },
      ],
    });
    act(() => bridge.emit('installState', bridge.currentInstallState()));
    bridge.resolveInstall({ ok: true, modelId: 'tiny.en-q5_1', digestSource: 'catalog-sha256' });

    // The selection follows the install. Without this the app downloads a model,
    // reports success, and then starts the engine asking for weights that were
    // never on the machine — so the operator gets the canned engine anyway.
    await waitFor(() => expect(useSpeechStore.getState().modelId).toBe('tiny.en-q5_1'));
    expect(bridge.selectCalls).toContainEqual({ modelId: 'tiny.en-q5_1' });
  });

  itFlow('never displaces a selection that is installed and working', async () => {
    const bridge = createBridge({
      ...emptyInstallState(),
      installed: [
        {
          id: 'large-v3',
          fileName: 'ggml-large-v3.bin',
          bytes: 3110000000,
          digestRecorded: true,
          sizeMatchesRecord: true,
          source: 'download',
        },
      ],
    });
    window.electronAPI = { speech: bridge };

    renderPrefs();
    // The current choice is installed and selected, so its card reads
    // "Active" rather than "Installed" — either way it is usable, which is the
    // precondition this test needs.
    await waitFor(() =>
      expect(screen.getByTestId('speech-card-status-large-v3')).not.toHaveTextContent(
        'Not installed'
      )
    );

    // Download a second model while the first one is already usable. Switching
    // the active model here would change accuracy and latency mid-service
    // without anyone asking for it.
    fireEvent.click(screen.getByTestId('speech-card-install-base.en-q5_1'));
    bridge.setInstallState({
      ...emptyInstallState(),
      installed: [
        {
          id: 'large-v3',
          fileName: 'ggml-large-v3.bin',
          bytes: 3110000000,
          digestRecorded: true,
          sizeMatchesRecord: true,
          source: 'download',
        },
        {
          id: 'base.en-q5_1',
          fileName: 'ggml-base.en-q5_1.bin',
          bytes: 57000000,
          digestRecorded: true,
          sizeMatchesRecord: true,
          source: 'download',
        },
      ],
    });
    act(() => bridge.emit('installState', bridge.currentInstallState()));
    bridge.resolveInstall({ ok: true, modelId: 'base.en-q5_1', digestSource: 'catalog-sha256' });

    await waitFor(() => expect(bridge.install).toHaveBeenCalledWith({ modelId: 'base.en-q5_1' }));
    // The install settles (the wizard switches to its installed panel), then
    // the post-install decision runs. Flush it and assert it changed nothing.
    await screen.findByTestId('speech-install-installed');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(useSpeechStore.getState().modelId).toBe('large-v3');
    expect(bridge.selectCalls).toHaveLength(0);
  });

  itFlow('does not adopt a model whose download only joined a running task', async () => {
    const bridge = createBridge();
    window.electronAPI = { speech: bridge };

    renderPrefs();
    await screen.findByTestId('speech-install-not-installed');

    // A drop-in already on disk means the catalog can list the model as
    // installed while its download is still running — the corner where a
    // "joined" answer would otherwise be read as "finished".
    bridge.setInstallState({
      ...emptyInstallState(),
      installed: [
        {
          id: 'tiny.en-q5_1',
          fileName: 'ggml-tiny.en-q5_1.bin',
          bytes: 32166155,
          digestRecorded: true,
          sizeMatchesRecord: true,
          source: 'download',
        },
      ],
    });
    bridge.install.mockResolvedValueOnce({
      ok: true,
      taskId: 'download:tiny.en-q5_1',
      modelId: 'tiny.en-q5_1',
      state: 'downloading',
      alreadyRunning: true,
    });

    fireEvent.click(screen.getByTestId('speech-card-install-tiny.en-q5_1'));
    await waitFor(() => expect(bridge.install).toHaveBeenCalledWith({ modelId: 'tiny.en-q5_1' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // A joined download never reaches the selection decision: the proof is
    // that selectModel was never attempted and the store still names large-v3.
    // (The hook legitimately re-reads state via refresh() after the join
    // resolves, so no assertion is made on getState call counts.)
    expect(bridge.selectCalls).toHaveLength(0);
    expect(useSpeechStore.getState().modelId).toBe('large-v3');
  });

  itFlow('does not move the model under a running engine', async () => {
    const bridge = createBridge();
    window.electronAPI = { speech: bridge };
    bridge.getState.mockImplementation(async () => ({
      ok: true,
      status: 'running',
      running: true,
      installState: bridge.currentInstallState(),
    }));

    renderPrefs();
    await screen.findByTestId('speech-install-not-installed');

    // Main fixes the model at fork time (LD_SPEECH_MODEL), so moving the store
    // here would name a model the running process is not using.
    fireEvent.click(screen.getByTestId('speech-card-install-tiny.en-q5_1'));
    bridge.setInstallState({
      ...emptyInstallState(),
      installed: [
        {
          id: 'tiny.en-q5_1',
          fileName: 'ggml-tiny.en-q5_1.bin',
          bytes: 32166155,
          digestRecorded: true,
          sizeMatchesRecord: true,
          source: 'download',
        },
      ],
    });
    const stateCallsBefore = bridge.getState.mock.calls.length;
    act(() => bridge.emit('installState', bridge.currentInstallState()));
    bridge.resolveInstall({ ok: true, modelId: 'tiny.en-q5_1', digestSource: 'catalog-sha256' });

    // The panel still says "not installed" because the SELECTED model
    // (large-v3) is not the one just downloaded. What matters is that the
    // post-install decision ran and declined.
    await waitFor(() =>
      expect(bridge.getState.mock.calls.length).toBeGreaterThan(stateCallsBefore)
    );

    expect(bridge.selectCalls).toHaveLength(0);
    expect(useSpeechStore.getState().modelId).toBe('large-v3');
  });

  itFlow('keeps the old selection when select-model refuses the file', async () => {
    const bridge = createBridge();
    window.electronAPI = { speech: bridge };
    bridge.selectModel.mockImplementationOnce(async (payload) => {
      bridge.selectCalls.push(payload);
      return {
        ok: false,
        code: 'digest-mismatch',
        message: 'The file does not match the digest the catalog pinned.',
      };
    });

    renderPrefs();
    await screen.findByTestId('speech-install-not-installed');

    fireEvent.click(screen.getByTestId('speech-card-install-tiny.en-q5_1'));
    bridge.setInstallState({
      ...emptyInstallState(),
      installed: [
        {
          id: 'tiny.en-q5_1',
          fileName: 'ggml-tiny.en-q5_1.bin',
          bytes: 32166155,
          digestRecorded: true,
          sizeMatchesRecord: true,
          source: 'download',
        },
      ],
    });
    act(() => bridge.emit('installState', bridge.currentInstallState()));
    bridge.resolveInstall({ ok: true, modelId: 'tiny.en-q5_1', digestSource: 'catalog-sha256' });

    // It TRIED (the verified path, not a direct store write) and the refusal
    // left the previous choice in place.
    await waitFor(() => expect(bridge.selectCalls).toContainEqual({ modelId: 'tiny.en-q5_1' }));
    expect(useSpeechStore.getState().modelId).toBe('large-v3');
  });
});

describe('chooseModelAfterInstall (the decision table, in isolation)', () => {
  it('adopts the fresh install when the current model is not installed', () => {
    expect(
      chooseModelAfterInstall({
        currentModelId: 'large-v3',
        installedIds: ['tiny.en-q5_1'],
        justInstalledId: 'tiny.en-q5_1',
      })
    ).toBe('tiny.en-q5_1');
  });

  it('adopts the fresh install when nothing was selected at all', () => {
    expect(
      chooseModelAfterInstall({
        currentModelId: null,
        installedIds: ['tiny.en-q5_1'],
        justInstalledId: 'tiny.en-q5_1',
      })
    ).toBe('tiny.en-q5_1');
  });

  it('leaves a working selection alone', () => {
    expect(
      chooseModelAfterInstall({
        currentModelId: 'large-v3',
        installedIds: ['large-v3', 'tiny.en-q5_1'],
        justInstalledId: 'tiny.en-q5_1',
      })
    ).toBeNull();
  });

  it('does nothing when the finished download is not on disk', () => {
    expect(
      chooseModelAfterInstall({
        currentModelId: 'large-v3',
        installedIds: [],
        justInstalledId: 'tiny.en-q5_1',
      })
    ).toBeNull();
  });

  it('does nothing without an id to adopt', () => {
    expect(
      chooseModelAfterInstall({
        currentModelId: 'large-v3',
        installedIds: ['tiny.en-q5_1'],
        justInstalledId: '',
      })
    ).toBeNull();
  });

  it('tolerates a missing argument object', () => {
    expect(chooseModelAfterInstall()).toBeNull();
  });
});
