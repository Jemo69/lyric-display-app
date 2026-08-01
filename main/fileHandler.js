import path from 'path';
import createMainLogger from './logger.js';

const log = createMainLogger('FileHandler');

let pendingFileToOpen = null;

export function getPendingFile() {
  return pendingFileToOpen;
}

export function clearPendingFile() {
  pendingFileToOpen = null;
}

export function setPendingFile(filePath) {
  pendingFileToOpen = filePath;
  log.info('Stored file for later:', filePath);
}

export function isSupportedLyricsFile(filePath) {
  if (!filePath) return false;
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.txt' || ext === '.lrc';
}

export function isSupportedSetlistFile(filePath) {
  if (!filePath) return false;
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.ldset';
}

export function isSupportedFile(filePath) {
  return isSupportedLyricsFile(filePath) || isSupportedSetlistFile(filePath);
}

export function extractFilePathFromArgs(args) {
  return args.find(arg => isSupportedFile(arg));
}

/**
 * Handle opening a file from the operating system
 * @param {string} filePath - Absolute path to the file
 * @param {BrowserWindow} mainWindow - The main window instance
 */
export async function handleFileOpen(filePath, mainWindow) {
  if (!filePath) return;

  log.info('Handling file open request:', filePath);

  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.ldset') {
    log.info('Opening setlist file:', filePath);
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      try {
        mainWindow.webContents.send('open-setlist-from-path', { filePath });
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      } catch (error) {
        log.error('Error sending setlist to renderer:', error);
      }
    } else {
      setPendingFile(filePath);
    }
    return;
  }

  if (ext !== '.txt' && ext !== '.lrc') {
    log.warn('Unsupported file type:', ext);
    return;
  }

  try {
    const fs = await import('fs/promises');
    await fs.access(filePath);
  } catch (error) {
    log.error('File not accessible:', filePath, error);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('open-lyrics-from-path-error', { filePath });
    }
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);
      const fileType = ext.substring(1);

      log.info('Sending file to renderer:', fileName);

      mainWindow.webContents.send('open-lyrics-from-path', {
        content,
        fileName,
        filePath,
        fileType
      });

      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } catch (error) {
      log.error('Error reading file:', error);
      mainWindow.webContents.send('open-lyrics-from-path-error', { filePath });
    }
  } else {
    setPendingFile(filePath);
  }
}

/**
 * Process pending file if one exists
 * @param {BrowserWindow} mainWindow - The main window instance
 */
export function processPendingFile(mainWindow) {
  if (pendingFileToOpen) {
    log.info('Processing pending file:', pendingFileToOpen);
    setTimeout(() => {
      handleFileOpen(pendingFileToOpen, mainWindow);
      clearPendingFile();
    }, 1000);
  }
}