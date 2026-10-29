import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import UserPreferencesModal from '@/components/UserPreferencesModal';

const renderDiagnostics = () =>
  render(<UserPreferencesModal darkMode={false} onClose={() => {}} initialSection="diagnostics" />);

beforeEach(() => {
  localStorage.clear();
  delete window.electronAPI;
});

afterEach(() => {
  cleanup();
  delete window.electronAPI;
});

describe('Diagnostics preferences section', () => {
  it('lists Diagnostics in the sidebar and renders the support card', () => {
    renderDiagnostics();
    expect(screen.getByRole('button', { name: /Diagnostics/ })).toBeInTheDocument();
    expect(screen.getByTestId('diagnostics-card')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostics-copy-logs')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostics-refresh')).toBeInTheDocument();
  });

  it('copies the tailed log file to the clipboard and says how much', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    window.electronAPI = {
      diagnostics: {
        info: async () => ({ ok: true, path: '/logs/selah-diagnostics.log', bytes: 42 }),
        read: async () => ({ ok: true, path: '/logs/selah-diagnostics.log', bytes: 42, truncated: false, content: 'line one\nline two\n' }),
      },
    };
    renderDiagnostics();

    await waitFor(() => expect(screen.queryByTestId('diagnostics-status')).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId('diagnostics-copy-logs'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toMatch(/line one/);
    await waitFor(() =>
      expect(screen.getByTestId('diagnostics-status')).toHaveTextContent(/Copied/)
    );
  });

  it('reports a clipboard failure instead of throwing', async () => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    window.electronAPI = {
      diagnostics: {
        info: async () => ({ ok: true, path: '/logs/x.log', bytes: 10 }),
        read: async () => ({ ok: true, path: '/logs/x.log', bytes: 10, truncated: false, content: 'abc' }),
      },
    };
    renderDiagnostics();
    fireEvent.click(screen.getByTestId('diagnostics-copy-logs'));

    await waitFor(() =>
      expect(screen.getByTestId('diagnostics-status')).toHaveTextContent(/Could not copy/)
    );
  });

  it('copies collected search data to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    const analytics = await import('@/utils/searchAnalytics');
    analytics.__testOnly.resetForTest();
    await analytics.clearSearchEvents();
    analytics.logSearchEvent({
      surface: 'bible',
      query: 'amazing grace',
      resultCount: 3,
      topResults: [{ reference: 'John 3:16', bibleName: 'KJV' }],
      latencyMs: 42,
    });
    renderDiagnostics();
    expect(await screen.findByTestId('search-analytics-card')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('search-analytics-copy'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toMatch(/amazing grace/);
    expect(writeText.mock.calls[0][0]).toMatch(/John 3:16/);
    await waitFor(() =>
      expect(screen.getByTestId('search-analytics-status')).toHaveTextContent(/Copied/)
    );
    analytics.__testOnly.resetForTest();
    await analytics.clearSearchEvents();
  });

  it('clears collected search data', async () => {
    const analytics = await import('@/utils/searchAnalytics');
    analytics.__testOnly.resetForTest();
    await analytics.clearSearchEvents();
    analytics.logSearchEvent({ surface: 'lyrics-local', query: 'grace', resultCount: 1 });
    renderDiagnostics();
    expect(await screen.findByTestId('search-analytics-card')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('search-analytics-clear'));

    await waitFor(() =>
      expect(screen.getByTestId('search-analytics-status')).toHaveTextContent(/cleared/i)
    );
    expect(await analytics.getSearchEvents()).toHaveLength(0);
    analytics.__testOnly.resetForTest();
  });

  it('falls back to the in-memory ring when there is no bridge', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { diagInfo } = await import('@/utils/diagnosticsLog');
    diagInfo('test', 'ring seeded for copy', { ok: true });
    // No window.electronAPI: file info is unavailable, copy uses the ring.
    renderDiagnostics();
    fireEvent.click(screen.getByTestId('diagnostics-copy-logs'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toMatch(/ring seeded for copy/);
    await waitFor(() =>
      expect(screen.getByTestId('diagnostics-status')).toHaveTextContent(/Copied/)
    );
  });
});
