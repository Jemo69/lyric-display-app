import { getSectionLabelFromLine, isStructureTag } from './structureTags.js';

/**
 * Derive section metadata from processed lyric lines without altering the lines.
 * @param {Array<string|object>} processedLines
 * @returns {{ sections: Array<{id: string, label: string, startLine: number, endLine: number|null}>, lineToSection: Record<number, string> }}
 */
export function deriveSectionsFromProcessedLines(processedLines = []) {
  const sections = [];
  const lineToSection = {};

  let currentSection = null;

  for (let i = 0; i < processedLines.length; i += 1) {
    const item = processedLines[i];
    const isTag = typeof item === 'string' && isStructureTag(item);

    if (isTag) {
      const label = getSectionLabelFromLine(item);
      let startLine = i + 1;

      while (
        startLine < processedLines.length &&
        typeof processedLines[startLine] === 'string' &&
        isStructureTag(processedLines[startLine])
      ) {
        startLine += 1;
      }

      if (startLine >= processedLines.length) {
        startLine = i;
      }

      const id = `section_${sections.length}_${i}`;

      currentSection = {
        id,
        label,
        startLine,
        endLine: startLine >= 0 ? startLine : null,
      };
      sections.push(currentSection);

      if (startLine >= 0) {
        lineToSection[startLine] = id;
      }
      continue;
    }

    if (currentSection) {
      currentSection.endLine = i;
      lineToSection[i] = currentSection.id;
    }
  }

  sections.forEach((section) => {
    if (section.endLine == null || section.endLine < section.startLine) {
      section.endLine = section.startLine;
    }
  });

  return { sections, lineToSection };
}
