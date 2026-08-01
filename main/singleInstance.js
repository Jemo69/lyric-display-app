import { app } from 'electron';
import createMainLogger from './logger.js';

const log = createMainLogger('SingleInstance');

/**
 * Setup single instance lock and handle second instance events
 * @param {Function} onSecondInstance - Callback when second instance is detected
 * @returns {boolean} - Whether the lock was acquired
 */
export function setupSingleInstanceLock(onSecondInstance) {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    log.info('Another instance is already running. Exiting...');
    app.quit();
    return false;
  }

  app.on('second-instance', (_event, commandLine, _workingDirectory) => {
    log.info('Second instance detected');
    if (onSecondInstance) {
      onSecondInstance(commandLine);
    }
  });

  return true;
}