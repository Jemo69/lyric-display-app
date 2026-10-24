import { orderBibleMetadata, getBibleVerseText } from 'shared/bible';
import { createLogger } from './logger.js';

const log = createLogger('biblePreview');

/**
 * Character budget for one translation's verse text inside the
 * preview-all-translations tray. Imported XML files occasionally carry a
 * copy-pasted duplicate block inside a single verse; rendering that blob in
 * full stalls the panel, so the previewer cuts every entry off here.
 */
export const BIBLE_PREVIEW_TEXT_BUDGET = 280;

// Display speed: cap preview tray DOM (was unbounded when 10+ translations installed).
export const BIBLE_PREVIEW_LIMIT = 6;

const ELLIPSIS = '…';

/**
 * Cut a verse text down to a character budget for preview display.
 * Prefers a word boundary near the cut so the snippet stays readable; a hard
 * cut is used when no whitespace is close enough (e.g. one giant token).
 * Pure function: no DOM, no store access.
 *
 * @param {string|null|undefined} text
 * @param {number} [maxChars]
 * @returns {string} truncated text ending in '…' when a cut happened
 */
export function truncatePreviewText(text, maxChars = BIBLE_PREVIEW_TEXT_BUDGET) {
  const value = String(text ?? '').trim();
  const budget = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : BIBLE_PREVIEW_TEXT_BUDGET;
  if (value.length <= budget) return value;

  const clipped = value.slice(0, budget);
  const lastSpace = clipped.lastIndexOf(' ');
  // Only retreat to the word boundary when it keeps most of the budget;
  // otherwise the hard cut avoids dropping a huge run of the snippet.
  const base = lastSpace > budget * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${base.replace(/[\s,.;:—–-]+$/, '')}${ELLIPSIS}`;
}

/**
 * Build an all-translations preview list for a verse reference.
 * Loads every bible (via loadAllBibles) when metadata lists more than are
 * resident, then extracts the verse text from each translation ordered by
 * orderBibleMetadata (default translation first).
 *
 * Verse text is cut to BIBLE_PREVIEW_TEXT_BUDGET unless `truncate: false`
 * (the Settings > Bible toggle) asks for the full text.
 */
export async function buildAllVersionsPreview({
  reference,
  verses,
  bibleMetadata,
  getBibles,
  loadAllBibles,
  ensureBiblesLoaded,
  defaultBibleId,
  truncate = true,
}) {
  const current = getBibles();
  // Group: only ensure the capped preview set is resident (was loadAllBibles).
  const orderedIds = orderBibleMetadata(bibleMetadata, defaultBibleId).map((m) => m.id).slice(0, BIBLE_PREVIEW_LIMIT);
  const missing = orderedIds.filter((id) => !current[id]);
  if (missing.length > 0) {
    try {
      if (ensureBiblesLoaded) await ensureBiblesLoaded(missing);
      else await loadAllBibles();
    } catch (e) {
      log.warn('preview bible ensure failed', { error: e.message });
    }
  }
  const fresh = getBibles();

  const all = Object.keys(bibleMetadata)
    .map((id) => {
      const bible = fresh[id] || current[id];
      if (!bible) return null;
      const rawText = getBibleVerseText(bible, reference, [verses]);
      if (!rawText) return null;
      const text = truncate ? truncatePreviewText(rawText) : rawText.trim();
      return {
        bibleId: id,
        bibleName: bibleMetadata[id]?.name || bible.name,
        text,
        // Compare content, not length: a hard cut can return the same length
        // as its input (280 chars + '…' over a 281-char input) while still
        // replacing a character, so a length check would miss the flag.
        truncated: truncate && text !== rawText.trim(),
      };
    })
    .filter(Boolean);

  const ordered = orderBibleMetadata(
    all.reduce((acc, item) => {
      acc[item.bibleId] = { id: item.bibleId, name: item.bibleName };
      return acc;
    }, {}),
    defaultBibleId
  )
    .map((meta) => all.find((a) => a.bibleId === meta.id))
    .filter(Boolean);

  const capped = (ordered.length > 0 ? ordered : all).slice(0, BIBLE_PREVIEW_LIMIT);
  return capped;
}
