import { BrowserWindow, ipcMain } from 'electron';

/**
 * Register window control IPC handlers
 * Handles window operations like minimize, maximize, close, fullscreen, devtools, zoom
 */
export function registerWindowHandlers({ getMainWindow, updateUndoRedoState }) {
  const getTargetWindow = (event) => {
    const senderWindow = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    if (senderWindow && !senderWindow.isDestroyed()) return senderWindow;
    return getMainWindow?.();
  };

  ipcMain.on('undo-redo-state', (_event, { canUndo, canRedo }) => {
    if (typeof updateUndoRedoState === 'function') {
      updateUndoRedoState({ canUndo, canRedo });
    }
  });

  ipcMain.handle('window:minimize', (event) => {
    const win = getTargetWindow(event);
    if (win && !win.isDestroyed()) {
      try {
        win.minimize();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'No window' };
  });

  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = getTargetWindow(event);
    if (!win || win.isDestroyed()) return { success: false, error: 'No window' };
    try {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
      const payload = {
        isMaximized: win.isMaximized(),
        isFullScreen: win.isFullScreen(),
        isFocused: win.isFocused()
      };
      try {
        win.webContents.send('window-state', payload);
      } catch { }
      return { success: true, ...payload };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('window:close', (event) => {
    const win = getTargetWindow(event);
    if (!win || win.isDestroyed()) return { success: false, error: 'No window' };
    try {
      win.close();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('window:toggle-fullscreen', (event) => {
    const win = getTargetWindow(event);
    if (!win || win.isDestroyed()) return { success: false, error: 'No window' };
    try {
      const next = !win.isFullScreen();
      win.setFullScreen(next);

      try {
        win.webContents.send('window-state', {
          isMaximized: win.isMaximized(),
          isFullScreen: next,
          isFocused: win.isFocused()
        });
      } catch { }
      return { success: true, isFullScreen: next };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('window:reload', (event) => {
    const win = getTargetWindow(event);
    if (!win || win.isDestroyed()) return { success: false, error: 'No window' };
    try {
      win.reload();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('window:devtools', (event) => {
    const win = getTargetWindow(event);
    if (!win || win.isDestroyed()) return { success: false, error: 'No window' };
    try {
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
      } else {
        win.webContents.openDevTools({ mode: 'detach' });
      }
      return { success: true, isOpen: win.webContents.isDevToolsOpened() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('window:zoom', (event, direction) => {
    const win = getTargetWindow(event);
    if (!win || win.isDestroyed()) return { success: false, error: 'No window' };
    try {
      const wc = win.webContents;
      const current = wc.getZoomFactor();
      let next = current;
      if (direction === 'in') next = Math.min(current + 0.1, 3);
      else if (direction === 'out') next = Math.max(current - 0.1, 0.3);
      else if (direction === 'reset') next = 1;
      wc.setZoomFactor(next);
      return { success: true, zoomFactor: next };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('window:get-state', (event) => {
    const win = getTargetWindow(event);
    if (!win || win.isDestroyed()) return { success: false, error: 'No window' };
    try {
      return {
        success: true,
        state: {
          isMaximized: win.isMaximized(),
          isFullScreen: win.isFullScreen(),
          isFocused: win.isFocused()
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
