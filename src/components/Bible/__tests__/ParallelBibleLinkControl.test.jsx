import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ParallelBibleLinkControl from '../ParallelBibleLinkControl';

const mocks = vi.hoisted(() => ({
  state: {
    linkedBibleId: null,
    activeBibleId: 'kjv',
    bibleMetadata: {
      kjv: { id: 'kjv', name: 'KJV' },
      es: { id: 'es', name: 'RVR1960' },
    },
    parallelHidden: false,
    ui: { parallelControlCollapsed: false },
  },
  linkParallelBible: vi.fn(),
  unlinkParallelBible: vi.fn(),
  setParallelHidden: vi.fn(),
  setUIState: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../../context/BibleStore', () => ({
  default: (selector) => selector({
    ...mocks.state,
    linkParallelBible: mocks.linkParallelBible,
    unlinkParallelBible: mocks.unlinkParallelBible,
    setParallelHidden: mocks.setParallelHidden,
    setUIState: mocks.setUIState,
  }),
}));

vi.mock('../../../hooks/useToast', () => ({
  default: () => ({ showToast: mocks.showToast }),
}));

describe('ParallelBibleLinkControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.linkedBibleId = null;
    mocks.state.parallelHidden = false;
    mocks.state.ui = { parallelControlCollapsed: false };
  });

  it('offers no hide control while nothing is linked', () => {
    render(<ParallelBibleLinkControl darkMode={false} />);

    expect(screen.getByLabelText('Link a second translation for parallel display')).toBeTruthy();
    expect(screen.queryByLabelText('Hide parallel translation')).toBeNull();
    expect(screen.queryByLabelText('Show parallel translation')).toBeNull();
  });

  it('hides a linked translation without dropping the link', () => {
    mocks.state.linkedBibleId = 'es';
    render(<ParallelBibleLinkControl darkMode={false} />);

    fireEvent.click(screen.getByLabelText('Hide parallel translation'));

    // Reversible without re-picking the translation from the dropdown.
    expect(mocks.setParallelHidden).toHaveBeenCalledWith(true);
    expect(mocks.unlinkParallelBible).not.toHaveBeenCalled();
  });

  it('shows it again from the same control', () => {
    mocks.state.linkedBibleId = 'es';
    mocks.state.parallelHidden = true;
    render(<ParallelBibleLinkControl darkMode={false} />);

    fireEvent.click(screen.getByLabelText('Show parallel translation'));

    expect(mocks.setParallelHidden).toHaveBeenCalledWith(false);
  });

  it('reports hidden state on the control for styling and assertions', () => {
    mocks.state.linkedBibleId = 'es';
    const { rerender } = render(<ParallelBibleLinkControl darkMode={false} />);
    expect(screen.getByTestId('parallel-bible-link').getAttribute('data-parallel-hidden')).toBe('false');

    mocks.state.parallelHidden = true;
    rerender(<ParallelBibleLinkControl darkMode={false} />);
    expect(screen.getByTestId('parallel-bible-link').getAttribute('data-parallel-hidden')).toBe('true');
    expect(screen.getByText('Hidden')).toBeTruthy();
  });

  it('keeps unlink available alongside the hide toggle', () => {
    mocks.state.linkedBibleId = 'es';
    render(<ParallelBibleLinkControl darkMode={false} />);

    fireEvent.click(screen.getByText('Unlink'));
    expect(mocks.unlinkParallelBible).toHaveBeenCalled();
  });

  it('folds the whole block away and opens it again from the header', () => {
    const { rerender } = render(<ParallelBibleLinkControl darkMode={false} />);

    const toggle = screen.getByTestId('parallel-bible-link-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('parallel-bible-link-body')).toBeTruthy();

    fireEvent.click(toggle);
    expect(mocks.setUIState).toHaveBeenCalledWith({ parallelControlCollapsed: true });

    mocks.state.ui = { parallelControlCollapsed: true };
    rerender(<ParallelBibleLinkControl darkMode={false} />);

    // Fully hidden: no body, so the tray gives the space back to the verse.
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('parallel-bible-link-body')).toBeNull();
    expect(screen.queryByLabelText('Link a second translation for parallel display')).toBeNull();

    fireEvent.click(toggle);
    expect(mocks.setUIState).toHaveBeenLastCalledWith({ parallelControlCollapsed: false });
  });

  it('still reports the linked translation while collapsed', () => {
    mocks.state.linkedBibleId = 'es';
    mocks.state.ui = { parallelControlCollapsed: true };
    render(<ParallelBibleLinkControl darkMode={false} />);

    // Status stays legible so the operator never reopens it just to look.
    expect(screen.getByTestId('parallel-bible-link-toggle').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('RVR1960')).toBeTruthy();
    expect(screen.getByTestId('parallel-bible-link').getAttribute('data-parallel-collapsed')).toBe('true');
  });
});