// src/utils/freeNote.js — Pure helpers for Free Notes mode
// Splitting, formatting, title extraction, and shortcode expansion

/**
 * Splits raw markdown into individual presentation slide blocks on '---'
 * @param {string} raw
 * @returns {string[]}
 */
export function splitFreeNoteSlides(raw) {
  if (!raw || typeof raw !== 'string') return [];
  // Split on --- surrounded by optional whitespace or newlines
  const parts = raw.split(/\n\s*---\s*\n|\n\s*---\s*$|^---\s*\n/g);
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Extracts a concise display title from markdown text.
 * Prefers the first '# Heading', else the first non-empty line.
 * @param {string} raw
 * @returns {string}
 */
export function extractFreeNoteTitle(raw) {
  if (!raw || typeof raw !== 'string') return 'Free Note';
  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return 'Free Note';

  // Check for markdown headings
  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch && headingMatch[1].trim()) {
      return headingMatch[1].trim();
    }
  }

  // Fallback to first line (strip markdown bold/italic/tokens)
  const clean = lines[0]
    .replace(/[*_#`~[\]]/g, '')
    .trim();

  return clean ? clean.slice(0, 50) : 'Free Note';
}

/**
 * Checks if a line is a Bible shortcode: b:Reference or bible:Reference (e.g. b:John 3:16)
 * @param {string} line
 * @returns {string|null} reference or null
 */
export function extractBibleShortcode(line) {
  if (!line || typeof line !== 'string') return null;
  const match = line.trim().match(/^(?:b|bible):\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Checks if a line is a Hymn shortcode: h:Name or hymn:Number
 * @param {string} line
 * @returns {string|null} hymn name or null
 */
export function extractHymnShortcode(line) {
  if (!line || typeof line !== 'string') return null;
  const match = line.trim().match(/^(?:h|hymn):\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Expands lines in markdown content if shortcodes are found.
 * Synchronous / fallback formatter.
 * @param {string} raw
 * @param {object} [resolvers]
 * @returns {string}
 */
export function expandFreeNoteText(raw, resolvers = {}) {
  if (!raw || typeof raw !== 'string') return '';
  const lines = raw.split('\n');
  const expanded = lines.map((line) => {
    const bibleRef = extractBibleShortcode(line);
    if (bibleRef) {
      if (typeof resolvers.resolveBible === 'function') {
        const res = resolvers.resolveBible(bibleRef);
        if (res) return res;
      }
      return `📖 ${bibleRef}`;
    }

    const hymnRef = extractHymnShortcode(line);
    if (hymnRef) {
      if (typeof resolvers.resolveHymn === 'function') {
        const res = resolvers.resolveHymn(hymnRef);
        if (res) return res;
      }
      return `🎵 Hymn: ${hymnRef}`;
    }

    return line;
  });

  return expanded.join('\n');
}

/**
 * Creates a blank Free Note draft
 * @param {string|object} [titleOrObj]
 * @param {string} [content]
 * @returns {object}
 */
export function createFreeNoteDraft(titleOrObj = 'New Note', content = '') {
  const isObj = typeof titleOrObj === 'object' && titleOrObj !== null;
  const title = isObj ? (titleOrObj.title || 'New Note') : titleOrObj;
  const text = isObj ? (titleOrObj.content || '') : content;
  const id = isObj && titleOrObj.id ? titleOrObj.id : `freenote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    title,
    content: text,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Detects if a text string contains markdown formatting syntax or tokens
 * @param {string} text
 * @returns {boolean}
 */
export function isMarkdownContent(text) {
  if (!text || typeof text !== 'string') return false;
  return /(?:^|\n)\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>|```|---|===)|\*\*|==|~~|`[^`]+`|\b(?:b|bible|h|hymn):/i.test(text);
}

/**
 * Dynamically computes an optimal base font size for a markdown note slide.
 * Unlike flat song lyrics with a single font size, notes have hierarchical headings,
 * callouts, and multi-line density. This function computes a balanced base size
 * so the slide fits presentation screens harmoniously without overflow.
 *
 * @param {string} content - The markdown text of the slide
 * @param {object} [options]
 * @returns {number} base font size in px
 */
export function calculateNoteBaseFontSize(content, {
  containerWidth = null,
  containerHeight = null,
  targetFontSize = 48,
  minFontSize = 18,
  maxFontSize = 84,
} = {}) {
  if (!content || typeof content !== 'string') return targetFontSize || 48;

  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const lineCount = lines.length;
  const totalLength = content.length;

  if (lineCount === 0) return targetFontSize || 48;

  let totalWeight = 0;
  for (const line of lines) {
    if (/^#\s+/.test(line)) totalWeight += 2.4;
    else if (/^##\s+/.test(line)) totalWeight += 1.8;
    else if (/^###\s+/.test(line)) totalWeight += 1.4;
    else if (/^>/.test(line)) totalWeight += 1.2;
    else if (/^[-*+]\s+|^\d+\.\s+/.test(line)) totalWeight += 1.1;
    else totalWeight += 1.0;
  }

  const availableHeight = containerHeight || (typeof window !== 'undefined' ? window.innerHeight : 1080);

  let calculated;
  if (totalWeight <= 2.6 && totalLength < 60) {
    // 1 short title or heading: large and prominent
    calculated = Math.round(availableHeight * 0.075);
  } else if (totalWeight <= 4.5 && totalLength < 140) {
    // 2-3 lines (title + subtitle or short quote)
    calculated = Math.round(availableHeight * 0.055);
  } else if (totalWeight <= 7.5 && totalLength < 280) {
    // 4-6 lines (typical sermon point / announcement)
    calculated = Math.round(availableHeight * 0.040);
  } else if (totalWeight <= 12 && totalLength < 500) {
    // 7-10 lines (detailed note)
    calculated = Math.round(availableHeight * 0.030);
  } else {
    // Very dense note (>10 lines)
    calculated = Math.round(availableHeight * 0.024);
  }

  if (targetFontSize && typeof targetFontSize === 'number' && targetFontSize > 0) {
    calculated = Math.round((calculated * 0.6) + (targetFontSize * 0.4));
  }

  return Math.max(minFontSize, Math.min(maxFontSize, calculated));
}

