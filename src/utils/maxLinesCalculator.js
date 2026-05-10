/**
 * Measures the rendered width of text for a given styling configuration.
 * Accounts for translation lines (text with \n) by measuring each line separately.
 * @param {Object} params - Measurement parameters
 * @param {string} params.text - The text to measure
 * @param {number} params.testFontSize - Font size to test in pixels
 * @param {string} params.fontStyle - Font family name
 * @param {boolean} params.bold - Whether text is bold
 * @param {boolean} params.italic - Whether text is italic
 * @param {number} params.horizontalMarginRem - Horizontal margin in rem units
 * @param {Function} params.processDisplayText - Function to process text (e.g., uppercase)
 * @param {number|null} params.containerWidth - Width of the available container in pixels
 * @returns {number} Widest rendered line width in pixels
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
 * Calculates the optimal font size to fit text within a target width percentage.
 * @param {Object} params - Calculation parameters
 * @param {string} params.text - The text to fit
 * @param {number} params.fontSize - User's preferred font size
 * @param {number} params.maxFontSize - Maximum allowed font size
 * @param {number} params.fitWidthPercent - Percentage of the available width to cover
 * @param {string} params.fontStyle - Font family name
 * @param {boolean} params.bold - Whether text is bold
 * @param {boolean} params.italic - Whether text is italic
 * @param {number} params.horizontalMarginRem - Horizontal margin in rem units
 * @param {Function} params.processDisplayText - Function to process text
 * @param {boolean} params.maxLinesEnabled - Whether autoscaling is enabled
 * @param {number|null} params.containerWidth - Available container width in pixels
 * @returns {Object} Result object with adjustedSize and isTruncated properties
 */
export const calculateOptimalFontSize = ({
  text,
  fontSize,
  maxFontSize = 300,
  fitWidthPercent = 90,
  minFontSize = 24,
  fontStyle,
  bold,
  italic,
  horizontalMarginRem,
  processDisplayText,
  maxLinesEnabled = false,
  containerWidth = null,
}) => {
  if (!maxLinesEnabled) {
    return { adjustedSize: null, isTruncated: false };
  }

  const targetMinSize = Math.max(1, Math.min(400, minFontSize));
  const targetMaxSize = Math.max(targetMinSize, Math.min(400, maxFontSize));
  const targetCoverage = Math.max(10, Math.min(100, fitWidthPercent));

  let rootFontSize = 16;
  try {
    rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  } catch { }

  const viewportWidth = window.innerWidth;
  const horizontalMarginPx = horizontalMarginRem * rootFontSize;
  const availableWidth = containerWidth && containerWidth > 0
    ? containerWidth
    : Math.max(0, viewportWidth - (2 * horizontalMarginPx));
  const targetWidth = availableWidth * (targetCoverage / 100);

  if (!targetWidth) {
    return { adjustedSize: null, isTruncated: false };
  }

  const measureAtSize = (size) => measureTextWidth({
    text,
    testFontSize: size,
    fontStyle,
    bold,
    italic,
    horizontalMarginRem,
    processDisplayText,
    containerWidth,
  });

  let bestFitSize = targetMinSize;
  let low = targetMinSize;
  let high = targetMaxSize;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const measuredWidth = measureAtSize(mid);

    if (measuredWidth <= targetWidth) {
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