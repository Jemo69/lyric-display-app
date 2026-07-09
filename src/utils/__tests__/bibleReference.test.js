import { describe, it, expect } from 'vitest';
import { formatBibleReference } from '../bibleReference';

describe('formatBibleReference', () => {
    it('returns empty string when no reference given', () => {
        expect(formatBibleReference('', 'KJV')).toBe('');
        expect(formatBibleReference(null, 'KJV')).toBe('');
    });

    it('returns the reference alone when no version given', () => {
        expect(formatBibleReference('John 3:16', '')).toBe('John 3:16');
        expect(formatBibleReference('John 3:16', null)).toBe('John 3:16');
        expect(formatBibleReference('John 3:16', undefined)).toBe('John 3:16');
    });

    it('appends the version in parentheses', () => {
        expect(formatBibleReference('John 3:16', 'KJV')).toBe('John 3:16 (KJV)');
        expect(formatBibleReference('Psalm 23:1', 'WEB')).toBe('Psalm 23:1 (WEB)');
    });

    it('trims whitespace from the version', () => {
        expect(formatBibleReference('John 3:16', '  KJV  ')).toBe('John 3:16 (KJV)');
    });
});
