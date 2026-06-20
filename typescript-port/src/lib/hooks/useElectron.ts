import { isElectron } from '$lib/utils';

export function getElectronAPI() {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return (window as any).electronAPI;
  }
  return null;
}

export function getElectronStore() {
  if (typeof window !== 'undefined' && (window as any).electronStore) {
    return (window as any).electronStore;
  }
  return null;
}

// Helper to safely call Electron API methods
export async function electronInvoke<T>(
  method: string,
  ...args: unknown[]
): Promise<T | null> {
  const api = getElectronAPI();
  if (!api || !api[method]) {
    console.warn(`Electron API method '${method}' not available`);
    return null;
  }
  try {
    return await api[method](...args);
  } catch (error) {
    console.error(`Electron API error (${method}):`, error);
    return null;
  }
}

// Helper to listen to Electron events
export function electronOn(
  event: string,
  callback: (...args: unknown[]) => void
): () => void {
  const api = getElectronAPI();
  if (!api || !api[event]) {
    return () => {};
  }
  try {
    return api[event](callback);
  } catch (error) {
    console.error(`Electron event listener error (${event}):`, error);
    return () => {};
  }
}
