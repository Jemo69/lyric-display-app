import { createLogger } from './logger.js';

const log = createLogger('PreviewSafety');

/**
 * Preview-lines + live-safety pure helpers (feature #02).
 *
 * Kept side-effect free so vitest can cover the acceptance contract:
 * - previewMode ON: single click selects a preview, emits nothing live.
 * - Enter / double-click fires the previewed line to live.
 * - while any output is live (isOutputOn), destructive commands are blocked
 *   unless the operator explicitly overrides.
 */

/** Destructive command ids guarded by the live safety bridge. */
export const DESTRUCTIVE_ACTIONS = ['delete-song', 'remove-setlist', 'clear-setlist'];

/** Volunteer-safe labels for each destructive command. */
export const DESTRUCTIVE_LABELS = {
  'delete-song': 'Delete song',
  'remove-setlist': 'Remove song from setlist',
  'clear-setlist': 'Clear entire setlist',
};

/**
 * Decide what a single click on a lyric line should do.
 * @param {{ previewMode?: boolean, index?: number|null }} args
 * @returns {{ fireLive: boolean, previewIndex: number|null }}
 */
export function resolveLineClick({ previewMode = false, index = null } = {}) {
  if (!previewMode) {
    return { fireLive: true, previewIndex: null };
  }
  if (index === null || index === undefined) {
    log.warn('resolveLineClick called without index while previewMode is ON');
    return { fireLive: false, previewIndex: null };
  }
  return { fireLive: false, previewIndex: index };
}

/**
 * Decide which line Enter / double-click should fire to live.
 * @param {{ previewSelectedLine?: number|null, fallbackIndex?: number|null }} args
 * @returns {number|null} line index to project, or null when nothing pending.
 */
export function resolveFirePreview({ previewSelectedLine = null, fallbackIndex = null } = {}) {
  if (previewSelectedLine !== null && previewSelectedLine !== undefined) {
    return previewSelectedLine;
  }
  if (fallbackIndex !== null && fallbackIndex !== undefined) {
    return fallbackIndex;
  }
  return null;
}

/**
 * Whether a destructive command must be blocked while output is live.
 * @param {{ isOutputOn?: boolean, action?: string }} args
 * @returns {boolean}
 */
export function shouldBlockDestructive({ isOutputOn = false, action = '' } = {}) {
  if (!isOutputOn) return false;
  return DESTRUCTIVE_ACTIONS.includes(action);
}

/**
 * Move a preview selection by one step (vim j/k, arrow keys).
 * Never fires live — pure index math, clamped to [0, length - 1].
 * @param {{ current?: number|null, direction?: 'up'|'down'|'first'|'last', length?: number }} args
 * @returns {number|null}
 */
export function movePreviewSelection({ current = null, direction = 'down', length = 0 } = {}) {
  if (!Number.isInteger(length) || length <= 0) return null;
  if (direction === 'first') return 0;
  if (direction === 'last') return length - 1;
  const base = current === null || current === undefined ? (direction === 'up' ? length - 1 : -1) : current;
  if (direction === 'up') return Math.max(0, base - 1);
  return Math.min(length - 1, base + 1);
}

export default {
  DESTRUCTIVE_ACTIONS,
  DESTRUCTIVE_LABELS,
  resolveLineClick,
  resolveFirePreview,
  shouldBlockDestructive,
  movePreviewSelection,
};
