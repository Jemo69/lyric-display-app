export const CONTENT_MODE_SONG = 'song';
export const CONTENT_MODE_BIBLE = 'bible';
export const CONTENT_MODE_FREENOTE = 'freenote';

export const CONTENT_MODES = [CONTENT_MODE_SONG, CONTENT_MODE_BIBLE, CONTENT_MODE_FREENOTE];

export function isValidContentMode(mode) {
  return mode === CONTENT_MODE_SONG || mode === CONTENT_MODE_BIBLE || mode === CONTENT_MODE_FREENOTE;
}

export function normalizeContentMode(mode) {
  if (mode === CONTENT_MODE_BIBLE) return CONTENT_MODE_BIBLE;
  if (mode === CONTENT_MODE_FREENOTE) return CONTENT_MODE_FREENOTE;
  return CONTENT_MODE_SONG;
}

export function isBibleMode(mode) {
  return normalizeContentMode(mode) === CONTENT_MODE_BIBLE;
}

export function isSongMode(mode) {
  return normalizeContentMode(mode) === CONTENT_MODE_SONG;
}

export function isFreeNoteMode(mode) {
  return normalizeContentMode(mode) === CONTENT_MODE_FREENOTE;
}

// Validators for diagnostics / tests
export function assertContentMode(mode) {
  if (!isValidContentMode(mode)) {
    throw new Error(`Invalid contentMode: ${String(mode)}`);
  }
  return mode;
}
