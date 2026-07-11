export function createNormalGroup(lines = [], idPrefix = 'normal_group', originalIndex = 0) {
  const normalizedLines = Array.isArray(lines)
    ? lines.filter((line) => typeof line === 'string' && line.trim().length > 0)
    : [];

  return {
    type: 'normal-group',
    id: `${idPrefix}_${originalIndex}`,
    lines: normalizedLines,
    line1: normalizedLines[0] || '',
    line2: normalizedLines[1] || '',
    displayText: normalizedLines.join('\n'),
    searchText: normalizedLines.join(' '),
    originalIndex,
  };
}
