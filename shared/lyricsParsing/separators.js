/**
 * Check if a line is a song separator (multiple asterisks, dashes, or underscores used to mark song boundaries)
 * @param {string} line
 * @returns {boolean}
 */
export function isSongSeparator(line) {
  if (!line || typeof line !== 'string') return false;
  const trimmed = line.trim();
  return /^[\*\-_]{2,}/.test(trimmed);
}
