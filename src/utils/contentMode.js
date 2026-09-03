export const CONTENT_MODE_SONG = 'song';
export const CONTENT_MODE_BIBLE = 'bible';

export const CONTENT_MODES = [CONTENT_MODE_SONG, CONTENT_MODE_BIBLE];

export function isValidContentMode(mode) {
  return mode === CONTENT_MODE_SONG || mode === CONTENT_MODE_BIBLE;
}

export function normalizeContentMode(mode) {
  return mode === CONTENT_MODE_BIBLE ? CONTENT_MODE_BIBLE : CONTENT_MODE_SONG;
}

export function isBibleMode(mode) {
  return normalizeContentMode(mode) === CONTENT_MODE_BIBLE;
}

export function isSongMode(mode) {
  return normalizeContentMode(mode) === CONTENT_MODE_SONG;
}

// Validators for diagnostics / tests
export function assertContentMode(mode) {
  if (!isValidContentMode(mode)) {
    throw new Error(`Invalid contentMode: ${String(mode)}`);
  }
  return mode;
}
