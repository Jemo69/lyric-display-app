import { BrowserWindow } from 'electron';
import { stopBackend } from './backend.js';
import { cleanupDisplayManager } from './displayManager.js';
import { getLoadingWindow } from './loadingWindow.js';
import createMainLogger from './logger.js';

const log = createMainLogger('Cleanup');

export function closeOutputWindows() {
  try {
    const windows = BrowserWindow.getAllWindows();
    const outputRoutes = ['/stage', '/output1', '/output2'];

    windows.forEach(win => {
      if (!win || win.isDestroyed()) return;
      try {
        const url = win.webContents.getURL();
        const isOutputWindow = outputRoutes.some(route => url.includes(route));
        if (isOutputWindow) {
          log.info('Closing output window on quit');
          win.close();
        }
      } catch (err) {
        log.warn('Error closing window on quit:', err);
      }
    });
  } catch (error) {
    log.error('Error closing output windows:', error);
  }
}

let isCleaningUp = false;

export function performCleanup() {
  if (isCleaningUp) {
    log.info('Already cleaning up, skipping duplicate call');
    return;
  }

  isCleaningUp = true;
  log.info('Starting cleanup process');

  try {
    const loadingWindow = getLoadingWindow();
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      log.info('Closing loading window');
      loadingWindow.destroy();
    }
  } catch (error) {
    log.error('Error closing loading window:', error);
  }

  try {
    stopBackend();
  } catch (error) {
    log.error('Error stopping backend:', error);
  }

  try {
    cleanupDisplayManager();
  } catch (error) {
    log.error('Error cleaning up display manager:', error);
  }

  closeOutputWindows();

  log.info('Cleanup process completed');
}