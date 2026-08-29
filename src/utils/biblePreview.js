import { orderBibleMetadata, getBibleVerseText } from 'shared/bible';
import { createLogger } from './logger.js';

const log = createLogger('biblePreview');

/**
 * Build an all-translations preview list for a verse reference.
 * Loads every bible (via loadAllBibles) when metadata lists more than are
 * resident, then extracts the verse text from each translation ordered by
 * orderBibleMetadata (default translation first).
 */
export async function buildAllVersionsPreview({
  reference,
  verses,
  bibleMetadata,
  getBibles,
  loadAllBibles,
  defaultBibleId,
}) {
  const current = getBibles();
  if (Object.keys(bibleMetadata).length > Object.keys(current).length) {
    try {
      await loadAllBibles();
    } catch (e) {
      log.warn('loadAllBibles failed during preview', { error: e.message });
    }
  }
  const fresh = getBibles();

  const all = Object.keys(bibleMetadata)
    .map((id) => {
      const bible = fresh[id] || current[id];
      if (!bible) return null;
      const text = getBibleVerseText(bible, reference, [verses]);
      if (!text) return null;
      return { bibleId: id, bibleName: bibleMetadata[id]?.name || bible.name, text };
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

  return ordered.length > 0 ? ordered : all;
}
