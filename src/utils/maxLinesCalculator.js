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
    ? Math.max(0, containerWidth - (2 * horizontalMarginPx))
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
    tempSpan.style.display = 'block';
    tempSpan.style.width = `${availableWidth}px`;
    tempSpan.style.maxWidth = `${availableWidth}px`;
    tempSpan.style.fontFamily = fontStyle;
    tempSpan.style.fontSize = `${testFontSize}px`;
    tempSpan.style.fontWeight = bold ? 'bold' : 'normal';
    tempSpan.style.fontStyle = italic ? 'italic' : 'normal';
    tempSpan.style.lineHeight = '1.05';
    tempSpan.style.whiteSpace = 'pre-wrap';
    tempSpan.style.wordBreak = 'break-word';
    tempSpan.style.wordWrap = 'break-word';
    tempSpan.style.overflowWrap = 'anywhere';
    tempSpan.style.boxSizing = 'border-box';
    tempSpan.textContent = line;

    document.body.appendChild(tempSpan);
    const measuredWidth = Math.min(tempSpan.scrollWidth, availableWidth);
    document.body.removeChild(tempSpan);

    if (measuredWidth > maxWidth) {
      maxWidth = measuredWidth;
    }
  });

  return maxWidth;
};

/**
 * Measures the rendered height of text when wrapped to a target width.
 * @param {Object} params - Measurement parameters
 * @param {string} params.text - The text to measure
 * @param {number} params.testFontSize - Font size to test in pixels
 * @param {string} params.fontStyle - Font family name
 * @param {boolean} params.bold - Whether text is bold
 * @param {boolean} params.italic - Whether text is italic
 * @param {number} params.horizontalMarginRem - Horizontal margin in rem units
 * @param {number} params.verticalMarginRem - Vertical margin in rem units
 * @param {Function} params.processDisplayText - Function to process text
 * @param {number|null} params.containerWidth - Available container width in pixels
 * @param {number|null} params.containerHeight - Available container height in pixels
 * @returns {number} Rendered text height in pixels
 */
export const measureTextHeight = ({
  text,
  testFontSize,
  fontStyle,
  bold,
  italic,
  horizontalMarginRem,
  verticalMarginRem = 0,
  processDisplayText,
  containerWidth = null,
  containerHeight = null,
}) => {
  const processedText = processDisplayText(text);

  let rootFontSize = 16;
  try {
    rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  } catch { }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const horizontalMarginPx = horizontalMarginRem * rootFontSize;
  const verticalMarginPx = verticalMarginRem * rootFontSize;
  const availableWidth = containerWidth && containerWidth > 0
    ? Math.max(0, containerWidth - (2 * horizontalMarginPx))
    : Math.max(0, viewportWidth - (2 * horizontalMarginPx));
  const availableHeight = containerHeight && containerHeight > 0
    ? Math.max(0, containerHeight - (2 * verticalMarginPx))
    : Math.max(0, viewportHeight - (2 * verticalMarginPx));

  if (!availableWidth || !availableHeight) {
    return 0;
  }

  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'absolute';
  tempDiv.style.visibility = 'hidden';
  tempDiv.style.left = '-99999px';
  tempDiv.style.top = '0';
  tempDiv.style.width = `${availableWidth}px`;
  tempDiv.style.maxWidth = `${availableWidth}px`;
  tempDiv.style.height = 'auto';
  tempDiv.style.display = 'block';
  tempDiv.style.fontFamily = fontStyle;
  tempDiv.style.fontSize = `${testFontSize}px`;
  tempDiv.style.fontWeight = bold ? 'bold' : 'normal';
  tempDiv.style.fontStyle = italic ? 'italic' : 'normal';
  tempDiv.style.lineHeight = '1.05';
  tempDiv.style.whiteSpace = 'pre-wrap';
  tempDiv.style.wordBreak = 'break-word';
  tempDiv.style.overflowWrap = 'anywhere';
  tempDiv.style.boxSizing = 'border-box';
  tempDiv.textContent = processedText;

  document.body.appendChild(tempDiv);
  const rect = tempDiv.getBoundingClientRect();
  document.body.removeChild(tempDiv);

  return rect.height;
};

/**
 * Measures stage text the way it is actually rendered: wrapped inside a fixed
 * width, with explicit line breaks and optional per-line scale factors.
 */
const measureRenderedTextBox = ({
  text,
  testFontSize,
  fontStyle,
  bold,
  italic,
  processDisplayText,
  maxWidthPx,
  lineHeight = 1.05,
  lineScales = null,
}) => {
  const processedText = processDisplayText(text);
  const lines = processedText.split('\n');

  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'absolute';
  tempDiv.style.visibility = 'hidden';
  tempDiv.style.left = '-99999px';
  tempDiv.style.top = '0';
  tempDiv.style.width = `${maxWidthPx}px`;
  tempDiv.style.maxWidth = `${maxWidthPx}px`;
  tempDiv.style.height = 'auto';
  tempDiv.style.display = 'block';
  tempDiv.style.fontFamily = fontStyle;
  tempDiv.style.fontWeight = bold ? 'bold' : 'normal';
  tempDiv.style.fontStyle = italic ? 'italic' : 'normal';
  tempDiv.style.lineHeight = `${lineHeight}`;
  tempDiv.style.whiteSpace = 'pre-wrap';
  tempDiv.style.wordBreak = 'break-word';
  tempDiv.style.wordWrap = 'break-word';
  tempDiv.style.overflowWrap = 'anywhere';
  tempDiv.style.boxSizing = 'border-box';

  lines.forEach((line, index) => {
    const lineDiv = document.createElement('div');
    const scale = Array.isArray(lineScales) ? (lineScales[index] ?? 1) : 1;
    lineDiv.style.fontSize = `${testFontSize * scale}px`;
    lineDiv.style.lineHeight = `${lineHeight}`;
    lineDiv.style.whiteSpace = 'pre-wrap';
    lineDiv.style.wordBreak = 'break-word';
    lineDiv.style.wordWrap = 'break-word';
    lineDiv.style.overflowWrap = 'anywhere';
    lineDiv.textContent = line;
    tempDiv.appendChild(lineDiv);
  });

  document.body.appendChild(tempDiv);
  const rect = tempDiv.getBoundingClientRect();
  const width = Math.max(rect.width, tempDiv.scrollWidth);
  const height = Math.max(rect.height, tempDiv.scrollHeight);
  document.body.removeChild(tempDiv);

  return { width, height };
};

/**
 * Calculates the optimal font size to fit text within target width and height percentages.
 * @param {Object} params - Calculation parameters
 * @param {string} params.text - The text to fit
 * @param {number} params.fontSize - User's preferred font size
 * @param {number} params.minFontSize - Minimum allowed font size
 * @param {number} params.maxFontSize - Maximum allowed font size
 * @param {number} params.fitWidthPercent - Percentage of the available width to cover
 * @param {number} params.fitHeightPercent - Percentage of the available height to cover
 * @param {string} params.fontStyle - Font family name
 * @param {boolean} params.bold - Whether text is bold
 * @param {boolean} params.italic - Whether text is italic
 * @param {number} params.horizontalMarginRem - Horizontal margin in rem units
 * @param {number} params.verticalMarginRem - Vertical margin in rem units
 * @param {Function} params.processDisplayText - Function to process text
 * @param {boolean} params.maxLinesEnabled - Whether autoscaling is enabled
 * @param {number|null} params.containerWidth - Available container width in pixels
 * @param {number|null} params.containerHeight - Available container height in pixels
 * @param {Array<number>|null} params.lineScales - Optional scale multiplier per explicit text line
 * @returns {Object} Result object with adjustedSize and isTruncated properties
 */
export const calculateOptimalFontSize = ({
  text,
  fontSize,
  minFontSize = 24,
  maxFontSize = 300,
  fitWidthPercent = 90,
  fitHeightPercent = 90,
  fontStyle,
  bold,
  italic,
  horizontalMarginRem,
  verticalMarginRem = 0,
  processDisplayText,
  maxLinesEnabled = false,
  containerWidth = null,
  containerHeight = null,
  lineScales = null,
}) => {
  if (!maxLinesEnabled) {
    return { adjustedSize: null, isTruncated: false };
  }

  const targetMinSize = Math.max(1, Math.min(400, minFontSize));
  const targetMaxSize = Math.max(targetMinSize, Math.min(400, maxFontSize));
  const targetWidthCoverage = Math.max(10, Math.min(100, fitWidthPercent));
  const targetHeightCoverage = Math.max(10, Math.min(100, fitHeightPercent));

  let rootFontSize = 16;
  try {
    rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  } catch { }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const horizontalMarginPx = horizontalMarginRem * rootFontSize;
  const verticalMarginPx = verticalMarginRem * rootFontSize;
  const availableWidth = containerWidth && containerWidth > 0
    ? Math.max(0, containerWidth - (2 * horizontalMarginPx))
    : Math.max(0, viewportWidth - (2 * horizontalMarginPx));
  const availableHeight = containerHeight && containerHeight > 0
    ? Math.max(0, containerHeight - (2 * verticalMarginPx))
    : Math.max(0, viewportHeight - (2 * verticalMarginPx));
  const targetWidth = availableWidth * (targetWidthCoverage / 100);
  const targetHeight = availableHeight * (targetHeightCoverage / 100);

  if (!targetWidth || !targetHeight) {
    return { adjustedSize: null, isTruncated: false };
  }

  const measureAtSize = (size) => measureRenderedTextBox({
    text,
    testFontSize: size,
    fontStyle,
    bold,
    italic,
    processDisplayText,
    maxWidthPx: targetWidth,
    lineScales,
  });

  let bestFitSize = targetMinSize;
  let low = targetMinSize;
  let high = targetMaxSize;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const measured = measureAtSize(mid);

    if (measured.width <= targetWidth && measured.height <= targetHeight) {
      bestFitSize = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const finalMeasurement = measureAtSize(bestFitSize);
  const isTruncated = finalMeasurement.width > targetWidth || finalMeasurement.height > targetHeight;

  if (bestFitSize === fontSize && !isTruncated) {
    return { adjustedSize: null, isTruncated: false };
  }

  return { adjustedSize: bestFitSize, isTruncated };
};
