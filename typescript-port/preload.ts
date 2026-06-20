import { contextBridge, ipcRenderer } from 'electron';

// IPC channel types
interface WindowState {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
}

interface ModalRequest {
  id: string;
  variant: string;
  title: string;
  size: string;
  actions: Array<{ label: string; value: number; variant: string; autoFocus?: boolean }>;
  body: string;
  dismissible: boolean;
  allowBackdropClose: boolean;
}

interface Provider {
  id: string;
  name: string;
  description?: string;
  hasApiKey?: boolean;
}

interface Display {
  id: string;
  label?: string;
  primary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

// Expose protected methods via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  tokenStore: {
    get: (payload?: Record<string, unknown>) => ipcRenderer.invoke('token-store:get', payload),
    set: (payload: Record<string, unknown>) => ipcRenderer.invoke('token-store:set', payload),
    clear: (payload?: Record<string, unknown>) => ipcRenderer.invoke('token-store:clear', payload)
  },
  toggleDarkMode: () => ipcRenderer.invoke('toggle-dark-mode'),
  getDarkMode: () => ipcRenderer.invoke('get-dark-mode'),
  setDarkMode: (isDark: boolean) => ipcRenderer.invoke('set-dark-mode', isDark),
  syncNativeDarkMode: (isDark: boolean) => ipcRenderer.invoke('sync-native-dark-mode', isDark),
  loadLyricsFile: () => ipcRenderer.invoke('load-lyrics-file'),
  parseLyricsFile: (payload: {
    fileType?: string;
    path?: string;
    rawText?: string;
    enableSplitting?: boolean;
    splitConfig?: Record<string, unknown>;
  }) => ipcRenderer.invoke('parse-lyrics-file', payload),
  getAdminKey: () => ipcRenderer.invoke('get-admin-key'),
  getJoinCode: () => ipcRenderer.invoke('get-join-code'),
  getDesktopJWT: (payload: { deviceId: string; sessionId: string }) => ipcRenderer.invoke('get-desktop-jwt', payload),
  getConnectionDiagnostics: () => ipcRenderer.invoke('get-connection-diagnostics'),
  newLyricsFile: () => ipcRenderer.invoke('new-lyrics-file'),
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  getSystemFonts: () => ipcRenderer.invoke('fonts:list'),
  getPlatform: () => process.platform,
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
    close: () => ipcRenderer.invoke('window:close'),
    reload: () => ipcRenderer.invoke('window:reload'),
    toggleDevTools: () => ipcRenderer.invoke('window:devtools'),
    setZoom: (direction: 'in' | 'out' | 'reset') => ipcRenderer.invoke('window:zoom', direction),
    getState: () => ipcRenderer.invoke('window:get-state'),
  },
  onWindowState: (callback: (state: WindowState) => void) => {
    const channel = 'window-state';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_event: Electron.IpcRendererEvent, state: WindowState) => callback?.(state));
    return () => ipcRenderer.removeAllListeners(channel);
  },
  onTriggerFileLoad: (callback: () => void) => {
    ipcRenderer.removeAllListeners('trigger-file-load');
    ipcRenderer.on('trigger-file-load', callback);
  },
  onNavigateToNewSong: (callback: () => void) => {
    ipcRenderer.removeAllListeners('navigate-to-new-song');
    ipcRenderer.on('navigate-to-new-song', callback);
  },
  onDarkModeToggle: (callback: () => void) => ipcRenderer.on('toggle-dark-mode', callback),
  showSaveDialog: (options: Electron.SaveDialogOptions) => ipcRenderer.invoke('show-save-dialog', options),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  onProgressUpdate: (callback: (progress: number) => void) => {
    ipcRenderer.removeAllListeners('progress-update');
    ipcRenderer.on('progress-update', (_event: Electron.IpcRendererEvent, progress: number) => callback(progress));
  },
  onLoadingStatus: (callback: (status: string) => void) => {
    ipcRenderer.removeAllListeners('loading-status');
    ipcRenderer.on('loading-status', (_event: Electron.IpcRendererEvent, status: string) => callback(status));
  },
  onAdminKeyAvailable: (callback: (payload: { hasKey: boolean }) => void) => {
    const channel = 'admin-key:available';
    const handler = (_event: Electron.IpcRendererEvent, payload: { hasKey: boolean }) => callback?.(payload);
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  openInAppBrowser: (url: string) => ipcRenderer.invoke('open-in-app-browser', url),
  addRecentFile: (filePath: string) => ipcRenderer.invoke('add-recent-file', filePath),
  recents: {
    list: () => ipcRenderer.invoke('recents:list'),
    clear: () => ipcRenderer.invoke('recents:clear'),
    open: (filePath: string) => ipcRenderer.invoke('recents:open', filePath),
    onChange: (callback: (list: string[]) => void) => {
      const channel = 'recents:update';
      ipcRenderer.removeAllListeners(channel);
      ipcRenderer.on(channel, (_event: Electron.IpcRendererEvent, list: string[]) => callback?.(list));
      return () => ipcRenderer.removeAllListeners(channel);
    }
  },
  openOutputWindow: (outputNumber: number) => ipcRenderer.invoke('open-output-window', outputNumber),
  outputAutomation: {
    fire: (payload: { endpointUrl: string; value: string }) => ipcRenderer.invoke('output-automation:fire', payload),
  },
  onOpenLyricsFromPath: (callback: (payload: unknown) => void) => {
    const channel = 'open-lyrics-from-path';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload));
    return () => ipcRenderer.removeAllListeners(channel);
  },
  checkForUpdates: (showNoUpdateDialog?: boolean) => ipcRenderer.invoke('updater:check', showNoUpdateDialog),
  onUpdateAvailable: (callback: (info: unknown) => void) => {
    const channel = 'updater:update-available';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_event: Electron.IpcRendererEvent, info: unknown) => callback(info));
    return () => ipcRenderer.removeAllListeners(channel);
  },
  onUpdateDownloaded: (callback: () => void) => {
    const channel = 'updater:update-downloaded';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_event: Electron.IpcRendererEvent) => callback());
    return () => ipcRenderer.removeAllListeners(channel);
  },
  onUpdateError: (callback: (msg: string) => void) => {
    const channel = 'updater:update-error';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_event: Electron.IpcRendererEvent, msg: string) => callback(msg));
    return () => ipcRenderer.removeAllListeners(channel);
  },
  requestUpdateDownload: () => ipcRenderer.invoke('updater:download'),
  requestInstallAndRestart: () => ipcRenderer.invoke('updater:install'),
  displaySettings: {
    openModal: () => ipcRenderer.invoke('display:open-settings-modal')
  },
  onOpenShortcutsHelp: (callback: () => void) => {
    const channel = 'open-shortcuts-help';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, callback);
    return () => ipcRenderer.removeAllListeners(channel);
  },
  onOpenQRCodeDialog: (callback: () => void) => {
    const channel = 'open-qr-dialog';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, callback);
    return () => ipcRenderer.removeAllListeners(channel);
  },
  onOpenEasyWorshipImport: (callback: () => void) => {
    const channel = 'open-easyworship-import';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, callback);
    return () => ipcRenderer.removeAllListeners(channel);
  },
  onOpenSupportDevModal: (callback: () => void) => {
    const channel = 'open-support-dev-modal';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, callback);
    return () => ipcRenderer.removeAllListeners(channel);
  },
  onMenuUndo: (callback: () => void) => {
    const channel = 'menu-undo';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, callback);
    return () => ipcRenderer.removeAllListeners(channel);
  },
  onMenuRedo: (callback: () => void) => {
    const channel = 'menu-redo';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, callback);
    return () => ipcRenderer.removeAllListeners(channel);
  },
  notifyUndoRedoState: (canUndo: boolean, canRedo: boolean) => ipcRenderer.send('undo-redo-state', { canUndo, canRedo }),
  onOpenLyricsFromPathError: (callback: (payload: unknown) => void) => {
    const channel = 'open-lyrics-from-path-error';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload));
    return () => ipcRenderer.removeAllListeners(channel);
  },
  onOpenSetlistFromPath: (callback: (payload: unknown) => void) => {
    const channel = 'open-setlist-from-path';
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload));
    return () => ipcRenderer.removeAllListeners(channel);
  },
  browserBack: () => ipcRenderer.send('browser-nav', 'back'),
  browserForward: () => ipcRenderer.send('browser-nav', 'forward'),
  browserReload: () => ipcRenderer.send('browser-nav', 'reload'),
  browserNavigate: (url: string) => ipcRenderer.send('browser-nav', 'navigate', url),
  browserOpenExternal: () => ipcRenderer.send('browser-open-external'),
  onBrowserLocation: (callback: (url: string) => void) => {
    ipcRenderer.removeAllListeners('browser-location');
    ipcRenderer.on('browser-location', (_event: Electron.IpcRendererEvent, url: string) => callback(url));
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  onModalRequest: (callback: (payload: ModalRequest) => void) => {
    const channel = 'modal-bridge:request';
    ipcRenderer.removeAllListeners(channel);
    const handler = (_event: Electron.IpcRendererEvent, payload: ModalRequest) => callback?.(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  resolveModalRequest: (id: string, result: unknown) => ipcRenderer.invoke('modal-bridge:resolve', { id, result }),
  rejectModalRequest: (id: string, error?: string) => ipcRenderer.invoke('modal-bridge:reject', { id, error: error?.message || error || 'cancelled' }),
  lyrics: {
    listProviders: () => ipcRenderer.invoke('lyrics:providers:list'),
    getProviderKey: (providerId: string) => ipcRenderer.invoke('lyrics:providers:key:get', { providerId }),
    saveProviderKey: (providerId: string, key: string) => ipcRenderer.invoke('lyrics:providers:key:set', { providerId, key }),
    deleteProviderKey: (providerId: string) => ipcRenderer.invoke('lyrics:providers:key:delete', { providerId }),
    search: (payload: { query: string; limit?: number; skipCache?: boolean }) => ipcRenderer.invoke('lyrics:search', payload),
    fetch: (payload: { providerId: string; payload: unknown }) => ipcRenderer.invoke('lyrics:fetch', payload),
    onPartialResults: (callback: (payload: unknown) => void) => {
      ipcRenderer.removeAllListeners('lyrics:search:partial');
      ipcRenderer.on('lyrics:search:partial', (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload));
      return () => ipcRenderer.removeAllListeners('lyrics:search:partial');
    }
  },
  easyWorship: {
    validatePath: (path: string) => ipcRenderer.invoke('easyworship:validate-path', { path }),
    browseForPath: () => ipcRenderer.invoke('easyworship:browse-path'),
    browseForDestination: () => ipcRenderer.invoke('easyworship:browse-destination'),
    importSong: (params: unknown) => ipcRenderer.invoke('easyworship:import-song', params),
    openFolder: (path: string) => ipcRenderer.invoke('easyworship:open-folder', { path }),
    getUserHome: () => ipcRenderer.invoke('easyworship:get-user-home')
  },
  display: {
    getAll: () => ipcRenderer.invoke('display:get-all'),
    getPrimary: () => ipcRenderer.invoke('display:get-primary'),
    getById: (displayId: string) => ipcRenderer.invoke('display:get-by-id', { displayId }),
    saveAssignment: (displayId: string, outputKey: string) => ipcRenderer.invoke('display:save-assignment', { displayId, outputKey }),
    getAssignment: (displayId: string) => ipcRenderer.invoke('display:get-assignment', { displayId }),
    getAllAssignments: () => ipcRenderer.invoke('display:get-all-assignments'),
    removeAssignment: (displayId: string) => ipcRenderer.invoke('display:remove-assignment', { displayId }),
    openOutputOnDisplay: (outputKey: string, displayId: string) => ipcRenderer.invoke('display:open-output-on-display', { outputKey, displayId }),
    closeOutputWindow: (outputKey: string) => ipcRenderer.invoke('display:close-output-window', { outputKey })
  },
  setlist: {
    save: (setlistData: unknown, defaultName?: string) => ipcRenderer.invoke('setlist:save', { setlistData, defaultName }),
    load: () => ipcRenderer.invoke('setlist:load'),
    loadFromPath: (filePath: string) => ipcRenderer.invoke('setlist:load-from-path', { filePath }),
    getUserHome: () => ipcRenderer.invoke('setlist:get-user-home'),
    browseFiles: () => ipcRenderer.invoke('setlist:browse-files'),
    export: (setlistData: unknown, options: { title?: string; includeLyrics?: boolean; format?: 'pdf' | 'txt' }) => ipcRenderer.invoke('setlist:export', { setlistData, options })
  },
  templates: {
    load: (type: string) => ipcRenderer.invoke('templates:load', { type }),
    save: (type: string, template: unknown) => ipcRenderer.invoke('templates:save', { type, template }),
    delete: (type: string, templateId: string) => ipcRenderer.invoke('templates:delete', { type, templateId }),
    update: (type: string, templateId: string, updates: unknown) => ipcRenderer.invoke('templates:update', { type, templateId, updates }),
    nameExists: (type: string, name: string, excludeId?: string) => ipcRenderer.invoke('templates:name-exists', { type, name, excludeId })
  },
  bible: {
    loadFile: () => ipcRenderer.invoke('bible:load-file'),
    loadAll: () => ipcRenderer.invoke('bible:load-all'),
    save: (id: string, data: unknown) => ipcRenderer.invoke('bible:save', { id, data }),
    delete: (id: string) => ipcRenderer.invoke('bible:delete', { id }),
    parseString: (content: string, fileName: string) => ipcRenderer.invoke('bible:parse-string', { content, fileName })
  },
  updateHardwareAcceleration: (disabled: boolean) => ipcRenderer.invoke('performance:update-hda', disabled)
});

contextBridge.exposeInMainWorld('electronStore', {
  getDarkMode: (): boolean => {
    try {
      const store = JSON.parse(localStorage.getItem('lyrics-store') || '{}');
      return store?.state?.darkMode || false;
    } catch {
      return false;
    }
  }
});

// Type declaration for the window object
declare global {
  interface Window {
    electronAPI: import('$lib/types').ElectronAPI;
    electronStore: import('$lib/types').ElectronStore;
  }
}
