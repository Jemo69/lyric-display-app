// Renames are for people, not for data.
//
// Electron derives its data directory (settings, libraries, imported Bibles,
// speech models, recent files) from the app name, so rebranding the app
// would otherwise make every existing install look brand new. This module
// pins the data directory to the current brand on every launch and migrates
// the legacy directories in place, before anything else reads from them.
//
// It is imported for its side effect, first, in main.js — electron-store
// instances created during module evaluation must resolve after the pin.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** Current brand's directory under appData. */
export const CURRENT_BRAND_DIR = 'Selah';
/** Previous brand directories, most recent first. */
export const LEGACY_BRAND_DIRS = ['LyricDisplay', 'lyric-display-app'];

export function pinUserDataDirectory() {
  try {
    const appData = app.getPath('appData');
    const target = path.join(appData, CURRENT_BRAND_DIR);
    if (fs.existsSync(target)) {
      app.setPath('userData', target);
      return target;
    }
    for (const legacy of LEGACY_BRAND_DIRS) {
      const legacyPath = path.join(appData, legacy);
      if (!fs.existsSync(legacyPath)) continue;
      try {
        fs.renameSync(legacyPath, target);
      } catch {
        // Rename refused (locked by another process, permissions): keep using
        // the existing directory rather than starting from an empty one.
        if (fs.existsSync(legacyPath)) {
          app.setPath('userData', legacyPath);
          return legacyPath;
        }
        continue;
      }
      if (fs.existsSync(target)) {
        app.setPath('userData', target);
        return target;
      }
    }
    // Fresh install: establish the current brand's directory.
    app.setPath('userData', target);
    return target;
  } catch {
    // Never let identity bookkeeping stop the app from starting.
    return null;
  }
}

pinUserDataDirectory();
