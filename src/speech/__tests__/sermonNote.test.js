import { describe, it, expect } from 'vitest';
import {
  createSermonNote,
  appendFinalSegment,
  editSermonNote,
  sermonNoteFromSegments,
  toFreeNoteDraft,
} from '../sermonNote.js';

const final = (text, t = 0) => ({
  sessionId: 'a',
  text,
  tStartMs: t,
  tEndMs: t + 1000,
  isFinal: true,
});

describe('createSermonNote: an empty running draft', () => {
  it('lands in the existing freeNotesDrafts shape', () => {
    const note = createSermonNote({ now: 1000 });
    expect(note).toMatchObject({ content: '', createdAt: 1000, updatedAt: 1000 });
    expect(typeof note.id).toBe('string');
    expect(note.id.length).toBeGreaterThan(0);
    expect(note.title.length).toBeGreaterThan(0);
  });

  it('accepts a caller-supplied id and title, deterministic with `now`', () => {
    const note = createSermonNote({ id: 'fixed', title: 'Sunday sermon', now: 5 });
    expect(note.id).toBe('fixed');
    expect(note.title).toBe('Sunday sermon');
    expect(note.createdAt).toBe(5);
  });
});

describe('appendFinalSegment: final segments only', () => {
  it('appends the first segment as the whole content', () => {
    const note = appendFinalSegment(createSermonNote({ now: 1 }), final('Good morning church'), {
      now: 2,
    });
    expect(note.content).toBe('Good morning church');
    expect(note.updatedAt).toBe(2);
  });

  it('appends later segments as markdown paragraphs', () => {
    let note = sermonNoteFromSegments(
      [final('Point one'), final('Point two')],
      { now: 10 }
    );
    expect(note.content).toBe('Point one\n\nPoint two');
    expect(note.updatedAt).toBe(10);
  });

  it('drops partial segments — only final text reaches the draft', () => {
    const base = createSermonNote({ now: 1 });
    const partial = appendFinalSegment(base, { text: 'half said some', isFinal: false }, { now: 2 });
    expect(partial).toBe(base); // same object: no re-render for dropped text
    expect(partial.content).toBe('');

    const interim = appendFinalSegment(base, { text: 'half said', partial: true }, { now: 3 });
    expect(interim).toBe(base);
  });

  it('returns the SAME note when nothing would change', () => {
    const base = createSermonNote({ now: 1 });
    expect(appendFinalSegment(base, { text: '   ' }, { now: 2 })).toBe(base);
    expect(appendFinalSegment(base, '   ', { now: 2 })).toBe(base);
    expect(appendFinalSegment(base, null, { now: 2 })).toBe(base);
  });

  it('appends a plain string segment too', () => {
    const note = appendFinalSegment(createSermonNote({ now: 1 }), 'Just words', { now: 2 });
    expect(note.content).toBe('Just words');
  });
});

describe('editSermonNote: the draft is editable inline', () => {
  it('patches only title and content', () => {
    const note = createSermonNote({ now: 1 });
    const edited = editSermonNote(note, { title: '  Edited  ', content: 'rewritten', evil: 'x' }, { now: 5 });
    expect(edited.title).toBe('Edited');
    expect(edited.content).toBe('rewritten');
    expect(edited.evil).toBeUndefined();
    expect(edited.id).toBe(note.id);
    expect(edited.createdAt).toBe(1);
    expect(edited.updatedAt).toBe(5);
  });

  it('ignores a blank title and a non-string patch', () => {
    const note = createSermonNote({ title: 'Keep me', now: 1 });
    const edited = editSermonNote(note, { title: '   ', content: 42, id: 'hijack' }, { now: 2 });
    expect(edited.title).toBe('Keep me');
    expect(edited.content).toBe(note.content);
    expect(edited.id).toBe(note.id);
  });
});

describe('toFreeNoteDraft: the Send to Free Note payload', () => {
  it('is exactly the freeNotesDrafts shape', () => {
    const note = sermonNoteFromSegments([final('Sermon point')], { id: 'n1', now: 7 });
    const draft = toFreeNoteDraft(note);
    expect(draft).toEqual({
      id: 'n1',
      title: note.title,
      content: 'Sermon point',
      createdAt: 7,
      updatedAt: 7,
    });
    expect(Object.keys(draft).sort()).toEqual(
      ['content', 'createdAt', 'id', 'title', 'updatedAt'].sort()
    );
  });

  it('never throws on junk', () => {
    expect(toFreeNoteDraft(null)).toBeNull();
    expect(toFreeNoteDraft('a string')).toBeNull();
    const draft = toFreeNoteDraft({ id: 'x' });
    expect(typeof draft.title).toBe('string');
    expect(draft.content).toBe('');
    expect(Number.isFinite(draft.createdAt)).toBe(true);
  });
});

describe('sermonNoteFromSegments: folding the transcript', () => {
  it('builds a draft from final segments and skips everything else', () => {
    const note = sermonNoteFromSegments(
      [final('Opening prayer'), { text: 'live partial', isFinal: false }, final('Main point')],
      { id: 'fold', now: 42 }
    );
    expect(note.content).toBe('Opening prayer\n\nMain point');
    expect(note.id).toBe('fold');
    expect(note.updatedAt).toBe(42);
  });

  it('is safe on empty and non-array input', () => {
    expect(sermonNoteFromSegments([], { now: 1 }).content).toBe('');
    expect(sermonNoteFromSegments(undefined, { now: 1 }).content).toBe('');
    expect(sermonNoteFromSegments('nope', { now: 1 }).content).toBe('');
  });

  it('keeps transcript text in content only — nothing is logged or re-keyed', () => {
    const note = sermonNoteFromSegments([final('Confidential pastoral aside')], { now: 1 });
    expect(note.content).toBe('Confidential pastoral aside');
    expect(Object.keys(note).sort()).toEqual(
      ['content', 'createdAt', 'id', 'title', 'updatedAt'].sort()
    );
  });
});
