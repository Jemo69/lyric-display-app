import { createLogger } from './logger.js';

const log = createLogger('TextCasing');

export const CASING_MODES = {
  TITLE: 'title',
  UPPER: 'upper',
  SENTENCE: 'sentence',
};

const LEADING_TOKEN_REGEX =
  /^(?:\s*(?:\[\d{1,2}:\d{2}(?:\.\d{1,2})?\]|<\d{1,2}:\d{2}(?:\.\d{1,2})?>|\[[^\][\n:]*:[^\]\n]*\]|\[[^\]\n:]+?\]))+/;

const splitProtectedPrefix = (line) => {
  if (!line || typeof line !== 'string') return { prefix: '', rest: line ?? '' };
  const match = line.match(LEADING_TOKEN_REGEX);
  if (!match) return { prefix: '', rest: line };
  return { prefix: match[0], rest: line.slice(match[0].length) };
};

const capitalizeWord = (word) => {
  if (!word) return word;
  const firstAlpha = word.search(/[A-Za-zÀ-ÖØ-öø-ÿ]/);
  if (firstAlpha === -1) return word;
  return (
    word.slice(0, firstAlpha) +
    word[firstAlpha].toUpperCase() +
    word.slice(firstAlpha + 1).toLowerCase()
  );
};

export const toTitleCaseLine = (line) => {
  const { prefix, rest } = splitProtectedPrefix(line);
  if (!rest.trim()) return line;
  const cased = rest
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : capitalizeWord(part)))
    .join('');
  return prefix + cased;
};

export const toUpperCaseLine = (line) => {
  const { prefix, rest } = splitProtectedPrefix(line);
  if (!rest.trim()) return line;
  return prefix + rest.toUpperCase();
};

export const toSentenceCaseLine = (line) => {
  const { prefix, rest } = splitProtectedPrefix(line);
  if (!rest.trim()) return line;
  const lowered = rest.toLowerCase();
  const cased = lowered.replace(/(^\s*[a-zà-öø-ÿ])|([.!?]\s+[a-zà-öø-ÿ])/g, (m) =>
    m.toUpperCase()
  );
  return prefix + cased;
};

export const applyCasingToLine = (line, mode) => {
  switch (mode) {
    case CASING_MODES.TITLE:
      return toTitleCaseLine(line);
    case CASING_MODES.UPPER:
      return toUpperCaseLine(line);
    case CASING_MODES.SENTENCE:
      return toSentenceCaseLine(line);
    default:
      log.warn('Unknown casing mode:', mode);
      return line;
  }
};

export const applyCasingToText = (text, mode) => {
  if (text === '' || text == null) return text ?? '';
  const normalized = String(text);
  return normalized
    .split('\n')
    .map((line) => applyCasingToLine(line, mode))
    .join('\n');
};
