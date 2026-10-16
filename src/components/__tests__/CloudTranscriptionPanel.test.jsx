/**
 * CloudTranscriptionPanel — the promises the panel makes about other people's
 * audio.
 *
 * The headline assertion is that the panel never asks for a key it cannot
 * store and never shows a checked box the operator did not tick. A consent
 * dialog that is wrong in either direction is worse than none.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CloudTranscriptionPanel from '@/components/Speech/CloudTranscriptionPanel';
import useSpeechStore, { speechDefaults } from '@/context/SpeechStore';
import { CLOUD_ACK_TEXT, CLOUD_COST_TEXT, CLOUD_ACK_VERSION } from '../../../shared/speech/cloudPolicy.js';

const KEY = 'dg_live_0123456789abcdef0123456789';

const PROVIDERS = [
  { id: 'assemblyai', name: 'AssemblyAI', copy: 'Diarisation.', docUrl: 'https://example.test/a' },
  { id: 'deepgram', name: 'Deepgram', copy: 'Fastest.', docUrl: 'https://example.test/d' },
  { id: 'gcp', name: 'Google Cloud STT', copy: 'Dialects.', docUrl: 'https://example.test/g' },
];

/** A main reply, as speechCloudIpc builds it. */
const statusOf = (over = {}) => ({
  ok: true,
  providers: PROVIDERS,
  ackText: CLOUD_ACK_TEXT,
  ackVersion: CLOUD_ACK_VERSION,
  costText: CLOUD_COST_TEXT,
  steps: [],
  canStart: false,
  blockedBy: 'no-cloud-provider',
  blockedMessage: 'Choose which speech provider should receive your audio.',
  keyStoreAvailable: true,
  keyStoreReason: '',
  acknowledged: false,
  provider: null,
  ...over,
});

const resetStore = () => {
  useSpeechStore.setState({ ...speechDefaults(), benchmarkRunningId: null });
};

/** Install a bridge. Each function is a spy the test can shape. */
function installBridge({ status = statusOf(), cloudKey, cloudAcknowledge } = {}) {
  const bridge = {
    cloudStatus: vi.fn(async () => status),
    cloudKey: vi.fn(cloudKey ?? (async () => ({ ok: true, masked: '\u2022\u2022\u2022\u20226789' }))),
    cloudAcknowledge: vi.fn(cloudAcknowledge ?? (async ({ acknowledged }) => ({ ok: true, acknowledged }))),
  };
  window.electronAPI = { speech: bridge };
  return bridge;
}

describe('CloudTranscriptionPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    window.electronAPI = undefined;
  });

  afterEach(() => {
    delete window.electronAPI;
    vi.restoreAllMocks();
  });

  it('asks for the three steps in order, cheapest first', async () => {
    installBridge();
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-transcription-panel')).toBeInTheDocument());
    expect(screen.getByTestId('cloud-step-1')).toHaveTextContent('Choose a provider');
    expect(screen.getByTestId('cloud-step-2')).toHaveTextContent('Save an API key');
    expect(screen.getByTestId('cloud-step-3')).toHaveTextContent('Confirm audio leaves this computer');
  });

  // The panel must not paraphrase what main enforces.
  it('shows the exact wording main enforces, not a paraphrase', async () => {
    installBridge();
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-ack-text')).toHaveTextContent(/sent over the internet/i));
    expect(screen.getByTestId('cloud-ack-text')).toHaveTextContent(CLOUD_ACK_TEXT);
    expect(screen.getByTestId('cloud-ack-text')).toHaveTextContent(CLOUD_COST_TEXT);
  });

  it('never starts checked', async () => {
    installBridge();
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-ack-checkbox')).toBeInTheDocument());
    expect(screen.getByTestId('cloud-ack-checkbox')).not.toBeChecked();
  });

  it('does not even offer the box until the wording has loaded', async () => {
    installBridge({ status: statusOf({ ackText: undefined }) });
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-ack-checkbox')).toBeDisabled());
    expect(screen.getByTestId('cloud-ack-text')).toHaveTextContent(/Loading the exact wording/i);
  });

  it('records a yes only when the box is actually ticked', async () => {
    const bridge = installBridge();
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-ack-checkbox')).toBeEnabled());

    expect(bridge.cloudAcknowledge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('cloud-ack-checkbox'));
    await waitFor(() =>
      expect(bridge.cloudAcknowledge).toHaveBeenCalledWith({ acknowledged: true })
    );
  });

  it('withdrawing the yes is possible, and says what it means', async () => {
    const bridge = installBridge({ status: statusOf({ acknowledged: true, canStart: true, blockedBy: null }) });
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-ack-checkbox')).toBeChecked());

    fireEvent.click(screen.getByTestId('cloud-ack-checkbox'));
    await waitFor(() =>
      expect(bridge.cloudAcknowledge).toHaveBeenCalledWith({ acknowledged: false })
    );
    await waitFor(() => expect(screen.getByTestId('cloud-notice')).toHaveTextContent(/will not start/i));
  });

  it('refuses to ask for a key when the computer cannot store one safely', async () => {
    const bridge = installBridge({
      status: statusOf({
        keyStoreAvailable: false,
        keyStoreReason: 'This computer has no secure key store available right now.',
      }),
    });
    useSpeechStore.setState({ cloudProviderId: 'deepgram' });
    render(<CloudTranscriptionPanel />);

    await waitFor(() => expect(screen.getByTestId('cloud-keystore-unavailable')).toBeInTheDocument());
    // No key box at all — asking for a secret we would have to store in the
    // clear is worse than asking for nothing.
    expect(screen.queryByTestId('cloud-key-input')).toBeNull();
    expect(screen.queryByTestId('cloud-save-key')).toBeNull();
    expect(bridge.cloudKey).not.toHaveBeenCalled();
  });

  it('asks for a provider before it asks for its key', async () => {
    installBridge();
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-key-needs-provider')).toBeInTheDocument());
    expect(screen.queryByTestId('cloud-key-input')).toBeNull();
  });

  it('sends the typed key once and then forgets it from the form', async () => {
    const bridge = installBridge();
    useSpeechStore.setState({ cloudProviderId: 'deepgram' });
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-key-input')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('cloud-key-input'), { target: { value: KEY } });
    fireEvent.click(screen.getByTestId('cloud-save-key'));
    await waitFor(() => expect(bridge.cloudKey).toHaveBeenCalledWith({ providerId: 'deepgram', key: KEY }));
    // Cleared the moment the request settles, successful or not.
    await waitFor(() => expect(screen.getByTestId('cloud-key-input')).toHaveValue(''));
  });

  it('clears the typed key even when the save fails', async () => {
    installBridge({ cloudKey: async () => ({ ok: false, code: 'key-store-unavailable', message: 'No secure key store on this computer.' }) });
    useSpeechStore.setState({ cloudProviderId: 'deepgram' });
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-key-input')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('cloud-key-input'), { target: { value: KEY } });
    fireEvent.click(screen.getByTestId('cloud-save-key'));

    await waitFor(() => expect(screen.getByTestId('cloud-notice')).toHaveTextContent(/No secure key store/i));
    expect(screen.getByTestId('cloud-key-input')).toHaveValue('');
  });

  it('never re-saves a key the operator has not typed', async () => {
    const bridge = installBridge();
    useSpeechStore.setState({ cloudProviderId: 'deepgram' });
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-save-key')).toBeDisabled());
    expect(bridge.cloudKey).not.toHaveBeenCalled();
  });

  it('shows a stored key as a mask and offers to remove it', async () => {
    const bridge = installBridge({
      status: statusOf({
        provider: { id: 'deepgram', stored: true, masked: '\u2022\u2022\u2022\u20226789', usable: true },
      }),
    });
    useSpeechStore.setState({ cloudProviderId: 'deepgram' });
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-key-stored')).toHaveTextContent('6789'));

    // Only four characters, and never the whole key.
    expect(screen.getByTestId('cloud-key-stored')).not.toHaveTextContent(KEY);

    fireEvent.click(screen.getByTestId('cloud-forget-key'));
    await waitFor(() =>
      expect(bridge.cloudKey).toHaveBeenCalledWith({ providerId: 'deepgram', clear: true })
    );
  });

  it('says plainly when there was no key to remove', async () => {
    installBridge({
      cloudKey: async () => ({ ok: true, removed: false }),
      status: statusOf({ provider: { id: 'deepgram', stored: true, masked: '\u20226789', usable: true } }),
    });
    useSpeechStore.setState({ cloudProviderId: 'deepgram' });
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-forget-key')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('cloud-forget-key'));
    await waitFor(() => expect(screen.getByTestId('cloud-notice')).toHaveTextContent(/no saved key to remove/i));
  });

  // The gate's verdict is shown, not recomputed — so the UI cannot be more
  // optimistic than what main will actually allow.
  it('shows the refusal main returned, verbatim', async () => {
    installBridge({
      status: statusOf({
        canStart: false,
        blockedBy: 'cloud-not-acknowledged',
        blockedMessage: CLOUD_ACK_TEXT,
      }),
    });
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-gate-blocked')).toHaveTextContent(CLOUD_ACK_TEXT));
  });

  it('shows no refusal banner once the gate is satisfied', async () => {
    installBridge({
      status: statusOf({
        canStart: true,
        blockedBy: null,
        blockedMessage: '',
        acknowledged: true,
        provider: { id: 'deepgram', stored: true, masked: '\u20226789', usable: true },
      }),
    });
    useSpeechStore.setState({ cloudProviderId: 'deepgram' });
    render(<CloudTranscriptionPanel />);
    await waitFor(() => expect(screen.getByTestId('cloud-ack-checkbox')).toBeChecked());
    expect(screen.queryByTestId('cloud-gate-blocked')).toBeNull();
  });

  it('renders without a bridge at all, rather than throwing', () => {
    expect(() => render(<CloudTranscriptionPanel />)).not.toThrow();
    expect(screen.getByTestId('cloud-transcription-panel')).toBeInTheDocument();
  });
  });
