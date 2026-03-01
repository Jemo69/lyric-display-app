/**
 * Clamps a value between a minimum and maximum.
 * @param {number} value - The value to clamp.
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @returns {number} The clamped value.
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Converts a 0-10 opacity value to a hex alpha string (00-ff).
 * @param {number} value - Opacity value from 0 to 10.
 * @returns {string} Hex alpha string.
 */
export const toHexOpacity = (value) => clamp(Math.round((value / 10) * 255), 0, 255)
  .toString(16)
  .padStart(2, '0');
