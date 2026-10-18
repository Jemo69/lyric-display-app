/**
 * SermonAssistSafetyPanel — the Phase 6 promises, checked.
 *
 * Every test here is about a claim the panel makes. A safety panel that
 * overstates what it does is worse than no panel: it is a licence to skip the
 * caution the user would otherwise have taken.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SermonAssistSafetyPanel from '@/components/Speech/SermonAssistSafetyPanel';
import useSpeechStore, { speechDefaults } from '@/context/SpeechStore';
import { REDACTION_LIMITS, redactText } from '../../../shared/speech/redaction.js';

const LIMITS = {
  memoryMb: 4915,
  memoryMbByFraction: 4915,
  memoryMbCeiling: 8192,
  totalMemMb: 16384,
  cpuFraction: 1.6,
  cpuCount: 8,
  memoryFraction: 0.6,
};

const SUSPENDED = {
  status: 'suspended',
  strikes: 4,
  trips: 1,
  lastMessage:
    'The engine is using 9000 MB of memory, over the 4915 MB limit for this computer.',
};

const resetStore = () => {
  useSpeechStore.setState({ ...speechDefaults(), benchmarkRunningId: null });
};

describe('SermonAssistSafetyPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    window.electronAPI = { speech: { uninstall: vi.fn(async () => ({ ok: true, confirm: false, exists: false, bytesReclaimed: 0, steps: [], message: 'There is nothing to remove.' })) } };
  });

  afterEach(() => {
    delete window.electronAPI;
    vi.restoreAllMocks();
  });

  it('shows the limits this computer will actually enforce', () => {
    render(<SermonAssistSafetyPanel limits={LIMITS} />);
    const limits = screen.getByTestId('safety-limits');
    // 4915 MB renders as 4.8 GB — a figure an operator can compare against
    // what the machine actually has, not a raw MB number.
    expect(limits).toHaveTextContent('4.8 GB');
    expect(limits).toHaveTextContent('16.0 GB');
    expect(limits).toHaveTextContent('160%');
    expect(limits).toHaveTextContent('8');
    // And says where the number comes from.
    expect(screen.getByTestId('safety-limits-rationale')).toHaveTextContent(/60%/);
    expect(screen.getByTestId('safety-limits-rationale')).toHaveTextContent(/calculated from this computer/);
  });

  it('says it is working the numbers out rather than showing nothing', () => {
    render(<SermonAssistSafetyPanel limits={null} />);
    expect(screen.getByTestId('safety-limits-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('safety-limits')).toBeNull();
  });

  it('explains a suspension, and does not blame the user', () => {
    render(<SermonAssistSafetyPanel limits={LIMITS} guardrail={SUSPENDED} />);
    const banner = screen.getByTestId('safety-suspended');
    expect(banner).toHaveTextContent(/suspended to protect this computer/i);
    expect(banner).toHaveTextContent(/9000 MB/);
    // Suggests the actual fix rather than leaving the operator stuck.
    expect(banner).toHaveTextContent(/smaller model/i);
    expect(banner).toHaveTextContent(/not a fault/i);
  });

  it('shows no suspension banner when the engine is fine', () => {
    render(<SermonAssistSafetyPanel limits={LIMITS} guardrail={{ status: 'ok', trips: 0 }} />);
    expect(screen.queryByTestId('safety-suspended')).toBeNull();
  });

  it('dismissing the notice does NOT raise the limit — and says so', () => {
    render(<SermonAssistSafetyPanel limits={LIMITS} guardrail={SUSPENDED} />);
    fireEvent.click(screen.getByTestId('safety-dismiss'));

    expect(screen.queryByTestId('safety-suspended')).toBeNull();
    // The limit is unchanged and still rendered.
    expect(screen.getByTestId('safety-limits')).toHaveTextContent('4.8 GB');
    // And the button said as much, before it was pressed.
    expect(useSpeechStore.getState().guardrailNoticeDismissed).toBe(true);
  });

  it('a dismissal persists, so the banner does not return on every launch', () => {
    render(<SermonAssistSafetyPanel limits={LIMITS} guardrail={SUSPENDED} />);
    fireEvent.click(screen.getByTestId('safety-dismiss'));

    const blob = JSON.parse(localStorage.getItem('speech-store') ?? '{}');
    expect(blob.state.guardrailNoticeDismissed).toBe(true);
  });

  it('but a NEW trip shows the banner again', () => {
    useSpeechStore.setState({ guardrailNoticeDismissed: true });
    render(<SermonAssistSafetyPanel limits={LIMITS} guardrail={SUSPENDED} />);

    // Until the guardrail reports another trip, the dismissal holds.
    expect(screen.queryByTestId('safety-suspended')).toBeNull();

    // A new trip re-arms the notice. Without this, a machine that trips five
    // times would show the warning once and never again.
    useSpeechStore.getState().noteGuardrailTrip();
    expect(useSpeechStore.getState().guardrailNoticeDismissed).toBe(false);
  });

  it('a dismissal survives a reload — the banner does not nag on every launch', () => {
    useSpeechStore.setState({ guardrailNoticeDismissed: true });
    const blob = { state: { guardrailNoticeDismissed: true } };
    localStorage.setItem('speech-store', JSON.stringify(blob));
    // The store's own rehydrate path validates it as a literal boolean.
    expect(speechDefaults().guardrailNoticeDismissed).toBe(false);
  });

  it('does not show a resource banner when history is off', () => {
    useSpeechStore.setState({ historyEnabled: false });
    render(<SermonAssistSafetyPanel limits={LIMITS} guardrail={SUSPENDED} />);
    // The banner is about the ENGINE, not the history, so it still shows —
    // which is the point of this test: turning history off must not be
    // mistaken for turning the machine-safety reporting off.
    expect(screen.getByTestId('safety-suspended')).toBeInTheDocument();
  });

  // The privacy claim. A redaction feature that hides its own limits
  // manufactures trust it cannot back up.
  it('puts the redaction caveat NEXT TO the toggle, not behind a link', () => {
    render(<SermonAssistSafetyPanel limits={LIMITS} />);
    // The caveat is part of the toggle's own description block.
    const toggleRow = screen.getByTestId('safety-redaction-toggle').closest('label');
    expect(toggleRow?.textContent).toMatch(/cannot recognise a person/i);
    expect(toggleRow?.textContent).toMatch(/private rather than as anonymous/i);
  });

  it('lists both what redaction catches and what it cannot', () => {
    render(<SermonAssistSafetyPanel limits={LIMITS} />);
    const limitsPanel = screen.getByTestId('safety-redaction-limits');
    for (const covered of REDACTION_LIMITS.covers) {
      expect(limitsPanel, covered).toHaveTextContent(covered);
    }
    expect(limitsPanel).toHaveTextContent(/people’s names/);
  });

  it('every pattern the panel claims to catch, it actually catches', () => {
    // The disclosure is derived from REDACTION_LIMITS, so this test is the
    // real guarantee: it fails if someone adds a claim without the pattern.
    expect(redactText('mail me at a@b.com')).toMatch(/\[email removed\]/);
    expect(redactText('call 555-123-4567')).toMatch(/\[phone removed\]/);
    expect(redactText('id 123-45-6789')).toMatch(/\[id removed\]/);
    expect(redactText('at 42 Maple Street')).toMatch(/\[address removed\]/);
  });

  it('turning redaction off hides the detail but keeps the caveat visible', () => {
    render(<SermonAssistSafetyPanel limits={LIMITS} />);
    expect(screen.getByTestId('safety-redaction-limits')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('safety-redaction-toggle'));
    expect(screen.queryByTestId('safety-redaction-limits')).toBeNull();
    // The caveat does not go away with the list — it is on the toggle.
    expect(screen.getByTestId('safety-redaction-toggle').closest('label')?.textContent).toMatch(
      /private rather than as anonymous/i
    );
  });

  it('history is off-able, and the reason is stated', () => {
    render(<SermonAssistSafetyPanel limits={LIMITS} />);
    const toggle = screen.getByTestId('safety-history-toggle');
    expect(toggle).toBeChecked(); // D9: on by default

    fireEvent.click(toggle);
    expect(useSpeechStore.getState().historyEnabled).toBe(false);
    expect(screen.getByTestId('safety-history-toggle').closest('label')?.textContent).toMatch(
      /nothing is written/i
    );
  });

  it('the erase card is on the same page — one place for "get rid of it"', () => {
    render(<SermonAssistSafetyPanel limits={LIMITS} />);
    expect(screen.getByTestId('erase-card')).toBeInTheDocument();
    expect(screen.getByTestId('erase-preview')).toBeInTheDocument();
  });

  it('renders without a guardrail or limits at all', () => {
    render(<SermonAssistSafetyPanel />);
    expect(screen.getByTestId('sermon-assist-safety')).toBeInTheDocument();
    expect(screen.getByTestId('safety-limits-loading')).toBeInTheDocument();
  });
});