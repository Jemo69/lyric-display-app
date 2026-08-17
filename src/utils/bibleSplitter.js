export const BIBLE_SPLIT_METHODS = {
  LEGACY: 'legacy',
  NEAREST_PUNCTUATION: 'nearest-punctuation',
  GEOMETRY: 'geometry',
  LEGACY_PUNCTUATION: 'legacy-punctuation',
  GEOMETRY_PUNCTUATION: 'geometry-punctuation',
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
];

export function normalizeVerseText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
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

  const unitBudget = Math.max(charsPerLine, maxChars);
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

  // Edge case: a single unbreakable unit wider than the whole line budget
  // (e.g. an oversized long word) still overflows its slide — it goes on its
  // own slide rather than being split mid-word, which is the correct fallback.
  if (current.length > 0) slides.push(current.join(' '));
  return slides.length > 0 ? slides : [src];
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

  if (method === BIBLE_SPLIT_METHODS.LEGACY) {
    return splitByLegacy(normalized, maxChars, tolerance);
  }

  if (method === BIBLE_SPLIT_METHODS.LEGACY_PUNCTUATION) {
    return splitByLegacyPunctuation(normalized, maxChars, tolerance);
  }

  if (method === BIBLE_SPLIT_METHODS.GEOMETRY_PUNCTUATION) {
    if (!geometry) {
      console.warn('[bibleSplitter] GEOMETRY_PUNCTUATION requested without geometry; falling back to nearest-punctuation');
    } else {
      return splitByGeometryPunctuation(normalized, { ...geometry, maxChars });
    }
  }

  if (method === BIBLE_SPLIT_METHODS.GEOMETRY && geometry) {
    return splitByGeometry(normalized, { ...geometry, maxChars });
  }

  return splitByNearestPunctuation(normalized, maxChars, tolerance);
}