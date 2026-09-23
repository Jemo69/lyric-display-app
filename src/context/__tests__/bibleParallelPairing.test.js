import { describe, it, expect, beforeEach, vi } from 'vitest';
import useBibleStore from '../BibleStore';
import { bibleDb } from '../../utils/db.js';

const bibles = {
  kjv: {
    id: 'kjv',
    name: 'KJV',
    books: [{ number: 1, name: 'Genesis', chapters: [{ number: 1, verses: [{ number: 1, text: 'KJV one' }, { number: 2, text: 'KJV two' }] }] }]
  },
  es: {
    id: 'es',
    name: 'RVR1960',
    books: [{ number: 1, name: 'Génesis', chapters: [{ number: 1, verses: [{ number: 1, text: 'ES uno' }, { number: 2, text: 'ES dos' }] }] }]
  },
  fr: {
    id: 'fr',
    name: 'LSG',
    books: [{ number: 1, name: 'Genèse', chapters: [{ number: 1, verses: [{ number: 1, text: 'FR un' }] }] }]
  }
};

const reference = { id: 'kjv', book: 1, chapters: ['1'], verses: [[1]] };

function seed({ linkedBibleId = null, activeReference = reference } = {}) {
  localStorage.removeItem('bible-store');
  useBibleStore.setState({
    bibles: { ...bibles },
    bibleMetadata: {
      kjv: { id: 'kjv', name: 'KJV' },
      es: { id: 'es', name: 'RVR1960' },
      fr: { id: 'fr', name: 'LSG' }
    },
    activeBibleId: 'kjv',
    linkedBibleId,
    activeReference,
    selectedVerses: [[1]],
    settings: { ...useBibleStore.getState().settings, switchInPlace: false, versificationOffsets: {} }
  });
  useBibleStore.getState().clearSearchAllOwner('pairing-test-a');
  useBibleStore.getState().clearSearchAllOwner('pairing-test-b');
}

describe('BibleStore parallel pairing', () => {
  beforeEach(() => seed());

  it('links and unlinks a secondary translation', async () => {
    expect(await useBibleStore.getState().linkParallelBible('es')).toBe(true);
    expect(useBibleStore.getState().linkedBibleId).toBe('es');
    useBibleStore.getState().unlinkParallelBible();
    expect(useBibleStore.getState().linkedBibleId).toBeNull();
  });

  it('rejects unknown ids and self-pairing', async () => {
    expect(await useBibleStore.getState().linkParallelBible('missing')).toBe(false);
    expect(await useBibleStore.getState().linkParallelBible('kjv')).toBe(false);
    expect(useBibleStore.getState().linkedBibleId).toBeNull();
  });

  it('exposes the linked bible, pair view, and parallel text', async () => {
    await useBibleStore.getState().linkParallelBible('es');
    const state = useBibleStore.getState();
    expect(state.getLinkedBible()?.name).toBe('RVR1960');
    expect(state.getPairedReference()).toEqual({
      primary: reference,
      secondary: { bibleId: 'es', book: 1, chapters: ['1'], verses: [[1]] }
    });
    expect(state.getParallelVerseText()).toBe('ES uno');
    expect(state.getVerseText()).toBe('KJV one');
  });

  it('applies versification offsets to the secondary lookup', async () => {
    await useBibleStore.getState().linkParallelBible('es');
    useBibleStore.getState().updateVersificationOffsets({ 'es-1-1': 1 });
    expect(useBibleStore.getState().getVersificationOffset('es', 1, '1')).toBe(1);
    expect(useBibleStore.getState().getParallelVerseText()).toBe('ES dos');
    // Primary path untouched by offsets.
    expect(useBibleStore.getState().getVerseText()).toBe('KJV one');
  });

  it('accepts a {primary, secondary} pair via setReference', () => {
    useBibleStore.getState().setReference({ primary: reference, secondary: { bibleId: 'es' } });
    const state = useBibleStore.getState();
    expect(state.activeReference).toEqual(reference);
    expect(state.linkedBibleId).toBe('es');
  });

  it('single-translation behavior is unchanged when nothing is linked', () => {
    const state = useBibleStore.getState();
    expect(state.getPairedReference()).toBeNull();
    expect(state.getParallelVerseText()).toBe('');
    expect(state.getLinkedBible()).toBeNull();
  });

  it('switch-in-place keeps the pair and resolves both texts', async () => {
    await useBibleStore.getState().linkParallelBible('es');
    useBibleStore.getState().updateSettings({ switchInPlace: true });
    await useBibleStore.getState().setActiveBible('fr');
    const state = useBibleStore.getState();
    expect(state.activeBibleId).toBe('fr');
    expect(state.linkedBibleId).toBe('es');
    expect(state.activeReference).toEqual(reference);
    // Pair survived the switch warm: both texts resolve.
    expect(state.getVerseText()).toBe('FR un');
    expect(state.getParallelVerseText()).toBe('ES uno');
  });

  it('switching the primary onto the linked bible drops the self-pair', async () => {
    await useBibleStore.getState().linkParallelBible('es');
    await useBibleStore.getState().setActiveBible('es');
    expect(useBibleStore.getState().linkedBibleId).toBeNull();
  });

  it('eviction keeps the linked pair and drops the rest', async () => {
    await useBibleStore.getState().linkParallelBible('es');
    useBibleStore.getState().evictInactiveBibles();
    expect(Object.keys(useBibleStore.getState().bibles).sort()).toEqual(['es', 'kjv']);
  });

  it('search-all still blocks eviction with a pair linked', async () => {
    await useBibleStore.getState().linkParallelBible('es');
    useBibleStore.getState().setSearchAllOwner('pairing-test-a', true);
    useBibleStore.getState().evictInactiveBibles();
    expect(Object.keys(useBibleStore.getState().bibles).sort()).toEqual(['es', 'fr', 'kjv']);
    useBibleStore.getState().clearSearchAllOwner('pairing-test-a');
  });

  it('removing the linked bible unlinks it', async () => {
    // jsdom has no IndexedDB — stub the persistence layer (store logic is
    // what this test proves, same as the in-memory seeding above).
    vi.spyOn(bibleDb, 'delete').mockResolvedValue(undefined);
    await useBibleStore.getState().linkParallelBible('es');
    await useBibleStore.getState().removeBible('es');
    expect(useBibleStore.getState().linkedBibleId).toBeNull();
    vi.restoreAllMocks();
  });

  it('persists the link and offsets via the persisted slice', async () => {
    await useBibleStore.getState().linkParallelBible('es');
    useBibleStore.getState().updateVersificationOffsets({ 'es-1-1': 1 });
    const partialize = useBibleStore.persist.getOptions().partialize;
    const persisted = partialize(useBibleStore.getState());
    expect(persisted.linkedBibleId).toBe('es');
    expect(persisted.settings.versificationOffsets).toEqual({ 'es-1-1': 1 });
    // Single-translation keys persist exactly as before.
    expect(persisted.bibleMetadata.kjv).toEqual({ id: 'kjv', name: 'KJV' });
  });
});
