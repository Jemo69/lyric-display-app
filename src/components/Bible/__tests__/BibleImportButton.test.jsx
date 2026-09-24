import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BibleImportButton from '../BibleImportButton';

const mocks = vi.hoisted(() => ({
  parseBibleFromFile: vi.fn(),
  addBible: vi.fn(),
  setActiveBible: vi.fn(),
}));

vi.mock('shared/bible', () => ({
  parseBibleFromFile: mocks.parseBibleFromFile,
}));

vi.mock('../../../context/BibleStore', () => ({
  default: (selector) => selector({
    addBible: mocks.addBible,
    setActiveBible: mocks.setActiveBible,
  }),
}));

describe('BibleImportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addBible.mockResolvedValue(undefined);
    mocks.setActiveBible.mockResolvedValue(undefined);
  });

  it('keeps the Import Bible Translation action visible with supported file types', () => {
    render(<BibleImportButton darkMode={false} />);

    expect(screen.getByRole('button', { name: 'Import Bible Translation' })).toBeTruthy();
    expect(screen.getByTestId('bible-import-input').getAttribute('accept')).toBe('.xml,.json');
  });

  it('parses, persists, and activates each selected translation', async () => {
    const onImported = vi.fn();
    const bible = {
      id: 'bible_test',
      name: 'KJV',
      books: [{ number: 1, name: 'Genesis', chapters: [] }],
    };
    const file = new File(['<bible />'], 'KJV.xml', { type: 'text/xml' });
    mocks.parseBibleFromFile.mockResolvedValue(bible);

    render(<BibleImportButton darkMode={false} onImported={onImported} />);
    fireEvent.change(screen.getByTestId('bible-import-input'), { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.parseBibleFromFile).toHaveBeenCalledWith(file);
      expect(mocks.addBible).toHaveBeenCalledWith('bible_test', bible);
      expect(mocks.setActiveBible).toHaveBeenCalledWith('bible_test');
      expect(onImported).toHaveBeenCalledWith({ id: 'bible_test', bible, file });
    });
  });

  it('resets the picker and remains usable after an invalid translation', async () => {
    const file = new File(['not a bible'], 'broken.xml', { type: 'text/xml' });
    mocks.parseBibleFromFile.mockRejectedValue(new Error('No books found in Bible file'));

    render(<BibleImportButton darkMode={false} />);
    const input = screen.getByTestId('bible-import-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.addBible).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Import Bible Translation' }).disabled).toBe(false);
    });
  });
});
