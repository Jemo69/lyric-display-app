import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createLogger } from '../utils/logger.js';

const log = createLogger('RccgTphbStore');

const useRccgTphbStore = create(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: '',
      isConnected: false,

      setApiKey: (key) => {
        log.info('API key updated');
        set({ apiKey: key });
      },
      setBaseUrl: (url) => {
        log.info('Base URL updated', { url: url.replace(/\/+$/, '') });
        set({ baseUrl: url.replace(/\/+$/, '') });
      },
      clearCredentials: () => {
        log.info('Credentials cleared');
        set({ apiKey: '', baseUrl: '', isConnected: false });
      },
      setConnected: (val) => {
        log.info('Connection state changed', { isConnected: val });
        set({ isConnected: val });
      },
    }),
    {
      name: 'rccg-tphb-store',
    }
  )
);

log.info('RccgTphbStore initialized');

export default useRccgTphbStore;
