import { describe, it, expect, beforeEach } from 'vitest';
import useBibleStore from '../BibleStore';

const bibles = {
  b1: {
    id: 'b1',
    name: 'KJV',
    books: [{ number: 1, name: 'Genesis', chapters: [{ number: 1, verses: [{ number: 1, text: 'KJV text' }] }] }]
  },
  b2: {
    id: 'b2',
    name: 'NIV',
    books: [{ number: 1, name: 'Genesis', chapters: [{ number: 1, verses: [{ number: 1, text: 'NIV text' }] }] }]
  }
};

const reference = { id: 'b1', book: 1, chapters: ['1'], verses: [[1]] };

describe('BibleStore setActiveBible switchInPlace', () => {
  beforeEach(() => {
    localStorage.removeItem('bible-store');
    useBibleStore.setState({
      bibles,
      bibleMetadata: {
        b1: { id: 'b1', name: 'KJV' },
        b2: { id: 'b2', name: 'NIV' }
      },
      activeBibleId: 'b1',
      activeReference: reference,
      selectedVerses: [[1]],
      settings: { ...useBibleStore.getState().settings, switchInPlace: false }
    });
  });

  it('resets the reference when switchInPlace is off (default behavior)', async () => {
    await useBibleStore.getState().setActiveBible('b2');
    const state = useBibleStore.getState();
    expect(state.activeBibleId).toBe('b2');
    expect(state.activeReference).toBeNull();
    expect(state.selectedVerses).toEqual([[1]]);
  });

  it('preserves the reference when switchInPlace is on', async () => {
    useBibleStore.getState().updateSettings({ switchInPlace: true });
    await useBibleStore.getState().setActiveBible('b2');
    const state = useBibleStore.getState();
    expect(state.activeBibleId).toBe('b2');
    expect(state.activeReference).toEqual(reference);
    expect(state.selectedVerses).toEqual([[1]]);
  });

  it('resolves verse text from the newly active bible after a preserve switch', async () => {
    useBibleStore.getState().updateSettings({ switchInPlace: true });
    await useBibleStore.getState().setActiveBible('b2');
    expect(useBibleStore.getState().getVerseText()).toBe('NIV text');
  });

  it('does not preserve the reference when switchInPlace is on but no reference is active', async () => {
    useBibleStore.getState().updateSettings({ switchInPlace: true });
    useBibleStore.setState({ activeReference: null });
    await useBibleStore.getState().setActiveBible('b2');
    const state = useBibleStore.getState();
    expect(state.activeBibleId).toBe('b2');
    expect(state.activeReference).toBeNull();
    expect(state.selectedVerses).toEqual([[1]]);
  });
});
