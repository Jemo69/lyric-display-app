// src/speech/rankNextLyric.js — next lyric line (plan 11, lane 1)
//
// "Fuse.js over useLyricsStore().lyrics using the last 8–12 words of the
//  transcript tail, with a threshold below which nothing is suggested.
//  Returns the top three with scores. The rail shows the current line, the
//  match, and the line after it, because the operator's actual question is
//  'where do I go next', not 'what did he just say'."
//
// Pure: the lyrics array and the transcript are PARAMETERS. No store
// reads — useLyricsStore() stays where it is, in the rail component.
//
// Fuse.js is already a root dependency (never added here); its `threshold`
// drops results worse than THRESHOLDS.lyricFuse, and confidence is
// 1 − score, segment-weighted, checked against THRESHOLDS.suggestion.

import Fuse from 'fuse.js';
import THRESHOLDS from './thresholds.js';
import { combine } from './confidence.js';

/**
 * Searchable text for one lyric line. The store's lines are strings OR
 * group objects (`type: 'group'` with mainLine/translation, `type:
 * 'normal-group'` with line1/line2 — see src/utils/parseLyrics.js).
 * Both parts are indexed: the pastor may quote either.
 */
export function lyricLineText(line) {
  if (typeof line === 'string') return line;
  if (!line || typeof line !== 'object') return '';
  if (line.type === 'group') return [line.mainLine, line.translation].filter(Boolean).join(' ');
  if (line.type === 'normal-group') return [line.line1, line.line2].filter(Boolean).join(' ');
  return line.displayText || line.searchText || line.text || line.line || '';
}

/**
 * The transcript tail: the last THRESHOLDS.lyricTail.maxWords words
 * (8–12 by plan). A tail shorter than the minimum is used as-is — a
 * fragment still narrows the search, and nothing is ever padded.
 *
 * @param {string} transcript
 * @param {{ minWords?: number, maxWords?: number }} [window]
 * @returns {string}
 */
export function lyricTail(transcript, window = THRESHOLDS.lyricTail) {
  const words = String(transcript ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.slice(-window.maxWords).join(' ');
}

/**
 * Fuse the transcript tail over the lyrics and answer "where do I go next".
 *
 * @param {Array<string|object>} lyrics  useLyricsStore().lyrics
 * @param {string} transcript  the live transcript (tail is taken internally)
 * @param {object} [options]
 * @param {number} [options.segmentConfidence=1] hallucination gate 4 —
 *        multiplied into every match before the shared threshold
 * @param {number} [options.selectedIndex=null] the operator's current
 *        line (store `selectedLine`), so the rail can show all three
 *        slots: current, match, line after the match
 * @returns {{ current: {index,text}|null,
 *             match: {index,text,score,confidence},
 *             next: {index,text}|null,
 *             matches: Array<{index,text,score,confidence}> }|null}
 *          null when lyrics are empty, the transcript is empty, or no
 *          match clears THRESHOLDS.suggestion — "a threshold below which
 *          nothing is suggested".
 */
export function rankNextLyric(lyrics, transcript, options = {}) {
  const { segmentConfidence = 1, selectedIndex = null } = options;

  if (!Array.isArray(lyrics) || lyrics.length === 0) return null;
  const tail = lyricTail(transcript);
  if (!tail) return null;

  const docs = [];
  for (let index = 0; index < lyrics.length; index += 1) {
    const text = lyricLineText(lyrics[index]);
    if (text && text.trim()) docs.push({ index, text });
  }
  if (docs.length === 0) return null;

  const fuse = new Fuse(docs, {
    keys: ['text'],
    includeScore: true,
    threshold: THRESHOLDS.lyricFuse,
    ignoreLocation: true,
    minMatchCharLength: 3,
  });

  const matches = fuse
    .search(tail)
    .slice(0, THRESHOLDS.lyricTail.topK)
    .map((result) => ({
      index: result.item.index,
      text: result.item.text,
      score: result.score,
      confidence: combine(1 - result.score, segmentConfidence),
    }))
    .filter((match) => match.confidence >= THRESHOLDS.suggestion);

  if (matches.length === 0) return null;

  const match = matches[0];

  const current =
    Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < lyrics.length
      ? { index: selectedIndex, text: lyricLineText(lyrics[selectedIndex]) }
      : null;

  const nextIndex = match.index + 1;
  const next =
    nextIndex < lyrics.length
      ? { index: nextIndex, text: lyricLineText(lyrics[nextIndex]) }
      : null;

  return { current, match, next, matches };
}

export default rankNextLyric;
