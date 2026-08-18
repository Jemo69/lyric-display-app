import { describe, it, expect } from 'vitest';
import {
  parseFileNavigatorQuery,
  prepareNavigatorSearchRecord,
  scoreNavigatorSearchRecord,
  createNavigatorPreview,
} from 'shared/fileNavigatorSearch';

const baseRecord = {
  fileName: 'amazing-grace.lrc',
  fileType: 'lrc',
  relativePath: 'hymns/amazing-grace.lrc',
  contentText:
    '[ti:Amazing Grace]\nAmazing grace, how sweet the sound\nThat saved a wretch like me',
};

function buildRecord(overrides = {}) {
  return prepareNavigatorSearchRecord({ ...baseRecord, ...overrides });
}

describe('scoreNavigatorSearchRecord two-phase search', () => {
  it('matches on name fields without scanning content', () => {
    const record = { ...buildRecord(), normalizedContent: '' };
    const result = scoreNavigatorSearchRecord(record, parseFileNavigatorQuery('amazing'));
    expect(result).not.toBeNull();
    expect(result.matchedField).toBe('name');
  });

  it('still matches content-only queries', () => {
    const record = buildRecord();
    const result = scoreNavigatorSearchRecord(record, parseFileNavigatorQuery('wretch'));
    expect(result).not.toBeNull();
    expect(result.matchedField).toBe('content');
  });

  it('returns null when a term matches nothing', () => {
    const result = scoreNavigatorSearchRecord(buildRecord(), parseFileNavigatorQuery('amazing nonexistent'));
    expect(result).toBeNull();
  });

  it('requires every term to match somewhere', () => {
    const record = buildRecord();
    const contentOnly = scoreNavigatorSearchRecord(record, parseFileNavigatorQuery('wretch grace'));
    expect(contentOnly).not.toBeNull();
  });

  it('ranks name matches above content matches', () => {
    const record = buildRecord();
    const nameMatch = scoreNavigatorSearchRecord(record, parseFileNavigatorQuery('amazing'));
    const contentOnly = scoreNavigatorSearchRecord(record, parseFileNavigatorQuery('wretch'));
    expect(nameMatch.score).toBeGreaterThan(contentOnly.score);
  });

  it('applies the content phrase bonus only when content was scanned', () => {
    const phraseRecord = prepareNavigatorSearchRecord({
      ...baseRecord,
      contentText: 'Amazing grace sound, that saved a wretch like me',
    });
    const noPhraseRecord = buildRecord();
    const withBonus = scoreNavigatorSearchRecord(phraseRecord, parseFileNavigatorQuery('grace sound'));
    const withoutBonus = scoreNavigatorSearchRecord(noPhraseRecord, parseFileNavigatorQuery('grace sound'));
    expect(withBonus).not.toBeNull();
    expect(withoutBonus).not.toBeNull();
    expect(withBonus.score - withoutBonus.score).toBe(80);
  });
});

describe('createNavigatorPreview', () => {
  it('strips LRC timestamps and metadata tags', () => {
    const preview = createNavigatorPreview('[ti:Test]\n[00:12.34]Some line\n<00:45>Another', 'lrc', 20_000);
    expect(preview).toBe('Some line\nAnother');
  });

  it('caps preview length at the character budget', () => {
    const preview = createNavigatorPreview('x'.repeat(50_000), 'txt', 20_000);
    expect(preview.length).toBe(20_000);
  });
});