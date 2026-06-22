import { parseLrcContent } from '../../shared/lyricsParsing.js';
import { createLogger } from './logger.js';

const log = createLogger('ParseLrc');

/**
 * Parse .lrc file into { rawText, processedLines }
 * - processedLines: array of lyric strings ordered by time
 * - rawText: strictly the displayed text, no timestamps (for editing)
 * @param {File} file
 * @param {object} options - Parsing options including enableSplitting
 */
export const parseLrc = (file, options = {}) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const raw = event.target.result || '';
      log.debug('Parsing LRC file', { size: raw.length });
      const result = parseLrcContent(raw, options);
      log.debug('LRC parse complete', { lineCount: result?.processedLines?.length ?? 0 });
      resolve(result);
    } catch (error) {
      log.error('LRC parse failed', error);
      reject(error);
    }
  };
  reader.onerror = (error) => {
    log.error('FileReader error', error);
    reject(error);
  };
  reader.readAsText(file);
});

export function parseLrcText(raw, options = {}) {
  log.debug('Parsing LRC text', { length: (raw || '').length });
  return parseLrcContent(raw || '', options);
}
