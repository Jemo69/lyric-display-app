export const BRACKET_PAIRS = [
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
  ['<', '>'],
];

// Default config values - can be overridden by user preferences
export const NORMAL_GROUP_CONFIG = {
  ENABLED: true,
  MAX_LINE_LENGTH: 45,
  CROSS_BLANK_LINE_GROUPING: true,
  MAX_LINES_PER_GROUP: 2,
};

export const STRUCTURE_TAGS_CONFIG = {
  ENABLED: true,
  MODE: 'isolate',
};

// Common structure tag patterns
export const STRUCTURE_TAG_PATTERNS = [
  // [Verse], (Verse), {Verse}, <Verse>, [Verse 1:], [Chorus], [Chorus: Artist Name], etc.
  // Matches section markers with optional numbers and optional artist/descriptor after colon
  /^\s*[\[\(\{<](Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\s+\d+)?(?:\s*:\s*[^\]\)\}>]*)?\s*[\]\)\}>]\s*/i,

  // Verse 1:, Chorus:, etc. (WITH colon at start of line)
  /^\s*(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\s+\d+)?\s*:\s*/i,

  // Verse 1, Chorus, Bridge, etc. (WITHOUT colon, standalone on line)
  /^\s*(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\s+\d+)?\s*$/i,
];

export const TIME_TAG_REGEX = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\]/g;
export const META_TAG_REGEX = /^\s*\[(ti|ar|al|by|offset|length|au|lr|re|tool|ve|#):.*\]\s*$/i;

export const TIMESTAMP_LIKE_PATTERNS = [
  /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g,
  /\(\d{1,2}:\d{2}(?:\.\d{1,3})?\)/g,
  /^\d{1,2}:\d{2}\s+/gm,
];
