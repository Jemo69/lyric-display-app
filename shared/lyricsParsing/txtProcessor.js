import { preprocessText, splitLongLine } from './lineSplitting.js';
import { stripTimestampPatterns } from './textCleanup.js';
import { extractStructureTags } from './structureTags.js';
import { expandRepeatableSectionReferences } from './repeatableSections.js';
import { isTranslationLine } from './translation.js';
import { flattenClusters, mergeAcrossBlankLines } from './grouping.js';

/**
 * Split raw text into clusters separated by blank lines and convert into processed lyric lines.
 * Enhanced with intelligent line splitting.
 * @param {string} rawText
 * @param {object} options - { enableSplitting: boolean, splitConfig: object }
 * @returns {Array<string | object>}
 */
export function processRawTextToLines(rawText = '', options = {}) {
  const { enableSplitting = true, splitConfig = {} } = options;

  let cleaned = preprocessText(rawText);
  cleaned = stripTimestampPatterns(cleaned);
  cleaned = extractStructureTags(cleaned);
  cleaned = expandRepeatableSectionReferences(cleaned);
  const allLines = cleaned.split(/\r?\n/);
  const preClusters = [];
  let currentCluster = [];

  for (let i = 0; i < allLines.length; i += 1) {
    const line = allLines[i].trim();

    if (line.length > 0) {
      currentCluster.push(line);
    } else if (currentCluster.length > 0) {
      preClusters.push([...currentCluster]);
      currentCluster = [];
    }
  }

  if (currentCluster.length > 0) {
    preClusters.push(currentCluster);
  }

  const finalClusters = [];

  for (const cluster of preClusters) {
    const processedCluster = [];

    for (let i = 0; i < cluster.length; i += 1) {
      const line = cluster[i];

      if (isTranslationLine(line)) {
        processedCluster.push(line);
        continue;
      }

      if (enableSplitting && line.length > (splitConfig.MAX_LENGTH || 70)) {
        const segments = splitLongLine(line, splitConfig);
        for (let j = 0; j < segments.length - 1; j += 1) {
          processedCluster.push(segments[j]);
        }
        processedCluster.push(segments[segments.length - 1]);
      } else {
        processedCluster.push(line);
      }
    }

    const indexedCluster = processedCluster.map((line, idx) => ({
      line,
      originalIndex: idx,
    }));

    finalClusters.push(indexedCluster);
  }

  const clusteredResult = flattenClusters(finalClusters);
  return mergeAcrossBlankLines(clusteredResult);
}
