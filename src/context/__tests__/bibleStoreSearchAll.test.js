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

const OWNER_A = 'bible-control-panel';
const OWNER_B = 'bible-search-modal';

describe('BibleStore search-all ownership', () => {
  beforeEach(() => {
    localStorage.removeItem('bible-store');
    useBibleStore.setState({
      bibles: { ...bibles },
      bibleMetadata: {
        b1: { id: 'b1', name: 'KJV' },
        b2: { id: 'b2', name: 'NIV' }
      },
      activeBibleId: 'b1',
      activeReference: null,
      selectedVerses: [[1]]
    });
    useBibleStore.getState().clearSearchAllOwner(OWNER_A);
    useBibleStore.getState().clearSearchAllOwner(OWNER_B);
  });

  it('does not evict inactive bibles while any owner has search-all enabled', () => {
    const store = useBibleStore.getState();

    store.setSearchAllOwner(OWNER_A, true);
    store.evictInactiveBibles();

    expect(Object.keys(useBibleStore.getState().bibles).sort()).toEqual(['b1', 'b2']);
  });

  it('keeps search-all active when a second owner mounts with search-all off', () => {
    const store = useBibleStore.getState();

    store.setSearchAllOwner(OWNER_A, true);
    store.setSearchAllOwner(OWNER_B, false);

    store.evictInactiveBibles();
    expect(Object.keys(useBibleStore.getState().bibles).sort()).toEqual(['b1', 'b2']);

    store.setActiveBible('b2');
    expect(Object.keys(useBibleStore.getState().bibles).sort()).toEqual(['b1', 'b2']);
  });

  it('allows eviction once every owner releases search-all', () => {
    const store = useBibleStore.getState();

    store.setSearchAllOwner(OWNER_A, true);
    store.setSearchAllOwner(OWNER_B, true);
    store.clearSearchAllOwner(OWNER_A);
    store.clearSearchAllOwner(OWNER_B);

    store.evictInactiveBibles();
    expect(Object.keys(useBibleStore.getState().bibles)).toEqual(['b1']);
  });

  it('a dismounting owner cannot leave the flag stuck on', () => {
    const store = useBibleStore.getState();

    store.setSearchAllOwner(OWNER_A, true);
    store.clearSearchAllOwner(OWNER_A);

    store.evictInactiveBibles();
    expect(Object.keys(useBibleStore.getState().bibles)).toEqual(['b1']);
  });

  it('one owner disabling search-all does not disable it for another owner', () => {
    const store = useBibleStore.getState();

    store.setSearchAllOwner(OWNER_A, true);
    store.setSearchAllOwner(OWNER_B, true);
    store.setSearchAllOwner(OWNER_B, false);

    store.evictInactiveBibles();
    expect(Object.keys(useBibleStore.getState().bibles).sort()).toEqual(['b1', 'b2']);
  });
});
