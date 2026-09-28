import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import UserPreferencesModal from '@/components/UserPreferencesModal';
import useSpeechStore, { speechDefaults } from '@/context/SpeechStore';
import { modelsForProvider } from 'shared/speech';

const getState = () => useSpeechStore.getState();

const resetSpeechStore = () => {
  useSpeechStore.setState({
    ...speechDefaults(),
    status: 'idle',
    health: null,
    lastError: null,
  });
};

const renderLocalAi = () =>
  render(<UserPreferencesModal darkMode={false} onClose={() => {}} initialSection="localAi" />);

// Full-suite runs transform and mount 60+ files at once, and the first render
// of the whole preferences modal can cross vitest's 5s default purely from
// load. These tests are synchronous and I/O-free — give them headroom rather
// than letting contention flake them. Assertions are unchanged.
const itRenders = (name, fn) => it(name, fn, 30000);

describe('SpeechSettingsSection (User Preferences > Speech & AI)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSpeechStore();
  });

  itRenders('is reachable from the preferences sidebar as its own section', () => {
    renderLocalAi();
    expect(screen.getByRole('button', { name: /Speech & AI/ })).toBeInTheDocument();
    expect(screen.getByTestId('speech-enable-toggle')).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Where Sermon Assist runs' })
    ).toBeInTheDocument();
  });

  itRenders('wires the audio source picker, cold, into the Audio Source card', () => {
    renderLocalAi();

    // Disabled: the picker renders its one-line prompt and never touches a device.
    expect(screen.getByTestId('audio-source-picker-disabled')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-source-picker')).not.toBeInTheDocument();

    // Enabled: the picker mounts, still cold — status stays 'idle', so no
    // permission request and no enumeration happened merely by rendering it.
    fireEvent.click(screen.getByTestId('speech-enable-toggle'));
    expect(screen.getByTestId('audio-source-picker')).toBeInTheDocument();
    // Idle means cold: the only affordance is the explicit "choose" button, so
    // mounting the settings section has not requested a microphone.
    expect(screen.getByTestId('audio-source-choose')).toBeInTheDocument();
    expect(getState().enabled).toBe(true);
    expect(screen.queryByTestId('audio-source-picker-disabled')).not.toBeInTheDocument();
  });

  itRenders('starts OFF on a fresh store and only flips on an explicit user click', () => {
    renderLocalAi();
    const toggle = screen.getByTestId('speech-enable-toggle');

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(getState().enabled).toBe(false);
    expect(screen.getByText('Sermon Assist is OFF')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(getState().enabled).toBe(true);
    expect(screen.getByText('Sermon Assist is ON')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(getState().enabled).toBe(false);
    expect(screen.getByText('Sermon Assist is OFF')).toBeInTheDocument();
  });

  itRenders('keeps the catalog visible (but visibly inert) while disabled', () => {
    renderLocalAi();
    expect(getState().enabled).toBe(false);
    expect(screen.getByTestId('speech-config-inert-note')).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-testid^="speech-model-"]')
    ).toHaveLength(12);
    expect(
      document.querySelector('[aria-disabled="true"]')
    ).not.toBeNull();
  });

  itRenders('defaults the three-way control to This Device with local copy first', () => {
    renderLocalAi();
    expect(screen.getByTestId('speech-where-local')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByTestId('speech-where-network')).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByTestId('speech-where-cloud')).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByText('Audio stays on this computer.')).toBeInTheDocument();
  });

  itRenders('reveals the cloud block on Cloud and clears cloudProviderId on This Device', () => {
    renderLocalAi();
    expect(screen.queryByTestId('speech-cloud-block')).toBeNull();

    fireEvent.click(screen.getByTestId('speech-where-cloud'));
    expect(screen.getByTestId('speech-cloud-block')).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Cloud provider' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('speech-cloud-provider-groq'));
    expect(getState().cloudProviderId).toBe('groq');
    expect(
      screen.getByTestId('speech-settings-mode')
    ).toHaveTextContent('Cloud · groq');

    fireEvent.click(screen.getByTestId('speech-where-local'));
    expect(screen.queryByTestId('speech-cloud-block')).toBeNull();
    expect(getState().cloudProviderId).toBeNull();
    expect(
      screen.getByTestId('speech-settings-mode')
    ).toHaveTextContent('Local · large-v3');
  });

  itRenders('reaches a working local provider without entering a key', () => {
    renderLocalAi();

    // No cloud form, no API-key field, while `where` is local.
    expect(screen.queryByTestId('speech-cloud-block')).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();

    const whispercpp = screen.getByTestId('speech-provider-whispercpp');
    expect(whispercpp).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(whispercpp);
    expect(getState().providerId).toBe('whispercpp');
    expect(getState().cloudProviderId).toBeNull();

    // The "needs nothing installed" provider is in the recommended pair.
    expect(screen.getByTestId('speech-provider-osondevice')).toBeInTheDocument();
    expect(screen.getByText('No install needed')).toBeInTheDocument();
  });

  itRenders('lists all 12 whisper.cpp models with large-v3 selected, badged, and open on the default', () => {
    expect(modelsForProvider('whispercpp')).toHaveLength(12);
    renderLocalAi();

    expect(
      document.querySelectorAll('[data-testid^="speech-model-"]')
    ).toHaveLength(12);

    const largeV3 = screen.getByTestId('speech-model-large-v3');
    expect(largeV3).toHaveAttribute('aria-pressed', 'true');
    expect(within(largeV3).getByText('Default')).toBeInTheDocument();
    expect(
      within(largeV3).getByText(
        'Best accuracy in the catalog — recommended for capable hardware.'
      )
    ).toBeInTheDocument();
    expect(within(largeV3).getByText(/2\.9 GiB/)).toBeInTheDocument();
    // large-v3 has a pinned sha256, so no digest note — and never "null".
    expect(
      within(largeV3).queryByText('digest not pinned yet')
    ).toBeNull();
    expect(largeV3.textContent).not.toContain('null');

    // An unpinned digest is stated honestly, never rendered as `null`.
    const q8 = screen.getByTestId('speech-model-large-v3-q8_0');
    expect(
      within(q8).getByText('digest not pinned yet')
    ).toBeInTheDocument();
    expect(q8.textContent).not.toContain('null');

    // Benchmark affordance exists, honestly disabled.
    const benchmark = within(q8.closest('li')).getByRole('button', {
      name: /Run benchmark/,
    });
    expect(benchmark).toBeDisabled();
    expect(benchmark).toHaveAttribute('title', 'Benchmarking arrives in Phase 3');

    // Selecting another model moves the selection.
    fireEvent.click(q8);
    expect(getState().modelId).toBe('large-v3-q8_0');
    expect(q8).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('speech-model-large-v3')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  itRenders('shows an honest empty model state (and capability gating) for sherpaonnx', () => {
    renderLocalAi();

    fireEvent.click(screen.getByRole('button', { name: /Show all providers/ }));
    expect(screen.getByTestId('speech-provider-sherpaonnx')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('speech-provider-sherpaonnx'));
    expect(getState().providerId).toBe('sherpaonnx');

    expect(
      screen.getByText('No downloadable models for this provider')
    ).toBeInTheDocument();
    expect(screen.getByText(/onnx supplied separately/)).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-testid^="speech-model-"]')
    ).toHaveLength(0);

    // Capability gaps are stated, never silent.
    expect(
      screen.getByText(/Sermon profile biasing/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Capabilities are reported by the engine/)
    ).toBeInTheDocument();
  });

  itRenders('always shows an accurate mode indicator', () => {
    renderLocalAi();
    const mode = screen.getByTestId('speech-settings-mode');

    expect(mode).toHaveTextContent('Local · large-v3');

    fireEvent.click(screen.getByTestId('speech-where-network'));
    expect(mode).toHaveTextContent('Remote engine');

    fireEvent.click(screen.getByTestId('speech-where-cloud'));
    expect(mode).toHaveTextContent('Cloud · not configured');

    fireEvent.click(screen.getByTestId('speech-cloud-provider-deepgram'));
    expect(mode).toHaveTextContent('Cloud · deepgram');
  });

  itRenders('resets every Sermon Assist setting in one click and stays off', () => {
    renderLocalAi();

    fireEvent.click(screen.getByTestId('speech-enable-toggle'));
    fireEvent.click(screen.getByTestId('speech-where-cloud'));
    fireEvent.click(screen.getByTestId('speech-cloud-provider-openai'));
    fireEvent.click(screen.getByRole('button', { name: /Show all providers/ }));
    fireEvent.click(screen.getByTestId('speech-provider-vosk'));
    expect(getState().enabled).toBe(true);

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset all Sermon Assist settings' })
    );

    expect(getState()).toMatchObject({
      ...speechDefaults(),
      status: 'idle',
      health: null,
      lastError: null,
    });
    expect(getState().enabled).toBe(false);
    expect(getState().cloudProviderId).toBeNull();
    expect(
      screen.getByTestId('speech-settings-mode')
    ).toHaveTextContent('Local · large-v3');
  });

  itRenders('AGENTS.md guard: Import Bible Translation stays available in User Preferences > Bible', () => {
    render(<UserPreferencesModal darkMode={false} onClose={() => {}} initialSection="bible" />);

    expect(
      screen.getByRole('button', { name: 'Import Bible Translation' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Zefania, OSIS, Beblia, and OpenSong/)).toBeInTheDocument();
  });
});
