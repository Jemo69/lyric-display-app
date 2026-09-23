export const BIBLE_SPLIT_METHODS = {
  LEGACY: 'legacy',
  NEAREST_PUNCTUATION: 'nearest-punctuation',
  GEOMETRY: 'geometry',
  LEGACY_PUNCTUATION: 'legacy-punctuation',
  GEOMETRY_PUNCTUATION: 'geometry-punctuation',
  TAG_SAFE: 'tag-safe',
};

export const BIBLE_SPLIT_METHOD_OPTIONS = [
  {
    id: BIBLE_SPLIT_METHODS.NEAREST_PUNCTUATION,
    label: 'Nearest punctuation',
    desc: 'Fast O(n) splitter that never cuts mid-word, honouring the character budget.',
  },
  {
    id: BIBLE_SPLIT_METHODS.GEOMETRY,
    label: 'Geometry smart split',
    desc: 'Packs verses to fit the output slide geometry so slides actually fit on screen.',
  },
  {
    id: BIBLE_SPLIT_METHODS.LEGACY,
    label: 'Legacy (previous)',
    desc: 'The original splitter, centre-cut based with up to 3 segments per verse.',
  },
  {
    id: BIBLE_SPLIT_METHODS.LEGACY_PUNCTUATION,
    label: 'Balanced + punctuation',
    desc: 'Legacy\u2019s few balanced slides, but breaks only at punctuation so words are never cut.',
  },
  {
    id: BIBLE_SPLIT_METHODS.GEOMETRY_PUNCTUATION,
    label: 'Geometry + punctuation',
    desc: 'Fits the screen line budget while keeping every break punctuation-clean.',
  },
  {
    id: BIBLE_SPLIT_METHODS.TAG_SAFE,
    label: 'Tag-safe (red-letter)',
    desc: 'Splits without breaking Words-of-Christ spans or italics; plain text matches Nearest punctuation.',
  },
];

export function normalizeVerseText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * MF-15 — Dangling-bracket protection.
 *
 * KJV/NASB-style translator brackets like `[and he said]` are short
 * (<4 words) clarifications that must never be severed across slides:
 * when a split point lands inside one, the whole bracketed phrase moves
 * to the next slide instead.
 *
 * Given the full normalized text and a candidate break index, reports
 * whether the break severs such a bracket and, if so, where the break
 * should move. Pure string scan (no DOMParser); no-op for text without
 * brackets so non-bracket splitting behaviour is unchanged.
 */
export function getDanglingBracketInfo(text, breakIndex) {
  const src = String(text || '');
  const safeIndex = Math.max(0, Math.min(Math.trunc(breakIndex) || 0, src.length));
  const none = {
    inside: false,
    bracketStart: safeIndex,
    bracketEnd: safeIndex,
    wordCount: 0,
    content: '',
    adjustedIndex: safeIndex,
  };
  if (!src) return none;

  const before = src.slice(0, safeIndex);
  const after = src.slice(safeIndex);
  const lastOpen = before.lastIndexOf('[');
  if (lastOpen === -1) return none;
  // Bracket already closed before the break — nothing dangles.
  if (before.indexOf(']', lastOpen) !== -1) return none;

  const closingOffset = after.indexOf(']');
  // Unclosed bracket — cannot move it whole; leave the break alone.
  if (closingOffset === -1) return none;

  const content = (before.slice(lastOpen + 1) + after.slice(0, closingOffset)).replace(/[\[\]]/g, '').trim();
  if (!content) return none;

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  // Only short translator brackets are protected; longer [...] spans
  // remain splittable at word boundaries.
  if (!wordCount || wordCount >= 4) return { ...none, wordCount, content };

  let adjustedIndex = lastOpen;
  while (adjustedIndex > 0 && /\s/.test(before[adjustedIndex - 1])) adjustedIndex--;

  return {
    inside: true,
    bracketStart: lastOpen,
    bracketEnd: safeIndex + closingOffset + 1,
    wordCount,
    content,
    adjustedIndex,
  };
}

/**
 * Method 02 — Nearest-punctuation splitter.
 * Deterministic, O(n), never cuts mid-word. Breaks at sentence ends first,
 * then clauses, then commas, then spaces. No max-segment cap.
 */
export function splitByNearestPunctuation(text, maxChars = 100, tolerance = 0) {
  const src = normalizeVerseText(text);
  if (!src) return [''];

  const accept = tolerance > 0 ? maxChars + tolerance : maxChars;
  if (src.length <= accept) return [src];

  const slides = [];
  let start = 0;
  const len = src.length;

  while (start < len) {
    if (len - start <= accept) {
      slides.push(src.slice(start).trim());
      break;
    }

    const windowMin = Math.max(start, start + maxChars - Math.max(maxChars, 1));
    const windowEnd = Math.min(len - 1, start + maxChars + tolerance);
    let best = -1;
    let bestPriority = -1;

    for (let i = windowEnd; i >= windowMin; i--) {
      const c = src[i];
      if (c === '.' || c === '!' || c === '?') {
        best = i + 1;
        bestPriority = 3;
        break;
      }
      const p = c === ';' || c === ':' || c === '\u2014' || c === '\u2013'
        ? 2
        : c === ',' ? 1
          : (c === ' ' && bestPriority < 0) ? 0 : -1;
      if (p > bestPriority) {
        bestPriority = p;
        best = i + 1;
      }
    }

    if (best < 0) {
      for (let i = windowEnd; i >= start; i--) {
        if (src[i] === ' ') {
          best = i + 1;
          break;
        }
      }
    }

    if (best < 0) {
      best = Math.min(windowEnd + 1, len);
    }

    if (best <= start) {
      best = Math.min(windowEnd + 1, len);
    }

    // MF-15: dangling-bracket protection — never sever a short [...]
    // translator bracket (KJV/NASB style, <4 words) across slides; move it
    // whole to the next slide. No-op for text without brackets. The guards
    // preserve forward progress (no empty slides, no infinite loop) when the
    // bracket opens at or before the current slide start.
    const bracket = getDanglingBracketInfo(src, best);
    if (
      bracket.inside
      && bracket.adjustedIndex > start
      && src.slice(start, bracket.adjustedIndex).trim().length > 0
    ) {
      best = bracket.adjustedIndex;
    }

    slides.push(src.slice(start, best).trim());
    start = best;
  }

  return slides.filter(Boolean).length > 0 ? slides : [src];
}

/**
 * Estimates how many wrapped lines a text needs given a char-per-line budget.
 * Used by Method 01 to decide whether a verse fits a slide without DOM.
 */
export function estimateLines(text, charsPerLine) {
  const words = normalizeVerseText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let lines = 1;
  let currentLength = 0;
  for (const word of words) {
    const needed = currentLength === 0 ? word.length : currentLength + 1 + word.length;
    if (needed > charsPerLine && currentLength > 0) {
      lines += 1;
      currentLength = word.length;
    } else {
      currentLength = needed;
    }
  }
  return lines;
}

/**
 * Method 01 — FreeShow-style geometry smart split.
 * Produces clean sub-verse units with the punctuation splitter, then greedily
 * packs them so the estimated line count never exceeds the slide's line budget.
 * Falls back to per-slide line packing when geometry is intentionally absent.
 */
export function splitByGeometry(text, { charsPerLine = 30, linesCount = 3, maxChars = 100 } = {}) {
  const src = normalizeVerseText(text);
  if (!src) return [''];

  const slideChars = Math.max(charsPerLine, Math.floor(charsPerLine * linesCount));
  const unitBudget = Math.min(Math.max(maxChars, charsPerLine), slideChars);
  const units = splitByNearestPunctuation(src, unitBudget, 0);

  const slides = [];
  let current = [];
  let currentLines = 0;
  let currentChars = 0;

  for (const unit of units) {
    const unitLines = estimateLines(unit, charsPerLine);
    const unitChars = unit.length;
    const lineBudgetExceeded = current.length > 0 && currentLines + unitLines > linesCount;
    const charBudgetExceeded = current.length > 0 && currentChars + 1 + unitChars > slideChars;
    if (lineBudgetExceeded || charBudgetExceeded) {
      slides.push(current.join(' '));
      current = [];
      currentLines = 0;
      currentChars = 0;
    }
    current.push(unit);
    currentLines += unitLines;
    currentChars += unitChars;
  }

  if (current.length > 0) slides.push(current.join(' '));
  return slides.length > 0 ? slides : [src];
}

/**
 * Legacy splitter — the original centre-cut implementation.
 * Preserved byte-for-byte so users who prefer the old behaviour keep it,
 * including its up-to-3-segment merge. Not recommended for new users.
 */
export function splitByLegacy(text, maxChars = 100, tolerance = 0) {
  const normalizedText = normalizeVerseText(text);
  if (!normalizedText) return [''];

  const segments = splitPlainTextLegacy(normalizedText, maxChars, tolerance, 3);
  return segments.length > 0 ? segments : [normalizedText];
}

function splitTextContentInHalf(text) {
  const center = Math.floor(text.length / 2);

  function findSplitIndex(chars) {
    const margin = center / 2;
    let index = -1;
    for (let i = center - margin; i <= center + margin; i++) {
      if (chars.includes(text[i])) index = i + 1;
    }
    return index;
  }

  function checkForSpaces(left = true) {
    let index = -1;
    for (let i = center; left ? i >= 0 : i < text.length; i += left ? -1 : 1) {
      if (text[i] === ' ') {
        index = i;
        break;
      }
    }
    return index;
  }

  const splitChars = ['.', ',', '!', '?'];
  let splitIndex = findSplitIndex(splitChars);

  if (splitIndex === -1) {
    const leftIndex = checkForSpaces(true);
    const rightIndex = checkForSpaces(false);

    if (leftIndex !== -1 && (rightIndex === -1 || center - leftIndex <= rightIndex - center)) splitIndex = leftIndex;
    else splitIndex = rightIndex;
  }

  if (splitIndex === -1) return [text];

  const firstHalf = text.slice(0, splitIndex).trim();
  const secondHalf = text.slice(splitIndex).trim();
  return [firstHalf, secondHalf];
}

function adjustSplitIndexForBracket(text, breakIndex) {
  if (!text) return breakIndex;
  const safeIndex = Math.max(0, Math.min(breakIndex, text.length));
  const before = text.slice(0, safeIndex);
  const after = text.slice(safeIndex);
  const lastOpen = before.lastIndexOf('[');
  if (lastOpen === -1) return safeIndex;
  if (before.indexOf(']', lastOpen) !== -1) return safeIndex;

  const closingIndex = after.indexOf(']');
  if (closingIndex === -1) return safeIndex;

  const bracketContent = (before.slice(lastOpen + 1) + after.slice(0, closingIndex)).replace(/[\[\]]/g, '').trim();
  if (!bracketContent.length) return safeIndex;

  const wordCount = bracketContent.split(/\s+/).filter(Boolean).length;
  if (!wordCount || wordCount >= 4) return safeIndex;

  let newIndex = lastOpen;
  while (newIndex > 0 && /\s/.test(before[newIndex - 1])) newIndex--;

  return Math.max(0, newIndex);
}

function moveDanglingBracketToNextLegacy(first, second) {
  const before = first;
  const after = second;
  const lastOpen = before.lastIndexOf('[');
  if (lastOpen === -1) return { first, second };
  if (before.indexOf(']', lastOpen) !== -1) return { first, second };

  const closingIndex = after.indexOf(']');
  if (closingIndex === -1) return { first, second };

  const bracketContent = (before.slice(lastOpen + 1) + after.slice(0, closingIndex)).replace(/[\[\]]/g, '').trim();
  if (!bracketContent.length) return { first, second };

  const wordCount = bracketContent.split(/\s+/).filter(Boolean).length;
  if (!wordCount || wordCount >= 4) return { first, second };

  const kept = first.slice(0, lastOpen).trimEnd();
  const movedPortion = first.slice(lastOpen);
  const combinedSecond = `${movedPortion}${second ? ` ${second.trimStart()}` : ''}`.trim();
  return { first: kept, second: combinedSecond };
}

function getSplitHalvesLegacy(text, maxChars, tolerance = 0) {
  if (tolerance === 0) {
    const halves = splitTextContentInHalf(text);
    if (halves.length >= 2) {
      const first = halves[0].trim();
      const second = halves[1].trim();
      if (first.length && second.length) return [first, second];
    }
  }

  if (text.length <= maxChars) return null;

  let pivot = -1;

  if (tolerance > 0) {
    const center = Math.floor(text.length / 2);
    const windowMin = Math.max(0, center - tolerance);
    const windowMax = Math.min(text.length - 1, center + tolerance);
    let bestPivot = -1;
    let bestDistance = Infinity;

    for (let i = windowMin; i <= windowMax; i++) {
      if (/[.,;:!?]/.test(text.charAt(i))) {
        const distance = Math.abs(i - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPivot = i + 1;
        }
      }
    }

    pivot = bestPivot;
  }

  if (pivot <= 0) {
    const capacity = maxChars;
    const slice = text.slice(0, capacity);
    const breakChars = [' ', '\n', '\t', '-', ','];
    let splitIndex = -1;

    breakChars.forEach((char) => {
      const idx = slice.lastIndexOf(char);
      if (idx > splitIndex) splitIndex = idx;
    });

    if (splitIndex === -1) {
      const nextBreak = text.slice(capacity).search(/[ \n\t\-,]/);
      if (nextBreak >= 0 && nextBreak <= 20) {
        splitIndex = capacity + nextBreak;
      }
    }

    pivot = splitIndex === -1 ? capacity : splitIndex + 1;
    pivot = adjustSplitIndexForBracket(text, pivot);
  }

  const first = text.slice(0, pivot).trim();
  const second = text.slice(pivot).trim();
  if (!first.length || !second.length) return null;
  return [first, second];
}

function rebalanceHalvesLegacy(first, second, maxChars, minSegmentLength) {
  if (second.length >= minSegmentLength || first.length <= minSegmentLength) {
    return { first, second };
  }

  const words = first.split(/\s+/).filter(Boolean);
  while (words.length > 1 && second.length < minSegmentLength) {
    const moved = words.pop();
    if (!moved) break;

    const candidateFirst = words.join(' ').trim();
    const candidateSecond = `${moved} ${second}`.trim();

    if (!candidateFirst.length || candidateFirst.length > maxChars || candidateSecond.length > maxChars) {
      words.push(moved);
      break;
    }

    first = candidateFirst;
    second = candidateSecond;
  }

  return { first, second };
}

function splitPlainTextLegacy(value, maxChars, tolerance = 0, maxSegments = 4) {
  const queue = [String(value || '').trim()];
  const segments = [];
  const proportion = Math.floor(maxChars * 0.3);
  const upperBound = Math.max(maxChars - 1, 0);
  const acceptLength = tolerance > 0 ? maxChars + tolerance : maxChars;
  let minSegmentLength = Math.max(10, proportion);
  if (upperBound > 0) minSegmentLength = Math.min(minSegmentLength, upperBound);
  if (minSegmentLength < 1) minSegmentLength = 1;

  while (queue.length) {
    const current = queue.shift()?.trim();
    if (!current) continue;

    if (current.length <= acceptLength) {
      segments.push(current);
      continue;
    }

    const halves = getSplitHalvesLegacy(current, maxChars, tolerance);
    if (!halves) {
      segments.push(current);
      continue;
    }

    let [first, second] = halves;
    ({ first, second } = moveDanglingBracketToNextLegacy(first, second));

    if (tolerance === 0) {
      const rebalanced = rebalanceHalvesLegacy(first, second, maxChars, minSegmentLength);
      first = rebalanced.first;
      second = rebalanced.second;
    }

    if (second.length < 1) {
      segments.push(first);
      continue;
    }

    if (second.length > 0) queue.unshift(second);
    if (first.length > 0) queue.unshift(first);
  }

  if (segments.length > 1 && segments[segments.length - 1].length < minSegmentLength) {
    const last = segments[segments.length - 1];
    const combined = `${segments[segments.length - 2]} ${last}`.trim();
    if (tolerance === 0 || combined.length <= acceptLength) {
      segments[segments.length - 2] = combined;
      segments.pop();
    }
  }

  while (segments.length > maxSegments) {
    let mergeIndex = 0;
    let smallestCombinedLength = Infinity;

    for (let i = 0; i < segments.length - 1; i++) {
      const combinedLength = `${segments[i]} ${segments[i + 1]}`.trim().length;
      if (combinedLength < smallestCombinedLength) {
        smallestCombinedLength = combinedLength;
        mergeIndex = i;
      }
    }

    segments.splice(mergeIndex, 2, `${segments[mergeIndex]} ${segments[mergeIndex + 1]}`.trim());
  }

  return balanceSegmentLengthsLegacy(segments, maxChars);
}

function balanceSegmentLengthsLegacy(segments, maxChars) {
  if (segments.length < 2) return segments;

  const balanced = [...segments];
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < balanced.length - 1; i++) {
      const current = balanced[i];
      const next = balanced[i + 1];
      const currentWords = current.split(/\s+/).filter(Boolean);
      const nextWords = next.split(/\s+/).filter(Boolean);
      if (currentWords.length < 2 || nextWords.length < 2) continue;

      const currentLength = current.length;
      const nextLength = next.length;
      const currentDiff = Math.abs(currentLength - nextLength);

      const moveLastToNext = {
        current: currentWords.slice(0, -1).join(' ').trim(),
        next: [currentWords[currentWords.length - 1], ...nextWords].join(' ').trim()
      };
      const moveFirstToCurrent = {
        current: [...currentWords, nextWords[0]].join(' ').trim(),
        next: nextWords.slice(1).join(' ').trim()
      };

      const candidates = [moveLastToNext, moveFirstToCurrent].filter(
        (candidate) => candidate.current.length > 0 && candidate.next.length > 0 && candidate.current.length <= maxChars && candidate.next.length <= maxChars
      );

      let bestCandidate = null;
      let bestDiff = currentDiff;

      for (const candidate of candidates) {
        const diff = Math.abs(candidate.current.length - candidate.next.length);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        balanced[i] = bestCandidate.current;
        balanced[i + 1] = bestCandidate.next;
        changed = true;
      }
    }
  }

  return balanced;
}

/**
 * Hybrid A — Legacy + Nearest-punctuation.
 * Legacy's "few, balanced slides" philosophy, but the cut points come from the
 * punctuation-aware scan (never mid-word). Produces at most 3 balanced slides
 * per verse, unlike the unbounded pure punctuation splitter.
 */
export function splitByLegacyPunctuation(text, maxChars = 100, tolerance = 0) {
  const src = normalizeVerseText(text);
  if (!src) return [''];

  const units = splitByNearestPunctuation(src, maxChars, tolerance);
  if (units.length <= 1) return units;
  if (units.length <= 3) {
    return balanceSegmentLengthsLegacy(units, maxChars);
  }

  const merged = mergeDownTo(units, 3);
  return balanceSegmentLengthsLegacy(merged, maxChars);
}

/**
 * Hybrid B — Geometry + Nearest-punctuation.
 * Geometry's "fit the slide line budget" packing, but the packing units are the
 * punctuation scans (never mid-word). Relaxes geometry's hard character cap so
 * punctuation-clean units are kept together even when slightly wider than the
 * character budget, then packs by estimated lines per slide.
 */
export function splitByGeometryPunctuation(text, { charsPerLine = 30, linesCount = 3, maxChars = 100 } = {}) {
  const src = normalizeVerseText(text);
  if (!src) return [''];

  const unitBudget = Math.max(charsPerLine, Math.min(maxChars, Math.max(charsPerLine * linesCount, maxChars)));
  const units = splitByNearestPunctuation(src, unitBudget, 0);

  const slides = [];
  let current = [];
  let currentLines = 0;

  for (const unit of units) {
    const unitLines = estimateLines(unit, charsPerLine);
    const lineBudgetExceeded = current.length > 0 && currentLines + unitLines > linesCount;
    if (lineBudgetExceeded) {
      slides.push(current.join(' '));
      current = [];
      currentLines = 0;
    }
    current.push(unit);
    currentLines += unitLines;
  }

  if (current.length > 0) slides.push(current.join(' '));
  return slides.length > 0 ? slides : [src];
}

/**
 * "Saying" boundary — when a long verse is being broken across slides, prefer to
 * end the current slide at the word "saying" (with whatever trailing punctuation
 * appears in the source, e.g. "the Lord, saying,"). Biblical verses frequently
 * use "saying," to introduce quoted speech, so ending a slide on "saying,"
 * reads naturally and lets the next slide begin with the spoken words.
 *
 * Only applies when the source actually needs splitting (the caller passes in
 * the full original text alongside the slides it produced). If the verse fits
 * on a single slide, the slides array is returned unchanged so we don't
 * introduce an artificial break just because the word "saying" is present.
 */
function splitOnSayingBoundary(slides, text) {
  if (!Array.isArray(slides) || slides.length <= 1) return slides;
  if (!text || !/\bsaying\b/i.test(text)) return slides;

  const result = [];
  for (const slide of slides) {
    if (!slide) {
      result.push(slide);
      continue;
    }

    // Slides carrying inline markup (tag-safe mode) are cut at the same
    // "saying" boundary but through the tokenizer, so tags stay balanced.
    if (HAS_TAG_RE.test(slide)) {
      const cut = splitHtmlSlideOnSaying(slide);
      if (cut) result.push(cut[0], cut[1]);
      else result.push(slide);
      continue;
    }

    // Find the first occurrence of "saying" that sits BEFORE the slide's tail
    // so we can split the slide around it. We allow trailing punctuation
    // (comma/period) and a following space so "saying," stays with the head.
    const sayingRegex = /\bsaying([,.;:!?]*)(\s+)/i;
    const match = sayingRegex.exec(slide);
    if (!match) {
      result.push(slide);
      continue;
    }

    const splitAt = match.index + match[0].length;
    const head = slide.slice(0, splitAt).trimEnd();
    const tail = slide.slice(splitAt).trimStart();

    if (!head || !tail) {
      result.push(slide);
      continue;
    }

    result.push(head, tail);
  }

  return result;
}

function mergeDownTo(units, target) {
  const segs = [...units];
  while (segs.length > target) {
    let mergeIndex = 0;
    let smallestCombinedLength = Infinity;

    for (let i = 0; i < segs.length - 1; i++) {
      const combinedLength = `${segs[i]} ${segs[i + 1]}`.trim().length;
      if (combinedLength < smallestCombinedLength) {
        smallestCombinedLength = combinedLength;
        mergeIndex = i;
      }
    }

    segs.splice(mergeIndex, 2, `${segs[mergeIndex]} ${segs[mergeIndex + 1]}`.trim());
  }

  return segs;
}

/**
 * Resolves an output geometry from output settings, FreeShow style.
 *
 * The split target is the *lyric band*, not the whole viewport: a slide is a
 * display slide capped at maxLines (default 3), consistent with the app's
 * output autosizer. charsPerLine ~= fontSize * 0.5; linesCount = band height /
 * line height, capped to the configured max-lines so long verses actually split.
 */
export function resolveBibleGeometry(outputSettings = {}) {
  const width = outputSettings.primaryViewportWidth || 1920;
  const height = outputSettings.primaryViewportHeight || 1080;
  const fontSize = outputSettings.fontSize || 72;
  const bottomMargin = outputSettings.bottomMargin || 0;
  const verticalPadding = (outputSettings.backgroundBandVerticalPadding || 20) * 2;
  const lineHeight = fontSize * 1.2;
  const maxLinesEnabled = Boolean(outputSettings.maxLinesEnabled);
  const maxLines = Number.isFinite(Number(outputSettings.maxLines)) && Number(outputSettings.maxLines) > 0
    ? Number(outputSettings.maxLines)
    : null;

  const charsPerLine = Math.max(10, Math.round(fontSize * 0.5));

  // Available slide height: the lyric area on screen (excludes universal
  // bottom margins). Cap to the configured maxLines so splitting is aggressive.
  const availableHeight = Math.max(0, height - bottomMargin - verticalPadding);
  const heightLines = Math.max(1, Math.floor(availableHeight / lineHeight));

  // A slide is at most maxLines tall when autosizing is enabled; otherwise
  // FreeShow's default slide budget is a handful of lines (3) per slide.
  const explicitLines = maxLinesEnabled && maxLines;
  const linesCount = explicitLines
    ? Math.min(Math.max(1, maxLines), Math.max(heightLines, 1))
    : Math.min(heightLines, 3);

  // Safety margin for the ±1 line estimation drift FreeShow warns about.
  // Only discount the height-derived guess, never an explicitly configured
  // maxLines — the output autosizer fits exactly maxLines lines.
  const safeLinesCount = explicitLines ? linesCount : Math.max(1, linesCount - 1);
  return { charsPerLine, linesCount: safeLinesCount };
}

/**
 * Dispatcher — the single entry point used by preview and control panel.
 */
export function splitBibleTextIntoSlides(text, {
  splitLongVerses = false,
  method = BIBLE_SPLIT_METHODS.NEAREST_PUNCTUATION,
  maxChars = 100,
  tolerance = 0,
  geometry = null,
} = {}) {
  const normalized = normalizeVerseText(text);
  if (!splitLongVerses) return [normalized];

  let slides;
  if (method === BIBLE_SPLIT_METHODS.LEGACY) {
    slides = splitByLegacy(normalized, maxChars, tolerance);
  } else if (method === BIBLE_SPLIT_METHODS.LEGACY_PUNCTUATION) {
    slides = splitByLegacyPunctuation(normalized, maxChars, tolerance);
  } else if (method === BIBLE_SPLIT_METHODS.GEOMETRY_PUNCTUATION && geometry) {
    slides = splitByGeometryPunctuation(normalized, { ...geometry, maxChars });
  } else if (method === BIBLE_SPLIT_METHODS.GEOMETRY && geometry) {
    slides = splitByGeometry(normalized, { ...geometry, maxChars });
  } else if (method === BIBLE_SPLIT_METHODS.TAG_SAFE) {
    slides = splitByTagSafe(normalized, maxChars, tolerance);
  } else {
    slides = splitByNearestPunctuation(normalized, maxChars, tolerance);
  }

  return splitOnSayingBoundary(slides, normalized);
}

/**
 * Method 03 — Tag-safe HTML splitter (missing-feature #13).
 *
 * Splits long verses that carry inline markup — Words-of-Christ
 * `<span class="wj">`, italics, nested tags — without breaking the markup:
 * open tags are auto-closed at the end of a slide and auto-reopened at the
 * start of the next one, so every slide is valid, styled HTML.
 *
 * Pure string/regex tokenizing with no browser DOM APIs anywhere (keeps the fast
 * fast-xml-parser engine, worker search, and IndexedDB path untouched) and
 * no new dependencies. Break budgets count *visible* characters only; tags
 * are zero-width. Input without markup delegates to
 * splitByNearestPunctuation, so plain-text output is byte-for-byte identical
 * to the default method.
 */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const TAG_TOKEN_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*?>/g;
const HAS_TAG_RE = /<[a-zA-Z/!][^>]*>/;

/**
 * Tokenizes an HTML string into `{ type: 'text', value }` and
 * `{ type: 'tag', html, name, closing, selfClosing, comment }` tokens.
 * A `<` that does not start a tag (e.g. "a < b") stays plain text.
 */
export function tokenizeHtml(html) {
  const src = String(html ?? '');
  const tokens = [];
  TAG_TOKEN_RE.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = TAG_TOKEN_RE.exec(src)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', value: src.slice(last, m.index) });
    tokens.push(parseTagToken(m[0]));
    last = m.index + m[0].length;
  }
  if (last < src.length) tokens.push({ type: 'text', value: src.slice(last) });
  return tokens.filter((t) => t.type !== 'text' || t.value.length > 0);
}

function parseTagToken(raw) {
  if (raw.startsWith('<!--') || /^<!/i.test(raw)) {
    return { type: 'tag', html: raw, name: '!', closing: false, selfClosing: true, comment: true };
  }
  const nameMatch = /^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw);
  const name = (nameMatch ? nameMatch[1] : 'span').toLowerCase();
  const closing = /^<\s*\//.test(raw);
  const selfClosing = /\/\s*>$/.test(raw) || VOID_ELEMENTS.has(name);
  return { type: 'tag', html: raw, name, closing, selfClosing, comment: false };
}

function tokensVisibleText(tokens) {
  let out = '';
  for (const t of tokens) if (t.type === 'text') out += t.value;
  return out;
}

/** Serialized form of a token: raw markup for tags, raw text for text. */
function tokenHtml(t) {
  return t.type === 'tag' ? t.html : t.value;
}

function hasVisibleText(tokens) {
  return tokens.some((t) => t.type === 'text' && /[^\s]/.test(t.value));
}

/** Applies one tag token to an open-tag stack ({ name, html } entries). */
function applyTagToStack(stack, tok) {
  if (!tok || tok.type !== 'tag' || tok.selfClosing || tok.comment) return;
  if (tok.closing) {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].name === tok.name) {
        stack.splice(i, 1);
        break;
      }
    }
    return;
  }
  stack.push({ name: tok.name, html: tok.html });
}

function stackAfterTokens(openBefore, tokens) {
  const stack = (openBefore || []).map((t) => ({ name: t.name, html: t.html }));
  for (const tok of tokens) {
    if (tok.type === 'tag') applyTagToStack(stack, tok);
  }
  return stack;
}

/**
 * Renders a slide's tokens as balanced HTML: reopens tags left open by the
 * previous slide, then auto-closes anything still open at the slide end.
 */
function renderSlideTokens(tokens, openBefore) {
  const before = (openBefore || []).map((t) => ({ name: t.name, html: t.html }));
  const reopen = before.map((t) => t.html).join('');
  const after = stackAfterTokens(before, tokens);
  const close = after.slice().reverse().map((t) => `</${t.name}>`).join('');
  return reopen + tokens.map(tokenHtml).join('') + close;
}

/** Trims boundary whitespace of a slide's token list (mirrors slide trim). */
function trimSlideTokens(tokens) {
  const out = tokens.filter((t) => t.type !== 'text' || t.value.length > 0);
  let start = 0;
  while (start < out.length && out[start].type === 'text') {
    const v = out[start].value.replace(/^\s+/, '');
    if (v.length > 0) {
      out[start] = { type: 'text', value: v };
      break;
    }
    start++;
  }
  const head = out.slice(start);
  let end = head.length - 1;
  while (end >= 0 && head[end].type === 'text') {
    const v = head[end].value.replace(/\s+$/, '');
    if (v.length > 0) {
      head[end] = { type: 'text', value: v };
      break;
    }
    end--;
  }
  return head.slice(0, end + 1);
}

/**
 * Break-offset finder mirroring splitByNearestPunctuation's scan exactly,
 * but returning raw end-exclusive offsets instead of trimmed strings so the
 * HTML path can slice the token stream at identical points.
 */
function findPunctuationBreaks(src, maxChars = 100, tolerance = 0) {
  const out = [];
  if (!src) return out;
  const accept = tolerance > 0 ? maxChars + tolerance : maxChars;
  if (src.length <= accept) return out;

  let start = 0;
  const len = src.length;

  while (start < len) {
    if (len - start <= accept) break;

    const windowMin = Math.max(start, start + maxChars - Math.max(maxChars, 1));
    const windowEnd = Math.min(len - 1, start + maxChars + tolerance);
    let best = -1;
    let bestPriority = -1;

    for (let i = windowEnd; i >= windowMin; i--) {
      const c = src[i];
      if (c === '.' || c === '!' || c === '?') {
        best = i + 1;
        bestPriority = 3;
        break;
      }
      const p = c === ';' || c === ':' || c === '—' || c === '–'
        ? 2
        : c === ',' ? 1
          : (c === ' ' && bestPriority < 0) ? 0 : -1;
      if (p > bestPriority) {
        bestPriority = p;
        best = i + 1;
      }
    }

    if (best < 0) {
      for (let i = windowEnd; i >= start; i--) {
        if (src[i] === ' ') {
          best = i + 1;
          break;
        }
      }
    }

    if (best < 0) {
      best = Math.min(windowEnd + 1, len);
    }

    if (best <= start) {
      best = Math.min(windowEnd + 1, len);
    }

    out.push(best);
    start = best;
  }

  return out;
}

/**
 * Partitions a token stream into per-slide raw token arrays at visible-text
 * offsets. Tags sit between visible characters: a tag at position p belongs
 * to the slide whose interval satisfies s <= p < e (a tag exactly on a break
 * opens the next slide, never dangles at the previous slide's end).
 */
function rawSlicesByBreaks(tokens, breaks) {
  const sorted = [...breaks].sort((a, b) => a - b);
  const slices = [];
  let current = [];
  let pos = 0;
  let bi = 0;

  const pushCurrent = () => {
    slices.push(current);
    current = [];
  };

  for (const tok of tokens) {
    if (tok.type !== 'text') {
      while (bi < sorted.length && pos >= sorted[bi]) {
        pushCurrent();
        bi++;
      }
      current.push(tok);
      continue;
    }
    let local = 0;
    while (local < tok.value.length) {
      const nextBreak = bi < sorted.length ? sorted[bi] : Infinity;
      if (pos >= nextBreak) {
        pushCurrent();
        bi++;
        continue;
      }
      const take = Math.min(tok.value.length - local, nextBreak - pos);
      current.push({ type: 'text', value: tok.value.slice(local, local + take) });
      local += take;
      pos += take;
      if (bi < sorted.length && pos >= nextBreak) {
        pushCurrent();
        bi++;
      }
    }
  }
  pushCurrent();
  return slices;
}

/** Splits a token list in two at a visible-text offset (tag-stack safe). */
function splitTokensAtVisibleOffset(tokens, offset) {
  const head = [];
  const tail = [];
  let pos = 0;
  let cut = false;
  for (const tok of tokens) {
    if (cut) {
      tail.push(tok);
      continue;
    }
    if (tok.type !== 'text') {
      (pos < offset ? head : tail).push(tok);
      continue;
    }
    if (pos + tok.value.length <= offset) {
      head.push(tok);
      pos += tok.value.length;
      continue;
    }
    if (pos >= offset) {
      tail.push(tok);
      pos += tok.value.length;
      continue;
    }
    const local = offset - pos;
    const h = tok.value.slice(0, local);
    const t = tok.value.slice(local);
    if (h.length > 0) head.push({ type: 'text', value: h });
    if (t.length > 0) tail.push({ type: 'text', value: t });
    pos += tok.value.length;
    cut = true;
  }
  return [head, tail];
}

/**
 * Splits HTML text into slides with balanced markup per slide.
 * No tags → delegates to splitByNearestPunctuation (identical output).
 */
export function splitHtmlText(html, maxChars = 100, tolerance = 0) {
  const src = normalizeVerseText(html);
  if (!src) return [''];

  const tokens = tokenizeHtml(src);
  if (!tokens.some((t) => t.type === 'tag')) {
    return splitByNearestPunctuation(src, maxChars, tolerance);
  }

  const visible = tokensVisibleText(tokens);
  const accept = tolerance > 0 ? maxChars + tolerance : maxChars;
  if (visible.length <= accept) return [src];

  const breaks = findPunctuationBreaks(visible, maxChars, tolerance);
  if (breaks.length === 0) return [src];

  const raw = rawSlicesByBreaks(tokens, breaks);
  const slides = [];
  let stack = [];
  for (const slice of raw) {
    const openBefore = stack.map((t) => ({ name: t.name, html: t.html }));
    stack = stackAfterTokens(stack, slice);
    const trimmed = trimSlideTokens(slice);
    if (!hasVisibleText(trimmed)) continue;
    slides.push(renderSlideTokens(trimmed, openBefore));
  }

  return slides.length > 0 ? slides : [src];
}

/**
 * Tag-safe splitter — the bibleSplitter-suite entry point for METHOD
 * `tag-safe`, mirroring the splitBy* sibling signatures.
 */
export function splitByTagSafe(text, maxChars = 100, tolerance = 0) {
  const src = normalizeVerseText(text);
  if (!src) return [''];
  if (!HAS_TAG_RE.test(src)) {
    return splitByNearestPunctuation(src, maxChars, tolerance);
  }
  return splitHtmlText(src, maxChars, tolerance);
}

/**
 * Tag-aware "saying" boundary cut for a single HTML slide. Returns
 * [headHtml, tailHtml] with balanced markup, or null when no cut applies.
 */
function splitHtmlSlideOnSaying(slideHtml) {
  const tokens = tokenizeHtml(slideHtml);
  const visible = tokensVisibleText(tokens);
  const sayingRegex = /\bsaying([,.;:!?]*)(\s+)/i;
  const match = sayingRegex.exec(visible);
  if (!match) return null;

  const cutAt = match.index + match[0].length;
  if (!visible.slice(0, cutAt).trim() || !visible.slice(cutAt).trim()) return null;

  const [headTokens, tailTokens] = splitTokensAtVisibleOffset(tokens, cutAt);
  const headTrimmed = trimSlideTokens(headTokens);
  const tailTrimmed = trimSlideTokens(tailTokens);
  if (!hasVisibleText(headTrimmed) || !hasVisibleText(tailTrimmed)) return null;

  const headHtml = renderSlideTokens(headTrimmed, []);
  const tailHtml = renderSlideTokens(tailTrimmed, stackAfterTokens([], headTrimmed));
  return [headHtml, tailHtml];
}