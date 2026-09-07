import { normalizeNavigatorSearchText } from './fileNavigatorSearch.js';

/**
 * Normalizes comparison path if no function is provided.
 * Default is case-insensitive on Windows, case-sensitive elsewhere.
 */
const defaultNormalizeKey = (value) => (
  typeof process !== 'undefined' && process.platform === 'win32'
    ? String(value || '').toLowerCase()
    : String(value || '')
);

/**
 * Extracts searchable alphanumeric tokens (min length 2) with punctuation stripped.
 * Ensures e.g. "gone," matches query "gone".
 * @param {string} text
 * @param {Function} normalizeTextFn
 * @returns {string[]}
 */
export function extractNavigatorSearchTokens(text = '', normalizeTextFn = normalizeNavigatorSearchText) {
  if (!text) return [];
  const normalized = normalizeTextFn(text);
  return normalized
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

/**
 * Creates a bidirectional inverted index for fast candidate file pruning.
 * - tokenIndex: Map<token, Set<normalizedPathKey>>
 * - fileTokens:  Map<normalizedPathKey, Set<token>>
 *
 * Provides O(1) file updates/drops, zero empty-set memory leaks, and title+content indexing.
 */
export function createNavigatorTokenIndex({
  normalizeKeyFn = defaultNormalizeKey,
  normalizeTextFn = normalizeNavigatorSearchText,
} = {}) {
  const tokenIndex = new Map();
  const fileTokens = new Map();

  function clearIndex() {
    tokenIndex.clear();
    fileTokens.clear();
  }

  function dropRecordTokens(filePath) {
    if (!filePath) return;
    const key = normalizeKeyFn(filePath);
    const existingTokens = fileTokens.get(key);
    if (!existingTokens) return;

    for (const token of existingTokens) {
      const keySet = tokenIndex.get(token);
      if (keySet) {
        keySet.delete(key);
        if (keySet.size === 0) {
          tokenIndex.delete(token); // O(1) empty set cleanup
        }
      }
    }
    fileTokens.delete(key);
  }

  function indexRecordTokens(record = {}) {
    if (!record || !record.filePath) return;
    const key = normalizeKeyFn(record.filePath);
    dropRecordTokens(key);

    const tokens = new Set();
    const addFromText = (text) => {
      const extracted = extractNavigatorSearchTokens(text, normalizeTextFn);
      for (let i = 0; i < extracted.length; i++) {
        tokens.add(extracted[i]);
      }
    };

    // F1: Index normalizedStem (or stem derived from fileName), avoiding raw extension pollution
    const stem = record.normalizedStem || (record.fileName ? String(record.fileName).replace(/\.[^/.\\]+$/, '') : '');
    addFromText(stem);

    // Index full normalized content text
    const content = record.normalizedContent || record.contentText || '';
    addFromText(content);

    if (tokens.size === 0) return;

    fileTokens.set(key, tokens);
    for (const token of tokens) {
      let keySet = tokenIndex.get(token);
      if (!keySet) {
        keySet = new Set();
        tokenIndex.set(token, keySet);
      }
      keySet.add(key);
    }
  }

  /**
   * Intersects candidate keys matching all given terms.
   * Returns:
   * - null: if query has no terms (caller should examine all records)
   * - Set<normalizedKey>: matching candidate keys (may be empty if no token matched)
   */
  function findCandidateKeys(terms = []) {
    const validTerms = (Array.isArray(terms) ? terms : [])
      .map((t) => extractNavigatorSearchTokens(t, normalizeTextFn))
      .flat()
      .filter(Boolean);

    if (validTerms.length === 0) return null;

    let candidateKeys = null;
    for (const term of validTerms) {
      const matchingKeys = tokenIndex.get(term) || new Set();
      if (candidateKeys === null) {
        candidateKeys = new Set(matchingKeys);
      } else {
        for (const k of candidateKeys) {
          if (!matchingKeys.has(k)) {
            candidateKeys.delete(k);
          }
        }
      }
      if (candidateKeys.size === 0) break;
    }

    return candidateKeys;
  }

  return {
    tokenIndex,
    fileTokens,
    clearIndex,
    dropRecordTokens,
    indexRecordTokens,
    findCandidateKeys,
  };
}
