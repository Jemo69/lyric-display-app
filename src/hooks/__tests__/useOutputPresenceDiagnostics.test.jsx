import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ControlSocketContext } from '@/context/ControlSocketProvider';
import { useOutputPresence } from '@/hooks/useOutputPresence';
import { getDiagnosticsEntries, clearDiagnosticsEntries, setDiagnosticsSink } from '@/utils/diagnosticsLog';

const seen = [];
const Probe = () => {
  const { presence } = useOutputPresence({ pollIntervalMs: 60000 });
  return <div data-testid="presence-count">{presence.length}</div>;
};

const renderWithSocket = (socket) =>
  render(
    <ControlSocketContext.Provider value={{ socket, isConnected: true }}>
      <Probe />
    </ControlSocketContext.Provider>
  );

beforeEach(() => {
  localStorage.clear();
  clearDiagnosticsEntries();
  setDiagnosticsSink((entry) => void seen.push(entry));
  seen.length = 0;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ presence: [] }) })));
});

afterEach(() => {
  cleanup();
  setDiagnosticsSink(null);
  vi.unstubAllGlobals();
});

describe('useOutputPresence diagnostics', () => {
  it('logs display arrivals and departures, not steady polls', async () => {
    let handler = null;
    const socket = {
      connected: true,
      on: (event, callback) => { handler = callback; },
      off: () => {},
      emit: () => {},
    };
    renderWithSocket(socket);
    await waitFor(() => expect(screen.getByTestId('presence-count')).toHaveTextContent('0'));
    expect(seen.filter((entry) => entry.message === 'display presence changed')).toHaveLength(0);

    const { act } = await import('@testing-library/react');
    act(() => handler({ presence: [{ outputKey: 'output1', displays: 1 }], timestamp: Date.now() }));
    await waitFor(() => expect(screen.getByTestId('presence-count')).toHaveTextContent('1'));
    const changes = seen.filter((entry) => entry.message === 'display presence changed');
    expect(changes).toHaveLength(1);
    expect(changes[0].details.after).toMatch(/output1/);

    // Same snapshot again: no new line.
    act(() => handler({ presence: [{ outputKey: 'output1', displays: 1 }], timestamp: Date.now() }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.filter((entry) => entry.message === 'display presence changed')).toHaveLength(1);

    // Departure logs too.
    act(() => handler({ presence: [], timestamp: Date.now() }));
    await waitFor(() => expect(screen.getByTestId('presence-count')).toHaveTextContent('0'));
    expect(seen.filter((entry) => entry.message === 'display presence changed')).toHaveLength(2);
  });
});
