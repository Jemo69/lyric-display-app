import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useFreeShowStore = create(
  persist(
    (set, get) => ({
      apiUrl: 'http://localhost:5506',
      lastAction: 'next_slide',
      lastData: '{}',
      history: [],
      isEnabled: false,

      savedActions: [],
      autoRunActionId: null,

      setApiUrl: (url) => set({ apiUrl: url }),
      setLastAction: (action) => set({ lastAction: action }),
      setLastData: (data) => set({ lastData: data }),
      setIsEnabled: (enabled) => set({ isEnabled: enabled }),
      setAutoRunActionId: (id) => set({ autoRunActionId: id }),

      addSavedAction: (action) => set((state) => ({ 
        savedActions: [...state.savedActions, { ...action, id: crypto.randomUUID() }] 
      })),

      removeSavedAction: (id) => set((state) => ({ 
        savedActions: state.savedActions.filter(a => a.id !== id),
        autoRunActionId: state.autoRunActionId === id ? null : state.autoRunActionId
      })),

      updateSavedAction: (id, updates) => set((state) => ({
        savedActions: state.savedActions.map(a => a.id === id ? { ...a, ...updates } : a)
      })),

      runAction: async (actionId, dataString) => {
        const { apiUrl } = get();
        try {
          let data = {};
          if (dataString && typeof dataString === 'string' && dataString.trim() !== '') {
            try {
              data = JSON.parse(dataString);
            } catch (e) {
              console.warn('Failed to parse data as JSON, sending as empty object', e);
            }
          } else if (typeof dataString === 'object') {
            data = dataString;
          }

          const response = await fetch(apiUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: actionId, ...data }),
          });

          const result = await response.json();
          
          set((state) => ({
            history: [{
              timestamp: Date.now(),
              action: actionId,
              data: typeof dataString === 'string' ? dataString : JSON.stringify(dataString),
              success: response.ok,
              response: result
            }, ...state.history].slice(0, 20)
          }));

          return { success: response.ok, result };
        } catch (error) {
          console.error('FreeShow API Error:', error);
          set((state) => ({
            history: [{
              timestamp: Date.now(),
              action: actionId,
              data: typeof dataString === 'string' ? dataString : JSON.stringify(dataString),
              success: false,
              error: error.message
            }, ...state.history].slice(0, 20)
          }));
          return { success: false, error: error.message };
        }
      },

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'freeshow-store',
    }
  )
);

export default useFreeShowStore;
