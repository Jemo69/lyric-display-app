import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';
import SermonAssistPanel from '../Speech/SermonAssistPanel';

const defaultState = () => ({
  ...speechDefaults(),
  status: 'idle',
  health: null,
  lastError: null,
});

describe('SermonAssistPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useSpeechStore.setState(defaultState());
  });

  afterEach(() => {
    cleanup();
  });

  it('renders zero DOM nodes while disabled (off by default)', () => {
    const { container } = render(<SermonAssistPanel darkMode={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('sermon-assist-open')).toBeNull();
    expect(screen.queryByTestId('speech-mode-indicator')).toBeNull();
    expect(screen.queryByTestId('speech-status-chip')).toBeNull();
  });

  it('renders safely with no props', () => {
    const { container } = render(<SermonAssistPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The only engine that can run today is the contract-conformant fake, which
   * ignores audio and replays a fixed sentence. `backend` reaches the renderer
   * on `speech:health`; before this guard it was read nowhere, so the rail
   * reported a bare "Local · large-v3" while emitting text the engine wrote
   * itself.
   */
  it('labels the engine as canned when the health payload says fake', () => {
    useSpeechStore.setState({
      enabled: true,
      status: 'transcribing',
      health: { backend: 'fake', model: 'large-v3', apiVersion: 1 },
    });
    render(<SermonAssistPanel darkMode={false} />);
    fireEvent.click(screen.getByTestId('sermon-assist-open'));

    const indicator = screen.getByTestId('speech-mode-indicator');
    expect(indicator).toHaveTextContent(/canned/i);
    expect(indicator).toHaveTextContent('not real transcription');
    // The configured mode is still shown, just never on its own.
    expect(indicator).toHaveTextContent('Local · large-v3');
    // The truth must lead, so the caveat cannot be skimmed past.
    expect(indicator.textContent.startsWith('TEST')).toBe(true);
    // "Transcribing" must not read as success next to canned output.
    expect(screen.getByTestId('speech-status-chip')).toHaveTextContent('Transcribing');
  });

  it('keeps the plain mode label for a real engine', () => {
    useSpeechStore.setState({
      enabled: true,
      status: 'transcribing',
      health: { backend: 'whispercpp', model: 'large-v3' },
    });
    render(<SermonAssistPanel darkMode={false} />);
    fireEvent.click(screen.getByTestId('sermon-assist-open'));

    const indicator = screen.getByTestId('speech-mode-indicator');
    expect(indicator).toHaveTextContent('Local · large-v3');
    expect(indicator).not.toHaveTextContent(/canned/i);
  });

  it('keeps the plain mode label before any health has arrived', () => {
    useSpeechStore.setState({ enabled: true, status: 'idle', health: null });
    render(<SermonAssistPanel darkMode={false} />);
    fireEvent.click(screen.getByTestId('sermon-assist-open'));

    const indicator = screen.getByTestId('speech-mode-indicator');
    expect(indicator).toHaveTextContent('Local · large-v3');
    expect(indicator).not.toHaveTextContent(/canned/i);
  });

  it('shows only a summon strip when enabled, then expands into the full rail', () => {
    useSpeechStore.setState({ enabled: true });
    render(<SermonAssistPanel darkMode={false} />);

    // collapsed: the summon affordance and nothing else
    expect(screen.getByTestId('sermon-assist-open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Sermon Assist rail' })).toBeInTheDocument();
    expect(screen.queryByTestId('speech-mode-indicator')).toBeNull();

    fireEvent.click(screen.getByTestId('sermon-assist-open'));

    expect(screen.queryByTestId('sermon-assist-open')).toBeNull();
    expect(screen.getByTestId('speech-mode-indicator')).toHaveTextContent('Local · large-v3');
    expect(screen.getByTestId('speech-status-chip')).toHaveTextContent('Idle');
    expect(screen.getByText('Transcript appears here when listening starts.')).toBeInTheDocument();
    expect(
      screen.getByText('Next lyric line, Bible verse, and sermon note suggestions appear here.')
    ).toBeInTheDocument();
    // Cold-start privacy note, and it must be honest: this rail only renders
    // when Sermon Assist is enabled, so copy telling the operator to "enable
    // Sermon Assist" could never be true here.
    expect(screen.getByTestId('speech-privacy-note')).toHaveTextContent(
      'Microphone is closed. Nothing is captured or sent until you press resume.'
    );
    expect(screen.getByTestId('speech-privacy-note')).not.toHaveTextContent(/enable Sermon Assist/i);

    // The mode indicator is PINNED below the scrolling body, not inside it, so
    // the local/cloud answer cannot scroll out of view on a short window.
    const modeIndicator = screen.getByTestId('speech-mode-indicator');
    const scrollBody = modeIndicator.closest('aside')?.querySelector('.overflow-y-auto');
    expect(scrollBody, 'the rail must keep a scrollable body').toBeTruthy();
    expect(scrollBody?.contains(modeIndicator)).toBe(false);

    fireEvent.click(screen.getByTestId('sermon-assist-collapse'));
    expect(screen.getByTestId('sermon-assist-open')).toBeInTheDocument();
    expect(screen.queryByTestId('speech-mode-indicator')).toBeNull();
  });

  it('reports the configured mode in the indicator', () => {
    useSpeechStore.setState({ enabled: true, where: 'cloud', cloudProviderId: null });
    render(<SermonAssistPanel />);
    fireEvent.click(screen.getByTestId('sermon-assist-open'));
    expect(screen.getByTestId('speech-mode-indicator')).toHaveTextContent('Cloud · not configured');
  });
});
