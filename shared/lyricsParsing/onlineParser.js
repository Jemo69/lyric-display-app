import { parseTxtContent } from './txtParser.js';

/**
 * Enhanced processing specifically for online lyrics search results
 * Assumes more aggressive cleanup may be needed
 * @param {string} rawText
 * @param {object} options
 * @returns {{ rawText: string, processedLines: Array<string | object> }}
 */
export function parseOnlineLyricsContent(rawText = '', options = {}) {
  const enhancedOptions = {
    enableSplitting: true,
    splitConfig: {
      TARGET_LENGTH: 60,
      MIN_LENGTH: 40,
      MAX_LENGTH: 80,
      OVERFLOW_TOLERANCE: 15,
    },
    ...options,
  };

  return parseTxtContent(rawText, enhancedOptions);
}
