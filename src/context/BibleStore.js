import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createLogger } from '../utils/logger.js';
import { bibleDb } from '../utils/db.js';

const log = createLogger('BibleStore');

const useBibleStore = create(
  persist(
    (set, get) => ({
      bibles: {},
      bibleMetadata: {},
      activeBibleId: null,
      defaultBibleId: null,
      activeReference: null,
      selectedVerses: [[1]],
      searchResults: [],
      bibleHistory: [],
      searchIndex: null,
      settings: {
        referenceDivider: ':',
        showVerseNumbers: true,
        splitLongVerses: false,
        longVersesChars: 100,
        longVersesTolerance: 0
      },
      ui: {
        libraryCollapsed: false,
        sidePanelCollapsed: false,
        historyCollapsed: true,
        sidePanelWidth: 380,
      },

      addBible: async (id, bible) => {
        log.info('Bible added', { id, name: bible.name });
        await bibleDb.set(id, bible);
        set((state) => ({
          bibles: { ...state.bibles, [id]: bible },
          bibleMetadata: {
            ...state.bibleMetadata,
            [id]: { name: bible.name, id }
          }
        }));
      },

      removeBible: async (id) => {
        log.info('Bible removed', { id });
        await bibleDb.delete(id);
        set((state) => {
          const { [id]: _, ...bibles } = state.bibles;
          const { [id]: __, ...metadata } = state.bibleMetadata;
          return {
            bibles,
            bibleMetadata: metadata,
            activeBibleId: state.activeBibleId === id ? null : state.activeBibleId,
            defaultBibleId: state.defaultBibleId === id ? null : state.defaultBibleId
          };
        });
      },

      setActiveBible: async (id) => {
        log.info('Active Bible changed', { id });
        const state = get();
        if (id && !state.bibles[id]) {
          const bible = await bibleDb.get(id);
          if (bible) {
            set((state) => ({
              bibles: { ...state.bibles, [id]: bible }
            }));
          }
        }
        set({
          activeBibleId: id,
          activeReference: null,
          selectedVerses: [[1]]
        });
      },

      loadAllBibles: async () => {
        const state = get();
        const metadataIds = Object.keys(state.bibleMetadata);
        const loadedIds = Object.keys(state.bibles);
        const toLoad = metadataIds.filter(id => !loadedIds.includes(id));

        if (toLoad.length === 0) return;

        const loadedBibles = {};
        for (const id of toLoad) {
          const bible = await bibleDb.get(id);
          if (bible) {
            loadedBibles[id] = bible;
          }
        }

        if (Object.keys(loadedBibles).length > 0) {
          set(state => ({
            bibles: { ...state.bibles, ...loadedBibles }
          }));
        }
      },

      setDefaultBible: (id) => {
        log.info('Default Bible set', { id });
        set({ defaultBibleId: id });
      },

      setReference: (reference) => {
        log.debug('Reference changed', { reference });
        set({ activeReference: reference });
      },

      setSelectedVerses: (verses) => set({ selectedVerses: verses }),

      clearSearchResults: () => set({ searchResults: [] }),

      setSearchIndex: (index) => {
        log.info('Search index updated', { hasIndex: !!index });
        set({ searchIndex: index });
      },

      updateSettings: (newSettings) => {
        log.info('Bible settings updated', { keys: Object.keys(newSettings) });
        set((state) => ({
          settings: { ...state.settings, ...newSettings }
        }));
      },
      setUIState: (newUI) => set((state) => ({
        ui: { ...state.ui, ...newUI }
      })),

      getBibleById: (id) => {
        const state = get();
        return state.bibles[id] || null;
      },

      getActiveBible: () => {
        const state = get();
        if (!state.activeBibleId) return null;
        return state.bibles[state.activeBibleId] || null;
      },

      getVerseText: () => {
        const state = get();
        const bible = state.bibles[state.activeBibleId];
        if (!bible || !state.activeReference) return '';

        // Use lookup maps if available
        const bookObj = (bible.bookMap && bible.bookMap[state.activeReference.book]) || bible.books.find(b => b.number === state.activeReference.book);
        if (!bookObj) return '';

        const chapterNum = parseInt(state.activeReference.chapters?.[0]);
        const chapter = (bookObj.chapterMap && bookObj.chapterMap[chapterNum]) || bookObj.chapters.find(
          c => c.number === chapterNum
        );
        if (!chapter) return '';

        const verses = state.selectedVerses[0] || [];
        const texts = verses.map(v => {
          const verse = (chapter.verseMap && chapter.verseMap[v]) || chapter.verses.find(vx => vx.number === v);
          return verse?.text || '';
        }).filter(Boolean);

        return texts.join(' ');
      },

      getFormattedReference: () => {
        const state = get();
        const bible = state.bibles[state.activeBibleId];
        if (!bible || !state.activeReference) return '';

        const book = (bible.bookMap && bible.bookMap[state.activeReference.book]) || bible.books.find(b => b.number === state.activeReference.book);
        if (!book) return '';

        const chapters = state.activeReference.chapters?.join(',') || '';
        const verses = formatVerseSelection(state.selectedVerses[0] || []);

        if (!verses) {
          return `${book.name} ${chapters}`;
        }

        return `${book.name} ${chapters}:${verses}`;
      },

      addToBibleHistory: (reference, text) => set((state) => {
        if (!reference || !text) return state;
        const entry = {
          id: `verse_${Date.now()}`,
          reference,
          text,
          timestamp: Date.now(),
          bibleId: state.activeBibleId,
          bibleName: state.bibleMetadata[state.activeBibleId]?.name
        };
        // Keep unique by reference
        const filteredHistory = state.bibleHistory.filter(h => h.reference !== reference);
        return {
          bibleHistory: [entry, ...filteredHistory].slice(0, 50)
        };
      }),

      clearBibleHistory: () => set({ bibleHistory: [] }),

      reset: () => set({
        activeReference: null,
        selectedVerses: [[1]],
        searchResults: []
      })
    }),
    {
      name: 'bible-store',
      partialize: (state) => ({
        bibleMetadata: state.bibleMetadata,
        defaultBibleId: state.defaultBibleId,
        bibleHistory: state.bibleHistory,
        settings: state.settings,
        ui: state.ui
      }),
      onRehydrateStorage: () => async (state, error) => {
        if (error || !state) return;

        // Migration from localStorage to IndexedDB
        const bibles = state.bibles || {};
        const bibleIds = Object.keys(bibles);

        if (bibleIds.length > 0) {
          log.info('Migrating bibles from localStorage to IndexedDB', { count: bibleIds.length });
          for (const id of bibleIds) {
            await bibleDb.set(id, bibles[id]);
          }
          // Clear bibles from state to ensure they are not persisted to localStorage again
          // However, we need to keep active bible in memory if possible
          // For now, let's just let it be. The partialize will handle not saving them.
        }
      }
    }
  )
);

log.info('BibleStore initialized');

export default useBibleStore;

function formatVerseSelection(verses) {
  const values = [...new Set((verses || []).filter((verse) => Number.isInteger(verse)))].sort((a, b) => a - b);
  if (values.length === 0) return '';

  const ranges = [];
  let start = values[0];
  let previous = values[0];

  for (let i = 1; i < values.length; i++) {
    const current = values[i];
    if (current === previous + 1) {
      previous = current;
      continue;
    }

    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = current;
    previous = current;
  }

  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return ranges.join(',');
}
