import { NORMAL_GROUP_CONFIG } from './constants.js';
import { getEffectiveGroupingConfig } from './runtimeConfig.js';
import { isTranslationLine } from './translation.js';

/**
 * Check if a line is eligible for normal grouping (not bracketed, within character limit)
 * @param {string} line
 * @param {object} config - optional config override
 * @returns {boolean}
 */
export function isNormalGroupCandidate(line, config = null) {
  if (!line || typeof line !== 'string') return false;

  const effectiveConfig = config || getEffectiveGroupingConfig();
  if (!effectiveConfig.enableAutoLineGrouping) return false;

  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (isTranslationLine(trimmed)) return false;

  const maxLength = effectiveConfig.maxLineLength ?? NORMAL_GROUP_CONFIG.MAX_LINE_LENGTH;
  return trimmed.length <= maxLength;
}
