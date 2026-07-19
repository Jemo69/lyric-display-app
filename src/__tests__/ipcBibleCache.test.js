import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ipcState = vi.hoisted(() => ({
  userDataDir: '',
  handlers: new Map()
}));

vi.mock('electron', () => ({
  app: {
    getPath: (name) => (name === 'userData' ? ipcState.userDataDir : ''),
    getAppPath: () => '',
    getVersion: () => '0.0.0-test',
    on: () => {},
    quit: () => {}
  },
  ipcMain: {
    handle: (channel, fn) => ipcState.handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {}
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: null }),
    showMessageBox: async () => ({ response: 0 })
  },
  nativeTheme: { on: () => {}, shouldUseDarkColors: false },
  BrowserWindow: class {
    static getAllWindows() { return []; }
    on() {}
    isDestroyed() { return true; }
    loadURL() {}
  },
  screen: { getAllDisplays: () => [] },
  shell: { openExternal: async () => {} },
  Menu: { buildFromTemplate: () => ({ popup: () => {} }), setApplicationMenu: () => {} }
}));

vi.mock('electron-store', () => ({
  default: class {
    get() { return undefined; }
    set() {}
    delete() {}
    has() { return false; }
    onDidChange() {}
  }
}));

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {
      on: () => {},
      checkForUpdates: async () => {},
      downloadUpdate: async () => {},
      quitAndInstall: () => {}
    }
  }
}));

import { registerIpcHandlers } from '../../main/ipc.js';

const emptyBible = (name, extra = {}) => ({
  id: name,
  name,
  books: [
    {
      number: 1,
      name: 'Genesis',
      chapters: [{ number: 1, verses: [{ number: 1, text: 'In the beginning' }] }]
    }
  ],
  ...extra
});

describe('bible:load-all parse cache', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'bible-cache-'));
    ipcState.userDataDir = dir;
    ipcState.handlers.clear();
    registerIpcHandlers({
      getMainWindow: () => null,
      openInAppBrowser: () => {},
      updateDarkModeMenu: () => {},
      updateUndoRedoState: () => {},
      checkForUpdates: () => {},
      requestRendererModal: () => {}
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const loadAll = () => ipcState.handlers.get('bible:load-all')();

  it('serves freshly parsed content after a file is edited on disk', async () => {
    const bibleDir = path.join(dir, 'bibles');
    mkdirSync(bibleDir, { recursive: true });
    writeFileSync(path.join(bibleDir, 'b1.json'), JSON.stringify(emptyBible('b1', { searchIndex: 'initial' })));
    writeFileSync(path.join(bibleDir, 'b2.json'), JSON.stringify(emptyBible('b2')));

    const first = await loadAll();
    expect(Object.keys(first.bibles).sort()).toEqual(['b1', 'b2']);
    expect(first.bibles.b1.name).toBe('b1');

    writeFileSync(path.join(bibleDir, 'b1.json'), JSON.stringify(emptyBible('b1-renamed', { searchIndex: 'changed' })));

    const second = await loadAll();
    expect(Object.keys(second.bibles).sort()).toEqual(['b1', 'b2']);
    expect(second.bibles.b1.name).toBe('b1-renamed');
  });

  it('does not grow stale entries when a file is removed from the folder', async () => {
    const bibleDir = path.join(dir, 'bibles');
    mkdirSync(bibleDir, { recursive: true });
    writeFileSync(path.join(bibleDir, 'b1.json'), JSON.stringify(emptyBible('b1', { searchIndex: 'x' })));
    writeFileSync(path.join(bibleDir, 'b2.json'), JSON.stringify(emptyBible('b2', { searchIndex: 'x' })));

    const first = await loadAll();
    expect(Object.keys(first.bibles).sort()).toEqual(['b1', 'b2']);

    unlinkSync(path.join(bibleDir, 'b1.json'));

    const second = await loadAll();
    expect(Object.keys(second.bibles).sort()).toEqual(['b2']);
  });

  it('caches per file path so unchanged files are not re-read', async () => {
    const bibleDir = path.join(dir, 'bibles');
    mkdirSync(bibleDir, { recursive: true });
    writeFileSync(path.join(bibleDir, 'b1.json'), JSON.stringify(emptyBible('b1', { searchIndex: 'x' })));
    writeFileSync(path.join(bibleDir, 'b2.json'), JSON.stringify(emptyBible('b2')));

    const first = await loadAll();
    expect(first.success).toBe(true);
    expect(Object.keys(first.bibles).length).toBe(2);

    const second = await loadAll();
    expect(second.success).toBe(true);
    expect(Object.keys(second.bibles).length).toBe(2);
  });
});