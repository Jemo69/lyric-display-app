import { CONTENT_MODE_SONG, CONTENT_MODE_BIBLE, CONTENT_MODE_FREENOTE, normalizeContentMode } from '../utils/contentMode.js';

export const SESSION_SCHEMA_VERSION = 2;

/**
 * Canonical session shape.
 * Persisted as versioned slice inside lyrics-store.
 *
 * Flat keys are kept for backward compat but new atomic commands
 * operate on session fields directly. Migration will populate session
 * from legacy keys.
 */
export function createInitialSession(overrides = {}) {
  return {
    contentMode: CONTENT_MODE_SONG,
    activeContent: {
      kind: 'song', // 'song' | 'bible' | 'freenote'
      id: null,
      title: '',
      rawText: '',
      lines: [],
      bibleId: null,
      reference: null,
    },
    leftPanel: {
      open: true,
      view: 'songs', // 'songs' | 'bible' | 'freenote'
    },
    outputs: {}, // per-output: { enabled, settings, templates: { song, bible, freenote }, autoApply }
    revision: 0,
    ...overrides,
  };
}

export function validateSession(session) {
  if (!session || typeof session !== 'object') return false;
  const mode = session.contentMode;
  if (mode !== CONTENT_MODE_SONG && mode !== CONTENT_MODE_BIBLE && mode !== CONTENT_MODE_FREENOTE) return false;
  if (!session.activeContent || typeof session.activeContent !== 'object') return false;
  if (!session.leftPanel || typeof session.leftPanel !== 'object') return false;
  if (!['songs', 'bible', 'freenote'].includes(session.leftPanel.view)) return false;
  return true;
}

// Reducers — pure functions returning next state patch
export function reduceSelectMode(state, mode) {
  const normalized = normalizeContentMode(mode);
  const leftView = normalized === CONTENT_MODE_BIBLE
    ? 'bible'
    : normalized === CONTENT_MODE_FREENOTE
      ? 'freenote'
      : 'songs';
  return {
    contentMode: normalized,
    bibleVersion: normalized === CONTENT_MODE_BIBLE ? (state.bibleVersion || '') : '',
    session: {
      ...(state.session || createInitialSession()),
      contentMode: normalized,
      leftPanel: {
        ...(state.session?.leftPanel || { open: true, view: 'songs' }),
        view: leftView,
      },
      revision: (state.session?.revision || 0) + 1,
    },
    // also keep legacy left view in sync for any code reading defaultLayout/sidebar etc.
  };
}

export function reduceLoadSong(state, payload) {
  // payload: { title, rawText, lines, sections, lineToSection, timestamps, fileName, metadata }
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  const rawText = payload?.rawText ?? '';
  const title = payload?.title ?? payload?.fileName ?? '';
  return {
    contentMode: CONTENT_MODE_SONG,
    lyrics: lines,
    rawLyricsContent: rawText,
    lyricsFileName: payload?.fileName ?? title ?? '',
    bibleVersion: '',
    songMetadata: payload?.metadata || state.songMetadata,
    lyricsSections: Array.isArray(payload?.sections) ? payload.sections : state.lyricsSections || [],
    lineToSection: payload?.lineToSection && typeof payload.lineToSection === 'object' ? payload.lineToSection : state.lineToSection || {},
    lyricsTimestamps: Array.isArray(payload?.timestamps) ? payload.timestamps : state.lyricsTimestamps || [],
    selectedLine: payload?.selectedLine ?? null,
    session: {
      ...(state.session || createInitialSession()),
      contentMode: CONTENT_MODE_SONG,
      activeContent: {
        kind: 'song',
        id: payload?.id || payload?.fileName || title || `song_${Date.now()}`,
        title,
        rawText,
        lines,
        bibleId: null,
        reference: null,
      },
      leftPanel: {
        ...(state.session?.leftPanel || { open: true, view: 'songs' }),
        view: 'songs',
      },
      revision: (state.session?.revision || 0) + 1,
    },
  };
}

export function reduceLoadBibleVerse(state, payload) {
  // payload: { reference, text, fullText, slides, slideIndex, bible, bibleId, lines, rawText }
  const slides = Array.isArray(payload?.slides) && payload.slides.length > 0 ? payload.slides : [payload?.text ?? ''];
  const lines = slides.map((t) => `${t}\n\n${payload?.reference ?? ''}`);
  const rawText = lines.join('\n\n');
  return {
    contentMode: CONTENT_MODE_BIBLE,
    lyrics: lines,
    rawLyricsContent: payload?.rawText ?? rawText,
    lyricsFileName: payload?.reference ?? '',
    bibleVersion: payload?.bible ?? payload?.bibleId ?? '',
    selectedLine: Number.isInteger(payload?.slideIndex) ? payload.slideIndex : 0,
    session: {
      ...(state.session || createInitialSession()),
      contentMode: CONTENT_MODE_BIBLE,
      activeContent: {
        kind: 'bible',
        id: payload?.reference || `bible_${Date.now()}`,
        title: payload?.reference || '',
        rawText,
        lines,
        bibleId: payload?.bibleId || payload?.bible || null,
        reference: payload?.reference || null,
      },
      leftPanel: {
        ...(state.session?.leftPanel || { open: true, view: 'bible' }),
        view: 'bible',
      },
      revision: (state.session?.revision || 0) + 1,
    },
  };
}

export function reduceLoadFreeNote(state, payload) {
  // payload: { title, rawText, lines, id, selectedLine, content, slides, targetSlideIndex }
  const lines = Array.isArray(payload?.lines)
    ? payload.lines
    : (Array.isArray(payload?.slides) ? payload.slides : (payload?.rawText || payload?.content ? [payload.rawText || payload.content] : []));
  const rawText = payload?.rawText ?? payload?.content ?? lines.join('\n\n');
  const title = payload?.title || 'Free Note';
  const selectedIndex = Number.isInteger(payload?.selectedLine)
    ? payload.selectedLine
    : (Number.isInteger(payload?.targetSlideIndex) ? payload.targetSlideIndex : 0);

  return {
    contentMode: CONTENT_MODE_FREENOTE,
    currentSong: null,
    currentBibleVerse: null,
    freeNoteContent: rawText,
    lyrics: lines,
    rawLyricsContent: rawText,
    lyricsFileName: title,
    bibleVersion: '',
    selectedLine: selectedIndex,
    session: {
      ...(state.session || createInitialSession()),
      contentMode: CONTENT_MODE_FREENOTE,
      activeContent: {
        kind: 'freenote',
        id: payload?.id || `freenote_${Date.now()}`,
        title,
        rawText,
        lines,
        bibleId: null,
        reference: null,
      },
      leftPanel: {
        ...(state.session?.leftPanel || { open: true, view: 'freenote' }),
        view: 'freenote',
      },
      revision: (state.session?.revision || 0) + 1,
    },
  };
}

// Migration for persisted state
export function migratePersistedState(persisted) {
  if (!persisted || typeof persisted !== 'object') return persisted;
  const version = persisted._persistVersion ?? persisted.session?.revision ?? 0;
  // If already versioned and has session, trust it
  if (persisted.session && validateSession(persisted.session)) {
    // ensure contentMode sync
    persisted.contentMode = normalizeContentMode(persisted.session.contentMode);
    persisted._persistVersion = SESSION_SCHEMA_VERSION;
    return persisted;
  }

  // Build session from legacy flat keys
  const rawMode = persisted.contentMode || (persisted.bibleVersion ? CONTENT_MODE_BIBLE : CONTENT_MODE_SONG);
  const legacyMode = normalizeContentMode(rawMode);
  const leftView = legacyMode === CONTENT_MODE_BIBLE ? 'bible' : legacyMode === CONTENT_MODE_FREENOTE ? 'freenote' : 'songs';
  const session = createInitialSession({
    contentMode: legacyMode,
    activeContent: {
      kind: legacyMode === CONTENT_MODE_BIBLE ? 'bible' : legacyMode === CONTENT_MODE_FREENOTE ? 'freenote' : 'song',
      id: persisted.lyricsFileName || null,
      title: persisted.songMetadata?.title || persisted.lyricsFileName || '',
      rawText: persisted.rawLyricsContent || '',
      lines: Array.isArray(persisted.lyrics) ? persisted.lyrics : [],
      bibleId: persisted.bibleVersion || null,
      reference: legacyMode === CONTENT_MODE_BIBLE ? persisted.lyricsFileName || null : null,
    },
    leftPanel: {
      open: persisted.sidebarCollapsed === false ? true : true,
      view: leftView,
    },
    revision: 1,
  });

  persisted.session = session;
  persisted.contentMode = legacyMode;
  persisted._persistVersion = SESSION_SCHEMA_VERSION;
  // leftPanel view derived — ensure not lost
  return persisted;
}
