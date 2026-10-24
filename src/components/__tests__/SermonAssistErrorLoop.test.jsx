import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, act, waitFor } from '@testing-library/react';
import useSpeechStore, { speechDefaults } from '../../context/SpeechStore';
import useSpeechRuntimeStore from '../../context/SpeechRuntimeStore';
import SermonAssistPanel from '../Speech/SermonAssistPanel';

/**
 * SermonAssistErrorLoop — the engine-error loop, driven through the REAL
 * bridge subscriptions instead of direct store writes.
 *
 * Every test below emits on `window.electronAPI.speech` the way main does and
 * asserts on the RAIL (and the stores). A test that only `setState()`s its
 * precondition proves the render; these prove the WIRE: subscribe on enable,
 * map the payload, unsubscribe on disable, and never lose or invent an error.
 *
 * Mutation notes (what each test kills):
 * - deleting any `bridge.onX` subscription breaks tests 1/4/5 (nothing arrives);
 * - dropping the `fatal` branch breaks test 2 (chip never turns red);
 * - dropping the final-clears-error line breaks test 3 (stale banner survives
 *   recovery);
 * - settling partials into the tail breaks test 3 (tail assertion);
 * - removing the garbage guards breaks tests with `null`/string payloads;
 * - removing the `enabled` gate breaks test 6 (emissions leak while off);
 * - clearing lastError on opt-out breaks test 7 (re-check shows nothing).
 */

const listenerCounts = () => ({});
const createBridge = () => {
  const listeners = { transcript: [], error: [], vad: [], health: [], installState: [] };
  const on = (key) => (callback) => {
    listeners[key].push(callback);
    return () => {
      listeners[key] = listeners[key].filter((entry) => entry !== callback);
    };
  };
  const emit = (key, payload) => [...listeners[key]].forEach((callback) => callback(payload));
  return {
    listeners,
    emit,
    counts: () => Object.fromEntries(Object.entries(listeners).map(([key, list]) => [key, list.length])),
    speech: {
      getState: async () => ({
        ok: true,
        installState: {
          engine: { installed: true, binDir: '/x/speech-engine/bin', supported: true, release: 'b5454' },
        },
      }),
      onInstallState: on('installState'),
      onTranscript: on('transcript'),
      onError: on('error'),
      onVad: on('vad'),
      onHealth: on('health'),
      testEngine: vi.fn(async () => ({ ok: true })),
    },
  };
};

const resetAll = (overrides = {}) => {
  localStorage.clear();
  useSpeechStore.setState({
    ...speechDefaults(),
    status: 'idle',
    health: null,
    lastError: null,
    vad: null,
    enabled: true,
    engineMode: 'prod',
    ...overrides,
  });
  useSpeechRuntimeStore.getState().reset();
};

const openRail = () => {
  render(<SermonAssistPanel darkMode={false} />);
  fireEvent.click(screen.getByTestId('sermon-assist-open'));
};

describe('SermonAssist error loop (bridge emissions, not store writes)', () => {
  let bridge;

  beforeEach(() => {
    resetAll({ status: 'listening' });
    bridge = createBridge();
    window.electronAPI = { speech: bridge.speech };
  });

  afterEach(() => {
    cleanup();
    delete window.electronAPI;
  });

  it('a non-fatal engine error reaches the banner without flipping the status chip', () => {
    openRail();
    act(() => bridge.emit('error', { code: 'transcribe-failed', message: 'The speech engine could not transcribe this segment.', fatal: false }));

    expect(screen.getByTestId('speech-last-error')).toHaveTextContent('could not transcribe');
    // Non-fatal: the rail is still listening, not red.
    expect(screen.getByTestId('speech-status-chip')).toHaveTextContent('Listening');
    expect(useSpeechStore.getState().status).toBe('listening');
  });

  it('a fatal engine error flips the chip so the rail cannot claim to listen', () => {
    openRail();
    act(() => bridge.emit('error', { code: 'engine-broken', message: 'The engine gave up.', fatal: true }));

    expect(screen.getByTestId('speech-last-error')).toHaveTextContent('gave up');
    expect(screen.getByTestId('speech-status-chip')).toHaveTextContent('Error');
    expect(useSpeechStore.getState().status).toBe('error');
  });

  it('garbage error payloads never crash and never invent an error', () => {
    openRail();
    expect(() =>
      act(() => {
        bridge.emit('error', null);
        bridge.emit('error', 'boom');
        bridge.emit('error', 42);
      })
    ).not.toThrow();
    expect(screen.queryByTestId('speech-last-error')).toBeNull();
    expect(useSpeechStore.getState().lastError).toBeNull();

    // An envelope without a message still explains itself, generically.
    act(() => bridge.emit('error', {}));
    expect(screen.getByTestId('speech-last-error')).toHaveTextContent('reported a problem');
  });

  it('a final clears a stale error and lands in the runtime tail; a partial does neither', () => {
    openRail();
    act(() => bridge.emit('error', { code: 'transcribe-failed', message: 'Segment failed.', fatal: false }));
    expect(screen.getByTestId('speech-last-error')).toBeInTheDocument();

    // A partial is provisional: the error stands and the tail stays empty.
    act(() => bridge.emit('transcript', { t: 'partial', sessionId: 's1', text: 'amen and' }));
    expect(screen.getByTestId('speech-last-error')).toBeInTheDocument();
    expect(useSpeechRuntimeStore.getState().segments).toHaveLength(0);
    expect(useSpeechRuntimeStore.getState().partial).toBe('amen and');

    // A final is proof of recovery: banner gone, tail settled, partial cleared.
    act(() =>
      bridge.emit('transcript', { t: 'final', sessionId: 's1', text: 'amen and amen', tStartMs: 0, tEndMs: 1000 })
    );
    expect(screen.queryByTestId('speech-last-error')).toBeNull();
    expect(useSpeechStore.getState().lastError).toBeNull();
    const tail = useSpeechRuntimeStore.getState().segments;
    expect(tail.map((segment) => segment.text).join(' ')).toMatch(/amen and amen/);
    expect(useSpeechRuntimeStore.getState().partial).toBe('');
  });

  it('voice activity flows to the store and garbage states coerce instead of crashing', () => {
    openRail();
    act(() => bridge.emit('vad', { state: 'speech' }));
    expect(useSpeechStore.getState().vad).toEqual({ state: 'speech' });

    act(() => bridge.emit('vad', { state: 'silence' }));
    expect(useSpeechStore.getState().vad).toEqual({ state: 'silence' });

    // Unknown states are silence, never a third state the UI cannot render.
    act(() => bridge.emit('vad', { state: 'hovering' }));
    expect(useSpeechStore.getState().vad).toEqual({ state: 'silence' });

    // Garbage is ignored, not stored, and never throws. An envelope with no
    // state string clears the slot (there is nothing to show); anything
    // non-object leaves it untouched.
    expect(() =>
      act(() => {
        bridge.emit('vad', null);
        bridge.emit('vad', 'speech');
        bridge.emit('vad', 42);
      })
    ).not.toThrow();
    expect(useSpeechStore.getState().vad).toEqual({ state: 'silence' });
    act(() => bridge.emit('vad', {}));
    expect(useSpeechStore.getState().vad).toBeNull();
  });

  it('while the feature is off, nothing subscribes and emissions touch nothing', () => {
    resetAll({ enabled: false, status: 'idle' });
    const { container } = render(<SermonAssistPanel darkMode={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(bridge.counts()).toEqual({ transcript: 0, error: 0, vad: 0, health: 0, installState: 0 });

    expect(() =>
      act(() => {
        bridge.emit('error', { code: 'x', message: 'Nope.', fatal: true });
        bridge.emit('transcript', { t: 'final', sessionId: 's1', text: 'ghost', tStartMs: 0, tEndMs: 1 });
        bridge.emit('vad', { state: 'speech' });
      })
    ).not.toThrow();
    expect(useSpeechStore.getState().lastError).toBeNull();
    expect(useSpeechStore.getState().status).toBe('idle');
    expect(useSpeechStore.getState().vad).toBeNull();
    expect(useSpeechRuntimeStore.getState().segments).toHaveLength(0);
  });

  it('disabling unsubscribes: earlier listeners stop receiving', () => {
    openRail();
    expect(bridge.counts().error).toBeGreaterThan(0);

    act(() => {
      useSpeechStore.getState().setEnabled(false);
    });
    expect(bridge.counts()).toEqual({ transcript: 0, error: 0, vad: 0, health: 0, installState: 0 });

    act(() => bridge.emit('error', { code: 'x', message: 'Late arrival.', fatal: true }));
    expect(useSpeechStore.getState().lastError).toBeNull();
    expect(useSpeechStore.getState().status).not.toBe('error');
  });

  it('opting out hides the banner but keeps the error for later', () => {
    openRail();
    act(() => bridge.emit('error', { code: 'transcribe-failed', message: 'Segment failed.', fatal: false }));
    expect(screen.getByTestId('speech-last-error')).toHaveTextContent('Segment failed.');

    fireEvent.click(screen.getByTestId('speech-show-engine-errors-toggle'));
    expect(screen.queryByTestId('speech-last-error')).toBeNull();
    expect(screen.getByTestId('speech-last-error-hidden')).toBeInTheDocument();
    // The error is hidden, not cleared.
    expect(useSpeechStore.getState().lastError).toBe('Segment failed.');

    // Re-enabling restores the SAME error with no new emission.
    fireEvent.click(screen.getByTestId('speech-show-engine-errors-toggle'));
    expect(screen.getByTestId('speech-last-error')).toHaveTextContent('Segment failed.');
  });

  it('dismissing clears the banner, and a new error re-arms it', () => {
    openRail();
    act(() => bridge.emit('error', { code: 'a', message: 'First failure.', fatal: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss engine error' }));
    expect(screen.queryByTestId('speech-last-error')).toBeNull();
    expect(useSpeechStore.getState().lastError).toBeNull();

    act(() => bridge.emit('error', { code: 'b', message: 'Second failure.', fatal: false }));
    expect(screen.getByTestId('speech-last-error')).toHaveTextContent('Second failure.');
  });

  it('a passing Test engine clears the banner AND the red chip', async () => {
    openRail();
    act(() => bridge.emit('error', { code: 'engine-broken', message: 'The engine gave up.', fatal: true }));
    expect(screen.getByTestId('speech-status-chip')).toHaveTextContent('Error');

    fireEvent.click(screen.getByTestId('speech-error-test-engine'));
    await waitFor(() => expect(bridge.speech.testEngine).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('speech-last-error')).toBeNull());
    expect(screen.getByTestId('speech-status-chip')).toHaveTextContent('Idle');
    expect(useSpeechStore.getState().status).toBe('idle');
  });

  it('a failing Test engine keeps the banner and the red chip with the new message', async () => {
    bridge.speech.testEngine.mockResolvedValueOnce({ ok: false, message: 'Still broken: reinstall.' });
    openRail();
    act(() => bridge.emit('error', { code: 'engine-broken', message: 'The engine gave up.', fatal: true }));

    fireEvent.click(screen.getByTestId('speech-error-test-engine'));
    await waitFor(() =>
      expect(screen.getByTestId('speech-last-error')).toHaveTextContent('Still broken')
    );
    expect(screen.getByTestId('speech-status-chip')).toHaveTextContent('Error');
  });
});
