/**
 * tests/speech/transcriptHistory.test.jsx — Live Sermon Assist, Decision D9
 * / Phase 4: the transcript-history browser.
 *
 * Renderer-only, against a stubbed `window.electronAPI.speech.history`
 * bridge — no Electron, no disk, no spawn, no fetch. What is pinned here:
 *
 *   - COLD render: mount performs exactly one cheap `list` invoke (the
 *     explicit initial load), and nothing else until the user acts,
 *   - browse: session rows carry date, duration, model, provider, segment
 *     count, and WER rendered as "—" / "not benchmarked" — never a
 *     fabricated number,
 *   - the per-segment PROVIDER BOUNDARY is visible for a mixed session
 *     (the cloud-trial edge the plan calls out),
 *   - search reaches the search channel and shows excerpts,
 *   - export reaches the export channel with the chosen format and confirms
 *     with the returned path,
 *   - erase asks for confirmation BEFORE destroying, and reports the bytes
 *     reclaimed afterwards,
 *   - the empty state is one clear line, not a blank table.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TranscriptHistoryBrowser from '@/components/Speech/TranscriptHistoryBrowser';

// Load contention with concurrent suite runs: give the synchronous
// assertions headroom rather than letting them flake.
const itFlow = (name, fn) => it(name, fn, 30000);

const DAY = 24 * 60 * 60 * 1000;
const STARTED_AT = Date.parse('2026-09-27T10:00:00.000Z');

const MIXED_SESSION = {
  sessionId: 'svc-mixed',
  startedAt: STARTED_AT,
  endedAt: STARTED_AT + 600_000,
  durationMs: 600_000,
  modelId: 'large-v3',
  providerId: 'whispercpp',
  where: 'local',
  werEstimate: null,
  segmentCount: 3,
  providers: ['whispercpp', 'cloud-openai'],
  bytes: 4096,
};

const SOLO_SESSION = {
  sessionId: 'svc-solo',
  startedAt: STARTED_AT - DAY,
  endedAt: STARTED_AT - DAY + 1_800_000,
  durationMs: 1_800_000,
  modelId: 'base.en-q8_0',
  providerId: 'whispercpp',
  where: 'local',
  werEstimate: null,
  segmentCount: 1,
  providers: ['whispercpp'],
  bytes: 2048,
};

const MIXED_RECORD = {
  ...MIXED_SESSION,
  segments: [
    { segmentId: 'seg-a', tStartMs: 0, tEndMs: 5000, text: 'Local words at the start', providerId: 'whispercpp', kind: 'final' },
    { segmentId: 'seg-b', tStartMs: 5000, tEndMs: 9000, text: 'Cloud words during the trial', providerId: 'cloud-openai', kind: 'final' },
    { segmentId: 'seg-c', tStartMs: 9000, tEndMs: 12000, text: 'Back to local words', providerId: 'whispercpp', kind: 'final' },
  ],
};

const SOLO_RECORD = {
  ...SOLO_SESSION,
  segments: [
    { segmentId: 'seg-1', tStartMs: 0, tEndMs: 4000, text: 'The Lord is my shepherd', providerId: 'whispercpp', kind: 'final' },
  ],
};

/** A deterministic stand-in for the preload speech.history bridge. */
const createBridge = () => {
  const state = { sessions: [MIXED_SESSION, SOLO_SESSION] };
  const bridge = {
    state,
    list: vi.fn(async () => ({
      ok: true,
      sessions: state.sessions,
      status: { recording: true, byteCap: 64 * 1024 * 1024, sessionCap: 500, storedBytes: 6144 },
    })),
    get: vi.fn(async (sessionId) => {
      const record = sessionId === 'svc-mixed' ? MIXED_RECORD : SOLO_RECORD;
      return { ok: true, session: { ...record } };
    }),
    search: vi.fn(async (query) => ({
      ok: true,
      query,
      matches: [
        {
          ...SOLO_SESSION,
          matchedOn: 'text',
          segments: [
            {
              segmentId: 'seg-1',
              tStartMs: 120_000,
              tEndMs: 124_000,
              providerId: 'whispercpp',
              excerpt: '…The Lord is my shepherd…',
            },
          ],
        },
      ],
    })),
    export: vi.fn(async ({ format }) => ({
      ok: true,
      path: `/home/user/.config/LyricDisplay/speech-engine/history/exports/sermon-transcript-2026-09-27.${format === 'text' ? 'txt' : 'json'}`,
      bytes: 2048,
      format,
      sessionCount: 2,
    })),
    erase: vi.fn(async () => {
      state.sessions = [];
      return { ok: true, bytesReclaimed: 4096, sessionsRemoved: 2, exportsRemoved: 1 };
    }),
    append: vi.fn(async () => ({ ok: true })),
  };
  return bridge;
};

describe('TranscriptHistoryBrowser (renderer, stubbed bridge)', () => {
  let bridge = null;

  beforeEach(() => {
    bridge = createBridge();
    window.electronAPI = { speech: { history: bridge } };
  });

  afterEach(() => {
    delete window.electronAPI;
  });

  itFlow('renders cold: exactly one list invoke, no get/search/export/erase', async () => {
    render(<TranscriptHistoryBrowser darkMode={false} />);

    await screen.findByTestId('history-list');
    expect(bridge.list).toHaveBeenCalledTimes(1);
    expect(bridge.get).not.toHaveBeenCalled();
    expect(bridge.search).not.toHaveBeenCalled();
    expect(bridge.export).not.toHaveBeenCalled();
    expect(bridge.erase).not.toHaveBeenCalled();
    expect(bridge.append).not.toHaveBeenCalled();
  });

  itFlow('browse: rows show date, duration, model, provider, segments, and an honest WER', async () => {
    render(<TranscriptHistoryBrowser darkMode={false} />);
    await screen.findByTestId('history-list');

    const rows = screen.getAllByTestId('history-session-row');
    expect(rows).toHaveLength(2);
    const mixedRow = rows[0]; // newest first
    const soloRow = rows[1];
    expect(mixedRow).toHaveTextContent('large-v3');
    expect(mixedRow).toHaveTextContent('2 providers'); // mixed, not one provider
    expect(mixedRow).toHaveTextContent('3 segments');
    expect(mixedRow).toHaveTextContent('10:00'); // duration 600000 ms -> 10:00

    // A single-provider row names its provider outright.
    expect(soloRow).toHaveTextContent('base.en-q8_0');
    expect(soloRow).toHaveTextContent('whispercpp');
    expect(soloRow).toHaveTextContent('1 segment');

    // WER: an em dash and the honest words — never a fabricated number.
    expect(mixedRow).toHaveTextContent('WER —');
    expect(mixedRow).toHaveTextContent('not benchmarked');
    expect(mixedRow).not.toHaveTextContent('%');

    // A mixed session advertises its boundary before you even open it.
    expect(within(mixedRow).getByTestId('history-provider-mixed')).toBeInTheDocument();
    expect(within(soloRow).queryByTestId('history-provider-mixed')).toBeNull();
  });

  itFlow('browse: opening a session shows its segments and the provider boundary', async () => {
    render(<TranscriptHistoryBrowser darkMode={false} />);
    await screen.findByTestId('history-list');

    fireEvent.click(screen.getAllByTestId('history-session-row')[0]);
    const detail = await screen.findByTestId('history-session-detail');
    expect(bridge.get).toHaveBeenCalledWith('svc-mixed');

    expect(detail).toHaveTextContent('Local words at the start');
    expect(detail).toHaveTextContent('Back to local words');

    // Two boundaries: local -> cloud and cloud -> local. A user who trialled
    // cloud and returned can see exactly where the boundary fell.
    const boundaries = screen.getAllByTestId('history-provider-boundary');
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).toHaveTextContent('whispercpp → cloud-openai');
    expect(boundaries[1]).toHaveTextContent('cloud-openai → whispercpp');

    // The detail pane is honest about WER too.
    expect(screen.getByTestId('history-session-wer')).toHaveTextContent('not benchmarked');
  });

  itFlow('search: reaches the search channel and shows matching excerpts', async () => {
    render(<TranscriptHistoryBrowser darkMode={false} />);
    await screen.findByTestId('history-list');

    const input = screen.getByTestId('history-search-input');
    fireEvent.change(input, { target: { value: 'shepherd' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => expect(bridge.search).toHaveBeenCalledWith('shepherd'));
    const results = await screen.findByTestId('history-search-results');
    expect(results).toHaveTextContent('1 session(s) match');
    expect(screen.getByTestId('history-search-excerpt')).toHaveTextContent('The Lord is my shepherd');
    // The match row can open the session like any list row.
    fireEvent.click(screen.getByTestId('history-search-match'));
    await screen.findByTestId('history-session-detail');
    expect(bridge.get).toHaveBeenCalledWith('svc-solo');
  });

  itFlow('export: the chosen format goes to the channel and the path confirms the save', async () => {
    render(<TranscriptHistoryBrowser darkMode={false} />);
    await screen.findByTestId('history-list');

    fireEvent.click(screen.getByTestId('history-export'));
    await waitFor(() => expect(bridge.export).toHaveBeenCalledWith({ format: 'json' }));
    const result = await screen.findByTestId('history-export-result');
    expect(result).toHaveTextContent('sermon-transcript-2026-09-27.json');

    fireEvent.change(screen.getByTestId('history-export-format'), { target: { value: 'text' } });
    fireEvent.click(screen.getByTestId('history-export'));
    await waitFor(() => expect(bridge.export).toHaveBeenCalledWith({ format: 'text' }));
    await waitFor(() =>
      expect(screen.getByTestId('history-export-result')).toHaveTextContent(
        'sermon-transcript-2026-09-27.txt'
      )
    );
  });

  itFlow('erase: asks for confirmation first, then reports bytes reclaimed', async () => {
    render(<TranscriptHistoryBrowser darkMode={false} />);
    await screen.findByTestId('history-list');

    fireEvent.click(screen.getByTestId('history-erase'));
    // Confirmation appears; nothing has been destroyed yet.
    expect(screen.getByTestId('history-erase-confirm')).toHaveTextContent(
      'Delete every stored transcript?'
    );
    expect(bridge.erase).not.toHaveBeenCalled();

    // Cancel backs out safely.
    fireEvent.click(screen.getByTestId('history-erase-confirm-no'));
    expect(screen.queryByTestId('history-erase-confirm')).toBeNull();
    expect(bridge.erase).not.toHaveBeenCalled();

    // Confirm for real.
    fireEvent.click(screen.getByTestId('history-erase'));
    fireEvent.click(screen.getByTestId('history-erase-confirm-yes'));
    await waitFor(() => expect(bridge.erase).toHaveBeenCalledTimes(1));

    const result = await screen.findByTestId('history-erase-result');
    expect(result).toHaveTextContent('4 KiB reclaimed');
    // The list refreshes to the empty state — one clear line.
    await screen.findByTestId('history-empty');
    expect(bridge.list).toHaveBeenCalledTimes(2);
  });

  itFlow('empty state: one clear line instead of a blank table', async () => {
    bridge.state.sessions = [];
    render(<TranscriptHistoryBrowser darkMode={false} />);

    const empty = await screen.findByTestId('history-empty');
    expect(empty).toHaveTextContent('No transcript history yet');
    expect(screen.queryByTestId('history-list')).toBeNull();
    expect(screen.queryAllByTestId('history-session-row')).toHaveLength(0);
  });

  itFlow('dark mode flips the conditional classes', async () => {
    render(<TranscriptHistoryBrowser darkMode />);
    await screen.findByTestId('history-list');
    const section = screen.getByTestId('speech-history-browser');
    expect(section.className).toContain('border-gray-800');
    expect(section.className).not.toContain('border-gray-200');
  });

  it('renders nothing without the preload bridge', () => {
    delete window.electronAPI;
    const { container } = render(<TranscriptHistoryBrowser darkMode={false} />);
    expect(container.innerHTML).toBe('');
  });
});
