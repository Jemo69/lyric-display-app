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
    expect(
      screen.getByText('Microphone access is off. No audio is captured or sent until you enable Sermon Assist.')
    ).toBeInTheDocument();

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
