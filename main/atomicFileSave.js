import { randomUUID } from 'crypto';
import path from 'path';
import {
  chmod,
  link,
  lstat,
  open,
  rename,
  rm,
} from 'fs/promises';

export const ATOMIC_FILE_SAVE_MODES = Object.freeze({
  create: 'create',
  replace: 'replace',
});

function createSaveError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeMode(mode) {
  return mode === ATOMIC_FILE_SAVE_MODES.create
    ? ATOMIC_FILE_SAVE_MODES.create
    : ATOMIC_FILE_SAVE_MODES.replace;
}

async function inspectReplacementTarget(filePath) {
  try {
    const targetStat = await lstat(filePath);
    if (targetStat.isSymbolicLink()) {
      throw createSaveError('Symbolic-link destinations cannot be replaced', 'UNSAFE_SAVE_TARGET');
    }
    if (!targetStat.isFile()) {
      throw createSaveError('A folder already uses that name', 'INVALID_SAVE_TARGET');
    }
    return targetStat;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeCompleteTemporaryFile(filePath, content, fileMode) {
  const directoryPath = path.dirname(filePath);
  let temporaryPath = null;
  let handle = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    temporaryPath = path.join(directoryPath, `.lyricdisplay-${randomUUID()}.tmp`);
    try {
      handle = await open(temporaryPath, 'wx', fileMode);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST' || attempt === 2) throw error;
    }
  }

  try {
    await handle.writeFile(content, { encoding: 'utf8' });
    await handle.sync();
    await handle.close();
    handle = null;
    return temporaryPath;
  } catch (error) {
    try {
      await handle?.close();
    } catch { }
    await rm(temporaryPath, { force: true }).catch(() => { });
    throw error;
  }
}

async function promoteCreateExclusively(filePath, content, fileMode) {
  let handle = null;
  try {
    handle = await open(filePath, 'wx', fileMode);
    await handle.writeFile(content, { encoding: 'utf8' });
    await handle.sync();
    await handle.close();
    handle = null;
    return { created: true, replaced: false };
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw createSaveError('A file with that name already exists', 'FILE_EXISTS');
    }
    throw error;
  } finally {
    try {
      await handle?.close();
    } catch { }
  }
}

/**
 * Writes a complete text file without exposing a partially-written destination.
 *
 * `create` promotes the completed temporary file with an exclusive hard link, so
 * a destination that appears during the save can never be overwritten. On drives
 * that do not support hard links (FAT32/exFAT USB drives), the promotion falls
 * back to an exclusive open-and-write of the destination, which preserves the
 * collision policy while still completing the save.
 * `replace` swaps the completed temporary file over the destination only after
 * validating that an existing target is a regular file.
 */
export async function saveTextFileAtomically(filePath, content, { mode = 'replace' } = {}) {
  const normalizedMode = normalizeMode(mode);
  const replacementTarget = normalizedMode === ATOMIC_FILE_SAVE_MODES.replace
    ? await inspectReplacementTarget(filePath)
    : null;
  const fileMode = replacementTarget?.mode ?? 0o666;
  const temporaryPath = await writeCompleteTemporaryFile(filePath, content, fileMode);

  try {
    if (replacementTarget && process.platform !== 'win32') {
      await chmod(temporaryPath, replacementTarget.mode & 0o777);
    }

    if (normalizedMode === ATOMIC_FILE_SAVE_MODES.create) {
      try {
        await link(temporaryPath, filePath);
        return { created: true, replaced: false };
      } catch (error) {
        if (error?.code === 'EEXIST') {
          throw createSaveError('A file with that name already exists', 'FILE_EXISTS');
        }
        if (error?.code === 'EXDEV' || error?.code === 'EPERM' || error?.code === 'EACCES') {
          return promoteCreateExclusively(filePath, content, fileMode);
        }
        throw error;
      }
    }

    await rename(temporaryPath, filePath);
    // The containing directory is not fsynced after the rename; on sudden
    // power loss the rename may not be durable. The temporary file itself was
    // synced above, which covers the common single-file durability case.
    return { created: !replacementTarget, replaced: Boolean(replacementTarget) };
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => { });
  }
}
