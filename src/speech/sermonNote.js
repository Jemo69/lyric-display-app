// src/speech/sermonNote.js — sermon note lane (plan 11, lane 3)
//
// "A running draft. Final segments are appended, the note is editable
//  inline, and Send to Free Note lands it in the existing freeNotesDrafts
//  shape in useLyricsStore. No summarisation model is involved — that
//  would be a second model to choose and size, and the user did not ask
//  for it."
//
// Pure: functions take the note and return a new note. The only clock is
// an optional `now` parameter (defaulting to Date.now()) so tests are
// deterministic. No store reads, no I/O, no transcript logging — the
// transcript text flows in as a parameter and out as note content, and
// nowhere else.

import { createFreeNoteDraft } from '../utils/freeNote.js';

const DEFAULT_TITLE = 'Sermon Note';

/**
 * Create an empty running draft in the freeNotesDrafts shape
 * ({ id, title, content, createdAt, updatedAt }).
 *
 * @param {{ id?: string, title?: string, now?: number }} [options]
 */
export function createSermonNote(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const draft = createFreeNoteDraft(options.title || DEFAULT_TITLE, '');
  return {
    ...draft,
    ...(options.id ? { id: options.id } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function segmentText(segment) {
  if (typeof segment === 'string') return segment.trim();
  if (segment && typeof segment === 'object') {
    // Partial segments are provisional — only FINAL segments are appended
    // (same rule as the transcript history).
    if (segment.isFinal === false || segment.final === false || segment.partial === true) return '';
    if (typeof segment.text === 'string') return segment.text.trim();
  }
  return '';
}

/**
 * Append one final segment to the running draft. Returns the SAME note
 * object when nothing would change (partials, empty text), so callers can
 * skip re-renders.
 *
 * Segments become markdown paragraphs: the note stays readable while the
 * operator edits it inline, and it survives the `---` slide split that
 * Free Notes already applies.
 *
 * @param {{ id, title, content, createdAt, updatedAt }} note
 * @param {string|{text: string, isFinal?: boolean}} segment
 * @param {{ now?: number }} [options]
 */
export function appendFinalSegment(note, segment, options = {}) {
  const text = segmentText(segment);
  if (!text) return note;

  const content = note && typeof note.content === 'string' && note.content
    ? `${note.content}\n\n${text}`
    : text;
  const now = Number.isFinite(options.now) ? options.now : Date.now();

  return { ...(note ?? createSermonNote(options)), content, updatedAt: now };
}

/**
 * Apply an inline edit (the note is editable, plan 11). Only `title` and
 * `content` may be patched; unknown fields are ignored.
 */
export function editSermonNote(note, patch = {}, options = {}) {
  const base = note ?? createSermonNote(options);
  const next = { ...base };
  if (typeof patch.title === 'string' && patch.title.trim()) next.title = patch.title.trim();
  if (typeof patch.content === 'string') next.content = patch.content;
  next.updatedAt = Number.isFinite(options.now) ? options.now : Date.now();
  return next;
}

/**
 * Fold a list of segments into a fresh draft — final segments only.
 * @param {Array} segments
 * @param {{ id?: string, title?: string, now?: number }} [options]
 */
export function sermonNoteFromSegments(segments, options = {}) {
  let note = createSermonNote(options);
  for (const segment of Array.isArray(segments) ? segments : []) {
    note = appendFinalSegment(note, segment, options);
  }
  return note;
}

/**
 * The "Send to Free Note" payload: exactly what saveFreeNoteDraft()
 * expects ({ id, title, content, createdAt, updatedAt }) so the send
 * action needs no new store code.
 */
export function toFreeNoteDraft(note) {
  if (!note || typeof note !== 'object') return null;
  return {
    id: note.id,
    title: note.title || DEFAULT_TITLE,
    content: typeof note.content === 'string' ? note.content : '',
    createdAt: Number.isFinite(note.createdAt) ? note.createdAt : Date.now(),
    updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : Date.now(),
  };
}

export default createSermonNote;
