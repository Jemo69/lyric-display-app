import Store from 'electron-store';
import createMainLogger from './logger.js';

const log = createMainLogger('Theme');

const themeStore = new Store({
  name: 'preferences',
  defaults: {
    darkMode: null
  }
});

export function getSavedDarkMode() {
  try {
    const value = themeStore.get('darkMode');
    return typeof value === 'boolean' ? value : null;
  } catch (error) {
    log.warn('Failed to read saved dark mode:', error);
    return null;
  }
}

export function saveDarkModePreference(isDark) {
  try {
    themeStore.set('darkMode', !!isDark);
  } catch (error) {
    log.warn('Failed to persist dark mode:', error);
  }
}