import { createLogger } from './logger.js';

const log = createLogger('ChordStripper');

const CHORD_TOKEN_REGEX =
  /^[A-G][#b]?(?:(?:maj|min|dim|aug|sus|add|m)?\d*(?:sus\d+|add\d+)?)?(?:\/[A-G][#b]?)?$/;

const INLINE_CHORD_REGEX =
  /\[([A-G][#b]?(?:(?:maj|min|dim|aug|sus|add|m)?\d*(?:sus\d+|add\d+)?)?(?:\/[A-G][#b]?)?)\]/g;

const DIRECTIVE_LINE_REGEX = /^\s*\{[^}\n]*\}\s*$/;

const IGNORABLE_SEPARATOR_TOKENS = new Set(['|', '/', '-', '·']);

export const isChordToken = (token) => {
  if (!token || typeof token !== 'string') return false;
  const cleaned = token.replace(/[()*,;:.!?]+$/g, '').replace(/^[(*]+/g, '');
  if (!cleaned) return false;
  return CHORD_TOKEN_REGEX.test(cleaned);
};

export const isChordLine = (line) => {
  if (!line || typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (DIRECTIVE_LINE_REGEX.test(trimmed)) return true;
  if (/^\s*[\[(]/.test(trimmed)) return false;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const meaningful = tokens.filter((token) => !IGNORABLE_SEPARATOR_TOKENS.has(token));
  if (meaningful.length === 0) return false;
  return meaningful.every(isChordToken);
};

export const isDirectiveLine = (line) =>
  typeof line === 'string' && DIRECTIVE_LINE_REGEX.test(line.trim());

export const stripInlineChordsFromLine = (line) => {
  if (!line || typeof line !== 'string') return { line, removed: 0 };
  let removed = 0;
  const next = line.replace(INLINE_CHORD_REGEX, () => {
    removed += 1;
    return '';
  });
  const collapsed = next.replace(/[ \t]{2,}/g, ' ');
  return { line: collapsed, removed };
};

export const stripChordSheet = (text) => {
  if (text === '' || text == null) {
    return { text: text ?? '', removedChordLines: 0, removedInlineChords: 0, removedDirectives: 0 };
  }
  const lines = String(text).split('\n');
  let removedChordLines = 0;
  let removedInlineChords = 0;
  let removedDirectives = 0;
  const kept = [];

  lines.forEach((line) => {
    if (isDirectiveLine(line)) {
      removedDirectives += 1;
      return;
    }
    if (isChordLine(line)) {
      removedChordLines += 1;
      log.debug('Dropping chord line:', line.trim().slice(0, 60));
      return;
    }
    const { line: stripped, removed } = stripInlineChordsFromLine(line);
    removedInlineChords += removed;
    kept.push(stripped);
  });

  return {
    text: kept.join('\n'),
    removedChordLines,
    removedInlineChords,
    removedDirectives,
  };
};
