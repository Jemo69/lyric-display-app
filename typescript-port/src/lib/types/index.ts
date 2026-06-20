// Electron IPC channel types
export interface ElectronAPI {
  tokenStore: {
    get: (payload?: Record<string, unknown>) => Promise<string | null>;
    set: (payload: Record<string, unknown>) => Promise<{ success: boolean }>;
    clear: (payload?: Record<string, unknown>) => Promise<{ success: boolean }>;
  };
  toggleDarkMode: () => Promise<void>;
  getDarkMode: () => Promise<boolean>;
  setDarkMode: (isDark: boolean) => Promise<boolean>;
  syncNativeDarkMode: (isDark: boolean) => Promise<{ success: boolean }>;
  loadLyricsFile: () => Promise<{
    success: boolean;
    content?: string;
    fileName?: string;
    filePath?: string;
    canceled?: boolean;
    error?: string;
  }>;
  parseLyricsFile: (payload: {
    fileType?: string;
    path?: string;
    rawText?: string;
    enableSplitting?: boolean;
    splitConfig?: Record<string, unknown>;
  }) => Promise<{ success: boolean; payload?: unknown; error?: string }>;
  getAdminKey: () => Promise<string | null>;
  getJoinCode: () => Promise<string | null>;
  getDesktopJWT: (payload: { deviceId: string; sessionId: string }) => Promise<string | null>;
  getConnectionDiagnostics: () => Promise<unknown>;
  newLyricsFile: () => Promise<void>;
  getLocalIP: () => Promise<string>;
  getSystemFonts: () => Promise<{ success: boolean; fonts: string[]; error?: string }>;
  getPlatform: () => string;
  getAppVersion: () => Promise<{ success: boolean; version?: string; error?: string }>;
  windowControls: {
    minimize: () => Promise<{ success: boolean; error?: string }>;
    toggleMaximize: () => Promise<{ success: boolean; isMaximized?: boolean; isFullScreen?: boolean; isFocused?: boolean; error?: string }>;
    toggleFullscreen: () => Promise<{ success: boolean; isFullScreen?: boolean; error?: string }>;
    close: () => Promise<{ success: boolean; error?: string }>;
    reload: () => Promise<{ success: boolean; error?: string }>;
    toggleDevTools: () => Promise<{ success: boolean; isOpen?: boolean; error?: string }>;
    setZoom: (direction: 'in' | 'out' | 'reset') => Promise<{ success: boolean; zoomFactor?: number; error?: string }>;
    getState: () => Promise<{ success: boolean; state?: WindowState; error?: string }>;
  };
  onWindowState: (callback: (state: WindowState) => void) => () => void;
  onTriggerFileLoad: (callback: () => void) => void;
  onNavigateToNewSong: (callback: () => void) => void;
  onDarkModeToggle: (callback: () => void) => void;
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean }>;
  onProgressUpdate: (callback: (progress: number) => void) => void;
  onLoadingStatus: (callback: (status: string) => void) => void;
  onAdminKeyAvailable: (callback: (payload: { hasKey: boolean }) => void) => () => void;
  openInAppBrowser: (url: string) => Promise<void>;
  addRecentFile: (filePath: string) => Promise<{ success: boolean }>;
  recents: {
    list: () => Promise<{ success: boolean; recents: string[] }>;
    clear: () => Promise<{ success: boolean }>;
    open: (filePath: string) => Promise<{ success: boolean }>;
    onChange: (callback: (list: string[]) => void) => () => void;
  };
  openOutputWindow: (outputNumber: number) => Promise<{ success: boolean }>;
  outputAutomation: {
    fire: (payload: { endpointUrl: string; value: string }) => Promise<{
      success: boolean;
      status?: number;
      result?: unknown;
      error?: string;
      skipped?: boolean;
    }>;
  };
  onOpenLyricsFromPath: (callback: (payload: unknown) => void) => () => void;
  checkForUpdates: (showNoUpdateDialog?: boolean) => Promise<{ success: boolean; error?: string }>;
  onUpdateAvailable: (callback: (info: unknown) => void) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  onUpdateError: (callback: (msg: string) => void) => () => void;
  requestUpdateDownload: () => Promise<{ success: boolean; error?: string }>;
  requestInstallAndRestart: () => Promise<{ success: boolean; error?: string }>;
  displaySettings: {
    openModal: () => Promise<{ success: boolean }>;
  };
  onOpenShortcutsHelp: (callback: () => void) => () => void;
  onOpenQRCodeDialog: (callback: () => void) => () => void;
  onOpenEasyWorshipImport: (callback: () => void) => () => void;
  onOpenSupportDevModal: (callback: () => void) => () => void;
  onMenuUndo: (callback: () => void) => () => void;
  onMenuRedo: (callback: () => void) => () => void;
  notifyUndoRedoState: (canUndo: boolean, canRedo: boolean) => void;
  onOpenLyricsFromPathError: (callback: (payload: unknown) => void) => () => void;
  onOpenSetlistFromPath: (callback: (payload: unknown) => void) => () => void;
  browserBack: () => void;
  browserForward: () => void;
  browserReload: () => void;
  browserNavigate: (url: string) => void;
  browserOpenExternal: () => void;
  onBrowserLocation: (callback: (url: string) => void) => void;
  removeAllListeners: (channel: string) => void;
  onModalRequest: (callback: (payload: ModalRequest) => void) => () => void;
  resolveModalRequest: (id: string, result: unknown) => Promise<void>;
  rejectModalRequest: (id: string, error?: string) => Promise<void>;
  lyrics: {
    listProviders: () => Promise<{ success: boolean; providers: Provider[] }>;
    getProviderKey: (providerId: string) => Promise<{ success: boolean; key: string | null }>;
    saveProviderKey: (providerId: string, key: string) => Promise<{ success: boolean }>;
    deleteProviderKey: (providerId: string) => Promise<{ success: boolean }>;
    search: (payload: { query: string; limit?: number; skipCache?: boolean }) => Promise<{
      success: boolean;
      results?: unknown[];
      error?: string;
    }>;
    fetch: (payload: { providerId: string; payload: unknown }) => Promise<{
      success: boolean;
      lyric?: unknown;
      error?: string;
    }>;
    onPartialResults: (callback: (payload: unknown) => void) => () => void;
  };
  easyWorship: {
    validatePath: (path: string) => Promise<{ success: boolean; error?: string }>;
    browseForPath: () => Promise<{ canceled: boolean; path?: string; error?: string }>;
    browseForDestination: () => Promise<{ canceled: boolean; path?: string; error?: string }>;
    importSong: (params: unknown) => Promise<{ success: boolean; error?: string }>;
    openFolder: (path: string) => Promise<{ success: boolean }>;
    getUserHome: () => Promise<{ success: boolean; homedir?: string }>;
  };
  display: {
    getAll: () => Promise<{ success: boolean; displays: Display[] }>;
    getPrimary: () => Promise<{ success: boolean; display: Display | null }>;
    getById: (displayId: string) => Promise<{ success: boolean; display: Display | null }>;
    saveAssignment: (displayId: string, outputKey: string) => Promise<{ success: boolean }>;
    getAssignment: (displayId: string) => Promise<{ success: boolean; assignment: string | null }>;
    getAllAssignments: () => Promise<{ success: boolean; assignments: Record<string, string> }>;
    removeAssignment: (displayId: string) => Promise<{ success: boolean }>;
    openOutputOnDisplay: (outputKey: string, displayId: string) => Promise<{ success: boolean }>;
    closeOutputWindow: (outputKey: string) => Promise<{ success: boolean }>;
  };
  setlist: {
    save: (setlistData: unknown, defaultName?: string) => Promise<{
      success: boolean;
      filePath?: string;
      canceled?: boolean;
      error?: string;
    }>;
    load: () => Promise<{
      success: boolean;
      setlistData?: unknown;
      filePath?: string;
      canceled?: boolean;
      error?: string;
    }>;
    loadFromPath: (filePath: string) => Promise<{
      success: boolean;
      setlistData?: unknown;
      filePath?: string;
      error?: string;
    }>;
    getUserHome: () => Promise<{ success: boolean; homedir?: string }>;
    browseFiles: () => Promise<{
      success: boolean;
      files?: Array<{ name: string; content: string; lastModified: number; filePath: string }>;
      canceled?: boolean;
      error?: string;
    }>;
    export: (setlistData: unknown, options: ExportOptions) => Promise<{
      success: boolean;
      filePath?: string;
      canceled?: boolean;
      error?: string;
    }>;
  };
  templates: {
    load: (type: string) => Promise<{ success: boolean; templates: unknown[] }>;
    save: (type: string, template: unknown) => Promise<{ success: boolean }>;
    delete: (type: string, templateId: string) => Promise<{ success: boolean }>;
    update: (type: string, templateId: string, updates: unknown) => Promise<{ success: boolean }>;
    nameExists: (type: string, name: string, excludeId?: string) => Promise<{ success: boolean; exists: boolean }>;
  };
  bible: {
    loadFile: () => Promise<{
      success: boolean;
      bible?: unknown;
      fileName?: string;
      canceled?: boolean;
      error?: string;
    }>;
    loadAll: () => Promise<{ success: boolean; bibles: Record<string, unknown> }>;
    save: (id: string, data: unknown) => Promise<{ success: boolean; path?: string; error?: string }>;
    delete: (id: string) => Promise<{ success: boolean }>;
    parseString: (content: string, fileName: string) => Promise<{ success: boolean; bible?: unknown; error?: string }>;
  };
  updateHardwareAcceleration: (disabled: boolean) => Promise<{ success: boolean }>;
}

export interface ElectronStore {
  getDarkMode: () => boolean;
}

export interface WindowState {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
}

export interface ModalRequest {
  id: string;
  variant: string;
  title: string;
  size: string;
  actions: Array<{ label: string; value: number; variant: string; autoFocus?: boolean }>;
  body: string;
  dismissible: boolean;
  allowBackdropClose: boolean;
}

export interface Provider {
  id: string;
  name: string;
  description?: string;
  hasApiKey?: boolean;
}

export interface Display {
  id: string;
  label?: string;
  primary: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ExportOptions {
  title?: string;
  includeLyrics?: boolean;
  format?: 'pdf' | 'txt';
}

// Lyrics types
export interface LyricsLine {
  id: string;
  text: string;
  originalText?: string;
  translation?: string;
  timestamp?: number;
  type: 'lyric' | 'translation' | 'structure' | 'empty';
}

export interface LyricsState {
  lines: LyricsLine[];
  selectedLines: string[];
  activeLine: string | null;
  metadata: {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
  };
}

// Output settings
export interface OutputSettings {
  enabled: boolean;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  color: string;
  backgroundColor: string;
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  padding: number;
  maxLines: number;
  transitionDuration: number;
  backgroundOpacity: number;
}

// Setlist types
export interface SetlistItem {
  id: string;
  title: string;
  content: string;
  filePath?: string;
  lastModified?: number;
}

export interface Setlist {
  id: string;
  name: string;
  items: SetlistItem[];
  createdAt: string;
  updatedAt: string;
}

// Socket.io event types
export interface SocketEvents {
  'lyrics:update': (data: { lines: LyricsLine[]; activeLine: string | null }) => void;
  'setlist:update': (data: { setlist: SetlistItem[] }) => void;
  'output:settings': (data: { outputKey: string; settings: OutputSettings }) => void;
  'stage:timer': (data: { seconds: number; running: boolean }) => void;
  'stage:message': (data: { text: string }) => void;
  'draft:approval': (data: { songId: string; status: 'pending' | 'approved' | 'rejected' }) => void;
}
