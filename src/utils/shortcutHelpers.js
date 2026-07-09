import {
  parseKeyboardEvent,
  hasNonModifierKey,
  normalizeKeyName,
} from '@tanstack/hotkeys';

/**
 * Given the active content type, decide which search input Ctrl/Cmd+F should focus.
 * In Bible mode it targets the Bible search; otherwise the songs search.
 * @param {('lyrics'|'bible')} contentType
 * @returns {('song'|'bible')}
 */
export function getSearchTargetForContentType(contentType) {
  return contentType === 'bible' ? 'bible' : 'song';
}

/**
 * Returns the next Bible id in a rotation, wrapping around to the first.
 * If there are fewer than two bibles, returns the current id (or null).
 * @param {string|null} currentId
 * @param {string[]} ids  Ordered list of available Bible ids.
 * @returns {string|null}
 */
export function cycleTranslation(currentId, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  if (ids.length === 1) return ids[0];

  const index = currentId ? ids.indexOf(currentId) : -1;
  const nextIndex = (index + 1) % ids.length;
  return ids[nextIndex];
}

/**
 * Serialize a captured KeyboardEvent into a canonical TanStack Hotkey combo string
 * (e.g. `Mod+Shift+B`). The primary Ctrl/Cmd modifier is always normalized to `Mod`
 * so bindings are cross-platform. Returns null when only modifier keys were pressed.
 * @param {KeyboardEvent} event
 * @returns {string|null}
 */
export function serializeRecordedHotkey(event) {
  const parsed = parseKeyboardEvent(event);
  if (!hasNonModifierKey(parsed)) return null;

  const parts = [];
  // Primary modifier: Ctrl on Win/Linux, Cmd on macOS -> store as `Mod`.
  if (event.metaKey || event.ctrlKey) parts.push('Mod');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  let key = normalizeKeyName(event.key);
  if (key && key.length === 1) key = key.toUpperCase();

  parts.push(key);
  return parts.join('+');
}
