import { describe, it, expect } from 'vitest';
import { cycleTranslation, getSearchTargetForContentType, serializeRecordedHotkey } from '../../utils/shortcutHelpers';

const makeEvent = (key, { ctrl = false, meta = false, alt = false, shift = false } = {}) => ({
  key, ctrlKey: ctrl, metaKey: meta, altKey: alt, shiftKey: shift,
});

describe('getSearchTargetForContentType', () => {
  it('targets bible search in bible mode', () => {
    expect(getSearchTargetForContentType('bible')).toBe('bible');
  });
  it('targets song search in lyrics mode', () => {
    expect(getSearchTargetForContentType('lyrics')).toBe('song');
  });
  it('defaults unknown modes to song search', () => {
    expect(getSearchTargetForContentType('anything')).toBe('song');
  });
});

describe('cycleTranslation', () => {
  const ids = ['web', 'kjv', 'esv'];

  it('returns the next id and wraps around', () => {
    expect(cycleTranslation('web', ids)).toBe('kjv');
    expect(cycleTranslation('kjv', ids)).toBe('esv');
    expect(cycleTranslation('esv', ids)).toBe('web');
  });

  it('starts from the first when current is unknown/null', () => {
    expect(cycleTranslation(null, ids)).toBe('web');
    expect(cycleTranslation('missing', ids)).toBe('web');
  });

  it('returns the only id when there is a single bible', () => {
    expect(cycleTranslation('web', ['web'])).toBe('web');
  });

  it('returns null when there are no bibles', () => {
    expect(cycleTranslation(null, [])).toBeNull();
  });
});

describe('serializeRecordedHotkey', () => {
  it('normalizes the primary Ctrl modifier to Mod', () => {
    expect(serializeRecordedHotkey(makeEvent('b', { ctrl: true }))).toBe('Mod+B');
  });

  it('normalizes the primary Cmd modifier to Mod', () => {
    expect(serializeRecordedHotkey(makeEvent('b', { meta: true }))).toBe('Mod+B');
  });

  it('includes Alt and Shift modifiers', () => {
    expect(serializeRecordedHotkey(makeEvent('b', { ctrl: true, shift: true }))).toBe('Mod+Shift+B');
    expect(serializeRecordedHotkey(makeEvent('p', { ctrl: true, alt: true }))).toBe('Mod+Alt+P');
  });

  it('handles navigation keys', () => {
    expect(serializeRecordedHotkey(makeEvent('ArrowLeft', { ctrl: true, shift: true }))).toBe('Mod+Shift+ArrowLeft');
  });

  it('returns null when only modifiers are pressed', () => {
    expect(serializeRecordedHotkey(makeEvent('Shift', { shift: true }))).toBeNull();
    expect(serializeRecordedHotkey(makeEvent('Control', { ctrl: true }))).toBeNull();
  });

  it('uppercases single-letter keys', () => {
    expect(serializeRecordedHotkey(makeEvent('f', { ctrl: true }))).toBe('Mod+F');
  });
});
