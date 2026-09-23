import { getBibleVerseText } from 'shared/bible';
import { createLogger } from './logger.js';

const log = createLogger('BibleParallel');

export const PARALLEL_LAYOUTS = ['side-by-side', 'stacked'];
export const DEFAULT_PARALLEL_LAYOUT = 'side-by-side';

// A versification offset shifts verse numbers when reading the SAME logical
// verse from a second translation whose versification differs (e.g. Psalm
// numbering divergences between Protestant and Catholic/Orthodox editions).
// offsetId format: `${bibleId}-${book}-${chapter}` -> integer shift applied
// to each requested verse number before lookup (clamped to >= 1).
export function buildOffsetId(bibleId, book, chapter) {
  return `${bibleId}-${book}-${chapter}`;
}

export function resolveVersificationOffset(offsets, bibleId, book, chapter) {
  if (!offsets || !bibleId || book == null || chapter == null) return 0;
  const raw = offsets[buildOffsetId(bibleId, book, chapter)];
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : 0;
}

export function applyVersificationOffset(verseNumbers, offset) {
  const shift = Number.isInteger(offset) ? offset : 0;
  const values = Array.isArray(verseNumbers) ? verseNumbers : [verseNumbers];
  return values
    .filter((v) => Number.isInteger(v))
    .map((v) => Math.max(1, v + shift));
}

// No shipped numeric defaults: verse-level shifts vary by edition, so the
// table starts empty and grows via settings.versificationOffsets overrides.
// Use buildTraditionPsalmOffsets() to seed the well-known Psalm divergence
// pattern for a given secondary bible id, then adjust per edition.
export const DEFAULT_VERSIFICATION_OFFSETS = {};

// Seeds offset entries for the classic Protestant-vs-Catholic/Orthodox Psalm
// divergence for one bible id. `shifts` maps `${book}-${chapter}` (book 19 =
// Psalms) to an integer verse shift. Callers own the numbers per edition;
// this helper only namespaces them into offsetIds.
//
// Example: buildTraditionPsalmOffsets('rv1960', { '19-51': -1 })
export function buildTraditionPsalmOffsets(bibleId, shifts = {}) {
  if (!bibleId || !shifts || typeof shifts !== 'object') return {};
  const table = {};
  for (const [bookChapter, shift] of Object.entries(shifts)) {
    if (!Number.isInteger(shift) || shift === 0) continue;
    table[`${bibleId}-${bookChapter}`] = shift;
  }
  return table;
}

// A linked pair is stored as the single activeReference (primary) plus a
// linkedBibleId (secondary). This keeps the single-translation path
// byte-identical while exposing a pair view for parallel rendering.
export function isLinkedPair(activeReference, linkedBibleId) {
  return Boolean(activeReference && linkedBibleId);
}

export function getPairedReference(activeReference, linkedBibleId) {
  if (!isLinkedPair(activeReference, linkedBibleId)) return null;
  return {
    primary: activeReference,
    secondary: {
      bibleId: linkedBibleId,
      book: activeReference.book,
      chapters: activeReference.chapters,
      verses: activeReference.verses,
    },
  };
}

// Accepts either today's single reference shape or a forward-compatible
// { primary, secondary } pair object. Returns { reference, linkedBibleId }.
export function normalizePairInput(input, currentLinkedBibleId = null) {
  if (input && typeof input === 'object' && input.primary && input.secondary) {
    const secondary = input.secondary || {};
    return {
      reference: input.primary,
      linkedBibleId: secondary.bibleId || secondary.id || secondary.bible || currentLinkedBibleId,
    };
  }
  return { reference: input, linkedBibleId: currentLinkedBibleId };
}

// Reads the same logical passage from the secondary bible, applying the
// versification offset for that bible/book/chapter first.
export function getParallelVerseText(secondaryBible, secondaryBibleId, activeReference, selectedVerses, offsets) {
  if (!secondaryBible || !activeReference) return '';
  const book = activeReference.book;
  const chapter = activeReference.chapters?.[0];
  const offset = resolveVersificationOffset(offsets, secondaryBibleId, book, chapter);
  const shifted = applyVersificationOffset(selectedVerses?.[0] || [], offset);
  const shiftedSelection = [shifted, ...(selectedVerses || []).slice(1)];
  try {
    return getBibleVerseText(secondaryBible, activeReference, shiftedSelection);
  } catch (err) {
    log.warn('Parallel verse lookup failed', { secondaryBibleId, book, chapter, offset });
    return '';
  }
}

// Pairs primary/secondary slides by index for dual-slot rendering. Extra
// slides on either side pair with null (rendered single).
export function zipParallelSlides(primarySlides, secondarySlides) {
  const primary = Array.isArray(primarySlides) ? primarySlides : [];
  const secondary = Array.isArray(secondarySlides) ? secondarySlides : [];
  const count = Math.max(primary.length, secondary.length);
  const zipped = [];
  for (let i = 0; i < count; i++) {
    zipped.push({
      primary: i < primary.length ? primary[i] : null,
      secondary: i < secondary.length ? secondary[i] : null,
    });
  }
  return zipped;
}

const MAX_PARALLEL_SLIDES = 50;
const MAX_PARALLEL_TEXT = 8000;

// Validates the optional `secondary` field of a bibleVerseLoaded payload
// (socket boundary). Returns a clean object or null. Never throws.
export function sanitizeParallelPayload(secondary) {
  try {
    if (!secondary || typeof secondary !== 'object') return null;
    const bible = typeof secondary.bible === 'string' ? secondary.bible.slice(0, 120) : '';
    const text = typeof secondary.text === 'string' ? secondary.text.slice(0, MAX_PARALLEL_TEXT) : '';
    const fullText = typeof secondary.fullText === 'string' ? secondary.fullText.slice(0, MAX_PARALLEL_TEXT) : '';
    const slides = Array.isArray(secondary.slides)
      ? secondary.slides
          .map((s) => String(s ?? '').slice(0, MAX_PARALLEL_TEXT))
          .filter((s) => s.trim().length > 0)
          .slice(0, MAX_PARALLEL_SLIDES)
      : [];
    if (!bible && slides.length === 0 && !text && !fullText) return null;
    return { bible, text, fullText, slides };
  } catch {
    return null;
  }
}

export function normalizeParallelLayout(layout) {
  return PARALLEL_LAYOUTS.includes(layout) ? layout : DEFAULT_PARALLEL_LAYOUT;
}
