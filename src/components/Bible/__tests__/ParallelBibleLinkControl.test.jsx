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
  },
  linkParallelBible: vi.fn(),
  unlinkParallelBible: vi.fn(),
  setParallelHidden: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../../context/BibleStore', () => ({
  default: (selector) => selector({
    ...mocks.state,
    linkParallelBible: mocks.linkParallelBible,
    unlinkParallelBible: mocks.unlinkParallelBible,
    setParallelHidden: mocks.setParallelHidden,
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
});