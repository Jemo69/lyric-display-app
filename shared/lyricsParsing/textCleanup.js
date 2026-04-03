import { TIMESTAMP_LIKE_PATTERNS } from './constants.js';

/**
 * Remove timestamp-like patterns from text (useful for TXT files that may contain them)
 * @param {string} text
 * @returns {string}
 */
export function stripTimestampPatterns(text) {
  if (!text || typeof text !== 'string') return text;

  let cleaned = text;
  TIMESTAMP_LIKE_PATTERNS.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, '');
  });

  return cleaned;
}
