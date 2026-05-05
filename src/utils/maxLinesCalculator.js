/**
 * Measures the rendered width of text in single-line (no-wrap) mode.
 * Used as a fallback and by the single-line path.
 */
export const measureTextWidth = ({
  text,
  testFontSize,
  fontStyle,
  bold,
  italic,
  horizontalMarginRem,
  processDisplayText,
  containerWidth = null,
}) => {
  const processedText = processDisplayText(text);
  const lines = processedText.split('\n');

  let rootFontSize = 16;
  try {
    rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  } catch { }

  const viewportWidth = window.innerWidth;
  const horizontalMarginPx = horizontalMarginRem * rootFontSize;
  const availableWidth = containerWidth && containerWidth > 0
    ? containerWidth
    : Math.max(0, viewportWidth - (2 * horizontalMarginPx));

  if (!availableWidth) {
    return 0;
  }

  let maxWidth = 0;

  lines.forEach((line) => {
    const tempSpan = document.createElement('span');
    tempSpan.style.position = 'absolute';
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.left = '-99999px';
    tempSpan.style.top = '0';
    tempSpan.style.display = 'inline-block';
    tempSpan.style.fontFamily = fontStyle;
    tempSpan.style.fontSize = `${testFontSize}px`;
    tempSpan.style.fontWeight = bold ? 'bold' : 'normal';
    tempSpan.style.fontStyle = italic ? 'italic' : 'normal';
    tempSpan.style.lineHeight = '1.05';
    tempSpan.style.whiteSpace = 'pre';
    tempSpan.style.wordBreak = 'normal';
    tempSpan.style.wordWrap = 'normal';
    tempSpan.style.overflowWrap = 'normal';
    tempSpan.textContent = line;

    document.body.appendChild(tempSpan);
    const measuredWidth = tempSpan.getBoundingClientRect().width;
    document.body.removeChild(tempSpan);

    if (measuredWidth > maxWidth) {
      maxWidth = measuredWidth;
    }
  });

  return maxWidth;
};

/**
 * Measures the total rendered height of text when word-wrapped inside a
 * fixed-width container.  Returns the pixel height of the text block.
 */
export const measureWrappedHeight = ({
  text,
  testFontSize,
  containerWidth,
  fontStyle,
  bold,
  italic,
  processDisplayText,
  lineHeight = 1.15,
}) => {
  const processedText = processDisplayText(text);

  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'absolute';
  tempDiv.style.visibility = 'hidden';
  tempDiv.style.left = '-99999px';
  tempDiv.style.top = '0';
  tempDiv.style.width = `${containerWidth}px`;
  tempDiv.style.fontFamily = fontStyle;
  tempDiv.style.fontSize = `${testFontSize}px`;
  tempDiv.style.fontWeight = bold ? 'bold' : 'normal';
  tempDiv.style.fontStyle = italic ? 'italic' : 'normal';
  tempDiv.style.lineHeight = `${lineHeight}`;
  tempDiv.style.whiteSpace = 'pre-wrap';
  tempDiv.style.wordBreak = 'break-word';
  tempDiv.style.overflowWrap = 'break-word';
  tempDiv.textContent = processedText;

  document.body.appendChild(tempDiv);
  const height = tempDiv.getBoundingClientRect().height;
  document.body.removeChild(tempDiv);

  return height;
};

/**
 * Calculates the optimal font size so that text fills the target width
 * percentage of the screen without overflowing vertically.
 *
 * The font grows as large as possible (up to maxFontSize).  When the text
 * is too long for one line at that size it wraps automatically.  The
 * algorithm stops growing when the wrapped text block would exceed the
 * available vertical space.
 *
 * Users control two things:
 *   • maxFontSize   – upper cap on the font size
 *   • fitWidthPercent – how much of the screen width the text should cover
 *
 * @param {Object}   p
 * @param {string}   p.text              – The text to fit
 * @param {number}   p.fontSize          – User's preferred/fallback font size
 * @param {number}   p.maxFontSize       – Upper cap (default 800)
 * @param {number}   p.fitWidthPercent   – Target width coverage (default 90)
 * @param {string}   p.fontStyle         – Font family
 * @param {boolean}  p.bold
 * @param {boolean}  p.italic
 * @param {number}   p.horizontalMarginRem – Horizontal margin in rem
 * @param {Function} p.processDisplayText  – e.g. toUpperCase
 * @param {boolean}  p.maxLinesEnabled   – Master on/off switch
 * @param {number|null} p.containerWidth – Override for available width (px)
 * @param {number|null} p.availableHeight – Vertical space the text may occupy (px)
 * @returns {{ adjustedSize: number|null, isTruncated: boolean }}
 */
export const calculateOptimalFontSize = ({
  text,
  fontSize,
  maxFontSize = 800,
  fitWidthPercent = 90,
  fontStyle,
  bold,
  italic,
  horizontalMarginRem,
  processDisplayText,
  maxLinesEnabled = false,
  containerWidth = null,
  availableHeight = null,
}) => {
  if (!maxLinesEnabled) {
    return { adjustedSize: null, isTruncated: false };
  }

  const targetMaxSize = Math.max(1, Math.min(1000, maxFontSize));
  const targetCoverage = Math.max(10, Math.min(100, fitWidthPercent));

  let rootFontSize = 16;
  try {
    rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  } catch { }

  const viewportWidth = window.innerWidth;
  const horizontalMarginPx = horizontalMarginRem * rootFontSize;
  const rawAvailableWidth = containerWidth && containerWidth > 0
    ? containerWidth
    : Math.max(0, viewportWidth - (2 * horizontalMarginPx));
  const targetWidth = rawAvailableWidth * (targetCoverage / 100);

  if (!targetWidth) {
    return { adjustedSize: null, isTruncated: false };
  }

  // Use the provided availableHeight, or fall back to 80 % of the viewport
  // height (a safe default that leaves room for chrome / bars).
  const maxHeight = availableHeight && availableHeight > 0
    ? availableHeight
    : window.innerHeight * 0.8;

  // ── Binary search: largest font that fits both width and height ────
  let bestFitSize = 1;
  let low = 1;
  let high = targetMaxSize;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    const wrappedHeight = measureWrappedHeight({
      text,
      testFontSize: mid,
      containerWidth: targetWidth,
      fontStyle,
      bold,
      italic,
      processDisplayText,
      lineHeight: 1.15,
    });

    if (wrappedHeight <= maxHeight) {
      bestFitSize = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (bestFitSize === fontSize) {
    return { adjustedSize: null, isTruncated: false };
  }

  return { adjustedSize: bestFitSize, isTruncated: false };
};
