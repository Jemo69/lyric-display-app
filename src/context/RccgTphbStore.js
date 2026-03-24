import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useRccgTphbStore = create(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: '',
      isConnected: false,

      setApiKey: (key) => set({ apiKey: key }),
      setBaseUrl: (url) => set({ baseUrl: url.replace(/\/+$/, '') }),
      clearCredentials: () => set({ apiKey: '', baseUrl: '', isConnected: false }),
      setConnected: (val) => set({ isConnected: val }),
    }),
    {
      name: 'rccg-tphb-store',
    }
  )
);

export default useRccgTphbStore;
