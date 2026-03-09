import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useBibleStore = create(
  persist(
    (set, get) => ({
      bibles: {},
      bibleMetadata: {},
      activeBibleId: null,
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

      addBible: (id, bible) => set((state) => ({
        bibles: { ...state.bibles, [id]: bible },
        bibleMetadata: {
          ...state.bibleMetadata,
          [id]: { name: bible.name, id }
        }
      })),

      removeBible: (id) => set((state) => {
        const { [id]: _, ...bibles } = state.bibles;
        const { [id]: __, ...metadata } = state.bibleMetadata;
        return {
          bibles,
          bibleMetadata: metadata,
          activeBibleId: state.activeBibleId === id ? null : state.activeBibleId
        };
      }),

      setActiveBible: (id) => set({
        activeBibleId: id,
        activeReference: null,
        selectedVerses: [[1]]
      }),

      setReference: (reference) => set({ activeReference: reference }),

      setSelectedVerses: (verses) => set({ selectedVerses: verses }),

      clearSearchResults: () => set({ searchResults: [] }),

      setSearchIndex: (index) => set({ searchIndex: index }),

      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
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

        const book = bible.books.find(b => b.number === state.activeReference.book);
        if (!book) return '';

        const chapter = book.chapters.find(
          c => c.number === parseInt(state.activeReference.chapters?.[0])
        );
        if (!chapter) return '';

        const verses = state.selectedVerses[0] || [];
        const texts = verses.map(v => {
          const verse = chapter.verses.find(vx => vx.number === v);
          return verse?.text || '';
        }).filter(Boolean);

        return texts.join(' ');
      },

      getFormattedReference: () => {
        const state = get();
        const bible = state.bibles[state.activeBibleId];
        if (!bible || !state.activeReference) return '';

        const book = bible.books.find(b => b.number === state.activeReference.book);
        if (!book) return '';

        const chapters = state.activeReference.chapters?.join(',') || '';
        const verses = state.selectedVerses[0]?.join(',') || '';

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
        bibles: state.bibles,
        bibleMetadata: state.bibleMetadata,
        bibleHistory: state.bibleHistory,
        settings: state.settings
      })
    }
  )
);

export default useBibleStore;
