import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import useSpeechStore, { speechDefaults } from '../../src/context/SpeechStore';
import SermonAssistPanel from '../../src/components/Speech/SermonAssistPanel';
import SpeechSettingsSection from '../../src/components/Speech/SpeechSettingsSection';

describe('Live Sermon Assist: Engine Mode (Production vs. Test)', () => {
  beforeEach(() => {
    localStorage.clear();
    useSpeechStore.getState().resetToDefaults();
  });

  it('defaults to production mode in speechDefaults and SpeechStore', () => {
    const defaults = speechDefaults();
    expect(defaults.engineMode).toBe('prod');
    expect(useSpeechStore.getState().engineMode).toBe('prod');
  });

  it('allows switching between prod and test mode via setEngineMode', () => {
    useSpeechStore.getState().setEngineMode('test');
    expect(useSpeechStore.getState().engineMode).toBe('test');

    useSpeechStore.getState().setEngineMode('prod');
    expect(useSpeechStore.getState().engineMode).toBe('prod');

    // Rejects invalid strings and falls back to prod
    useSpeechStore.getState().setEngineMode('invalid-string');
    expect(useSpeechStore.getState().engineMode).toBe('prod');
  });

  it('renders PROD / TEST toggle in SermonAssistRail header and allows operator to toggle', () => {
    // Open the rail and enable speech
    useSpeechStore.getState().setEnabled(true);
    useSpeechStore.getState().setUI({ railCollapsed: false });

    const mockCapture = {
      capturing: false,
      level: 0,
      clipped: false,
      arm: () => {},
      stop: () => {},
    };
    const mockDevices = {
      activeSourceMissing: false,
    };

    const { rerender } = render(
      <SermonAssistPanel
        darkMode={false}
        capture={mockCapture}
        devices={mockDevices}
      />
    );

    const toggleBtn = screen.getByTestId('speech-rail-engine-mode-toggle');
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.textContent).toBe('PROD');

    // Click toggle button to switch to test mode
    fireEvent.click(toggleBtn);
    expect(useSpeechStore.getState().engineMode).toBe('test');
    rerender(
      <SermonAssistPanel
        darkMode={false}
        capture={mockCapture}
        devices={mockDevices}
      />
    );
    expect(screen.getByTestId('speech-rail-engine-mode-toggle').textContent).toBe('TEST');
  });

  it('renders Engine Mode radio group in SpeechSettingsSection', () => {
    render(<SpeechSettingsSection darkMode={false} />);

    const prodRadio = screen.getByTestId('speech-mode-prod');
    const testRadio = screen.getByTestId('speech-mode-test');

    expect(prodRadio).toBeDefined();
    expect(testRadio).toBeDefined();
    expect(prodRadio.getAttribute('aria-checked')).toBe('true');
    expect(testRadio.getAttribute('aria-checked')).toBe('false');

    // Switch to test mode
    fireEvent.click(testRadio);
    expect(useSpeechStore.getState().engineMode).toBe('test');
    expect(testRadio.getAttribute('aria-checked')).toBe('true');
    expect(prodRadio.getAttribute('aria-checked')).toBe('false');
  });
});
