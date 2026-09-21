/**
 * ChordPro parsing, transposition, and CCLI usage-report helpers.
 *
 * Dep-free ESM so it can be shared between the Electron main process
 * (`main/`), the Vite renderer (`src/` via the `shared` alias), and the
 * Express/Socket.IO backend (`server/`).
 *
 * Supported ChordPro subset:
 * - Inline chords: `[Am]Amazing [G]grace`
 * - Chords-over-lyrics: a chord-only line directly above a lyric line
 * - Directives: `{title:}`, `{artist:}`, `{key:}`, `{capo:}`, `{tempo:}`,
 *   `{ccli:}`, `{comment:}` / `{c:}`, `{start_of_chorus}` / `{soc}`,
 *   `{start_of_verse: Verse 1}` / `{sov}`, `{start_of_tab}` / `{sot}`
 *   (plus matching `{end_of_*}` / `{eo*}` closers, `{define:}` ignored)
 * - Bracket section headers that are not chords: `[Verse 1]`
 *
 * ToS note: this module only parses local song text. It never scrapes,
 * never phones home, and never handles third-party credentials.
 */

const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_INDEX = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  'E#': 5, F: 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
};

// Root + quality/extensions + optional slash bass. Strict on purpose so that
// lyric bracket text like "[Chorus]" or "[Amazing grace]" never parses.
const CHORD_RE = /^[A-G](?:#|b)?(?:m(?!aj)|maj|min|dim|aug|sus|add|M)?\d*(?:[#b]\d+|sus\d*|add\d+|no\d+|M\d+|5|6|9|11|13)*(?:\([^)]*\))?(?:\/[A-G](?:#|b)?)?$/;

const DIRECTIVE_RE = /^\s*\{([^}:]+?)(?::\s*(.*?))?\}\s*$/;
const BRACKET_SECTION_RE = /^\s*\[([^\][\n]+)\]\s*$/;
const INLINE_CHORD_RE = /\[([^\][\n]*)\]/g;

/** @returns {boolean} true when the token looks like a musical chord symbol. */
export function isChordToken(token) {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return CHORD_RE.test(trimmed);
}

/** @returns {boolean} true when every whitespace-separated token is a chord. */
export function isChordLine(line) {
  if (!line || typeof line !== 'string') return false;
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every(isChordToken);
}

function splitInlineChords(line) {
  const segments = [];
  let lastIndex = 0;
  let match;
  INLINE_CHORD_RE.lastIndex = 0;
  while ((match = INLINE_CHORD_RE.exec(line)) !== null) {
    const candidate = match[1].trim();
    if (!isChordToken(candidate)) continue; // keep non-chord brackets literal
    if (match.index > lastIndex) {
      segments.push({ chord: null, text: line.slice(lastIndex, match.index) });
    }
    segments.push({ chord: candidate, text: '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) {
    segments.push({ chord: null, text: line.slice(lastIndex) });
  }
  // Merge chord-only segments forward into the following text segment so each
  // segment reads as { chord, text } where the chord sounds over `text`.
  const merged = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (seg.chord && !seg.text && prev && prev.chord && !prev.text) {
      // Two adjacent chords with no lyric between: keep both (e.g. turnaround).
      merged.push(seg);
    } else if (seg.chord && !seg.text) {
      merged.push(seg);
    } else if (!seg.chord && prev && prev.chord && prev.text === '') {
      prev.text = seg.text;
    } else {
      merged.push(seg);
    }
  }
  return merged.filter((s) => s.chord || (s.text && s.text.length > 0));
}

function chordLineToSegments(chordLine, lyricLine) {
  // Map each chord token at its character offset to the lyric slice that
  // starts there and runs until the next chord offset.
  const positions = [];
  const tokenRe = /\S+/g;
  let m;
  while ((m = tokenRe.exec(chordLine)) !== null) {
    positions.push({ chord: m[0], at: m.index });
  }
  const lyrics = lyricLine ?? '';
  const segments = [];
  if (positions.length === 0) {
    if (lyrics) segments.push({ chord: null, text: lyrics });
    return segments;
  }
  if (positions[0].at > 0 && lyrics.slice(0, positions[0].at).length > 0) {
    segments.push({ chord: null, text: lyrics.slice(0, positions[0].at) });
  }
  positions.forEach((pos, i) => {
    const end = i + 1 < positions.length ? positions[i + 1].at : lyrics.length;
    segments.push({ chord: pos.chord, text: lyrics.slice(pos.at, end) });
  });
  return segments.filter((s) => s.chord || (s.text && s.text.length > 0));
}

const SECTION_DIRECTIVES = {
  start_of_chorus: 'Chorus', soc: 'Chorus',
  start_of_verse: 'Verse', sov: 'Verse',
  start_of_tab: 'Tab', sot: 'Tab',
  start_of_bridge: 'Bridge', sob: 'Bridge',
  start_of_intro: 'Intro', start_of_outro: 'Outro', start_of_interlude: 'Interlude',
};

const END_DIRECTIVES = new Set([
  'end_of_chorus', 'eoc', 'end_of_verse', 'eov', 'end_of_tab', 'eot',
  'end_of_bridge', 'end_of_intro', 'end_of_outro', 'end_of_interlude',
]);

/**
 * Parse ChordPro / chord-sheet text into a structured chart.
 * Never throws on weird input: unparseable lines become plain lyric lines.
 */
export function parseChordPro(text) {
  const chart = {
    title: '', artist: '', key: '', capo: '', tempo: '', ccli: '',
    sections: [],
  };
  const source = String(text ?? '');
  if (!source.trim()) return chart;

  let current = null;
  const ensureSection = (label) => {
    if (!current) {
      current = { id: `chord_section_${chart.sections.length}`, label, lines: [] };
      chart.sections.push(current);
    }
    return current;
  };
  const defaultSection = () => {
    if (!current) ensureSection('Verse');
    return current;
  };

  const rawLines = source.split(/\r?\n/);
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      // Blank lines are visual gaps inside the current section, never
      // section breaks — explicit headers/directives start new sections.
      if (current) current.lines.push({ segments: [], gap: true });
      continue;
    }

    const directive = trimmed.match(DIRECTIVE_RE);
    if (directive) {
      const name = directive[1].trim().toLowerCase();
      const value = (directive[2] ?? '').trim();
      if (name === 'title' || name === 't') chart.title = value;
      else if (name === 'artist' || name === 'a') chart.artist = value;
      else if (name === 'key' || name === 'k') chart.key = value;
      else if (name === 'capo') chart.capo = value;
      else if (name === 'tempo' || name === 'time' || name === 'duration') chart.tempo = chart.tempo || value;
      else if (name === 'ccli' || name === 'ccli_number' || name === 'ccli-number') chart.ccli = value;
      else if (name === 'comment' || name === 'c' || name === 'subtitle' || name === 'st') {
        if (value) defaultSection().lines.push({ comment: value, segments: [] });
      } else if (SECTION_DIRECTIVES[name]) {
        current = { id: `chord_section_${chart.sections.length}`, label: value || SECTION_DIRECTIVES[name], lines: [] };
        chart.sections.push(current);
      } else if (END_DIRECTIVES.has(name)) {
        current = null;
      }
      // `{define: ...}` and unknown directives are intentionally ignored.
      i += 1;
      continue;
    }

    const bracketSection = trimmed.match(BRACKET_SECTION_RE);
    if (bracketSection && !isChordToken(bracketSection[1].trim())) {
      const label = bracketSection[1].trim().replace(/\s+/g, ' ');
      current = { id: `chord_section_${chart.sections.length}`, label, lines: [] };
      chart.sections.push(current);
      i += 1;
      continue;
    }

    // Chords-over-lyrics: chord-only line directly above a lyric line.
    const nextLine = rawLines[i + 1];
    const nextTrimmed = nextLine !== undefined ? nextLine.trim() : '';
    if (isChordLine(trimmed) && nextLine !== undefined && nextTrimmed && !isChordLine(nextTrimmed) && !nextTrimmed.match(DIRECTIVE_RE)) {
      defaultSection().lines.push({ segments: chordLineToSegments(line, nextLine) });
      i += 2;
      continue;
    }
    if (isChordLine(trimmed) && (nextLine === undefined || !nextTrimmed)) {
      // Trailing chord-only line (turnaround/outro vamp): keep chords, no lyric.
      defaultSection().lines.push({ segments: chordLineToSegments(line, '') });
      i += 1;
      continue;
    }

    const segments = splitInlineChords(line);
    if (segments.length > 0) {
      defaultSection().lines.push({ segments });
    }
    i += 1;
  }

  // Drop sections that ended up with no singable lines (e.g. consecutive
  // headers, or files containing only blank lines).
  chart.sections = chart.sections.filter((s) => s.lines.some((l) => (l.segments && l.segments.length > 0) || l.comment));
  chart.sections.forEach((s, idx) => { s.id = `chord_section_${idx}`; });
  return chart;
}

/** Heuristic: does this text carry chord information worth charting? */
export function hasChordPro(text) {
  const source = String(text ?? '');
  if (!source.trim()) return false;
  const lines = source.split(/\r?\n/);
  let inlineChords = 0;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const trimmed = lines[idx].trim();
    if (!trimmed) continue;
    const directive = trimmed.match(DIRECTIVE_RE);
    if (directive) {
      const name = directive[1].trim().toLowerCase();
      if (name === 'key' || name === 'title' || name === 't' || SECTION_DIRECTIVES[name] || name === 'ccli') return true;
      continue;
    }
    if (isChordLine(trimmed)) {
      const next = (lines[idx + 1] || '').trim();
      if (next && !isChordLine(next) && !next.match(DIRECTIVE_RE)) return true;
      if (!next) return true;
      continue;
    }
    INLINE_CHORD_RE.lastIndex = 0;
    let m;
    while ((m = INLINE_CHORD_RE.exec(trimmed)) !== null) {
      if (isChordToken(m[1].trim())) {
        inlineChords += 1;
        if (inlineChords >= 1) return true;
      }
    }
  }
  return false;
}

/** Strip chord symbols and ChordPro directives, leaving singable lyric text. */
export function stripChordsFromText(text) {
  const source = String(text ?? '');
  if (!source) return '';
  const out = [];
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }
    const directive = trimmed.match(DIRECTIVE_RE);
    if (directive) {
      const name = directive[1].trim().toLowerCase();
      if ((name === 'comment' || name === 'c') && directive[2]) out.push(directive[2].trim());
      continue;
    }
    if (isChordLine(trimmed)) continue; // chords-over-lyrics scaffolding
    const bracketSection = trimmed.match(BRACKET_SECTION_RE);
    if (bracketSection && !isChordToken(bracketSection[1].trim())) {
      out.push(`[${bracketSection[1].trim()}]`);
      continue;
    }
    out.push(line.replace(INLINE_CHORD_RE, (full, inner) => (isChordToken(String(inner).trim()) ? '' : full)).replace(/[ \t]+/g, ' ').replace(/^\s+/, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function transposeRoot(root, semitones) {
  const index = NOTE_INDEX[root];
  if (index === undefined) return root;
  const next = (((index + semitones) % 12) + 12) % 12;
  const useFlats = root.includes('b');
  return (useFlats ? FLAT_NOTES : SHARP_NOTES)[next];
}

/** Transpose a single chord symbol by semitones (positive or negative). */
export function transposeChord(chord, semitones = 0) {
  if (!chord || !semitones) return chord || '';
  const match = String(chord).trim().match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) return chord;
  let [, root, rest] = match;
  const slashAt = rest.lastIndexOf('/');
  let bass = '';
  if (slashAt !== -1) {
    const maybeBass = rest.slice(slashAt + 1);
    if (/^[A-G](?:#|b)?$/.test(maybeBass)) {
      bass = maybeBass;
      rest = rest.slice(0, slashAt);
    }
  }
  let out = `${transposeRoot(root, semitones)}${rest}`;
  if (bass) out += `/${transposeRoot(bass, semitones)}`;
  return out;
}

/** Return a transposed copy of a parsed chart (original untouched). */
export function transposeSong(chart, semitones = 0) {
  if (!chart || !semitones) return chart;
  const steps = Number(semitones) || 0;
  return {
    ...chart,
    key: chart.key ? transposeChord(chart.key.trim().split(/\s+/)[0], steps) : chart.key,
    sections: (chart.sections || []).map((section) => ({
      ...section,
      lines: (section.lines || []).map((line) => ({
        ...line,
        segments: (line.segments || []).map((seg) => ({
          ...seg,
          chord: seg.chord ? transposeChord(seg.chord, steps) : seg.chord,
        })),
      })),
    })),
  };
}

/**
 * Lay out one lyric line with its chords into two mono-spaced rows so chords
 * sit above the lyric syllable they belong to. Works with any monospace font.
 */
export function formatChordLyricLine(segments, semitones = 0) {
  let chordRow = '';
  let lyricRow = '';
  for (const seg of segments || []) {
    const chord = seg.chord ? transposeChord(seg.chord, semitones) : '';
    const text = seg.text ?? '';
    if (chord) {
      while (chordRow.length < lyricRow.length) chordRow += ' ';
      chordRow += chord;
    }
    lyricRow += text;
  }
  while (chordRow.length < lyricRow.length) chordRow += ' ';
  while (lyricRow.length < chordRow.length) lyricRow += ' ';
  return { chords: chordRow.replace(/\s+$/, ''), lyrics: lyricRow.replace(/\s+$/, '') };
}

const CCLI_PATTERNS = [
  /\{\s*ccli(?:_number|[-_ ]?number)?\s*:\s*([0-9][0-9\s-]*)\}/i,
  /\bCCLI\s*(?:Song\s*)?(?:No\.?|Number|#)\s*[:#-]?\s*([0-9][0-9\s-]*)/i,
  /\bccli\b\s*[:#-]?\s*([0-9][0-9\s-]*)/i,
];

/** Extract a CCLI song number from song text or metadata. Returns '' when absent. */
export function extractCcliNumber(text, metadata) {
  if (metadata && (metadata.ccliNumber || metadata.ccli)) {
    const digits = String(metadata.ccliNumber ?? metadata.ccli).replace(/[^0-9]/g, '');
    if (digits) return digits;
  }
  const source = String(text ?? '');
  for (const pattern of CCLI_PATTERNS) {
    const match = source.match(pattern);
    if (match) {
      const digits = match[1].replace(/[^0-9]/g, '');
      if (digits) return digits;
    }
  }
  return '';
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Build setlist items into CCLI usage-report rows.
 * Usage counts come from per-song metadata when present (a future usage log
 * can feed `metadata.uses` / `metadata.serviceDates`); otherwise each listed
 * song counts as a single use on the report date.
 */
export function collectCcliEntries(items, options = {}) {
  const reportDate = options.serviceDate || new Date().toISOString().slice(0, 10);
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const title = item?.displayName || item?.originalName || `Song ${index + 1}`;
    const dates = Array.isArray(metadata.serviceDates) && metadata.serviceDates.length > 0
      ? metadata.serviceDates.map(String)
      : [reportDate];
    return {
      title,
      ccliNumber: extractCcliNumber(item?.content, metadata),
      uses: Number.isFinite(Number(metadata.uses)) && Number(metadata.uses) > 0 ? Number(metadata.uses) : 1,
      dates,
    };
  });
}

/** Render CCLI usage rows as RFC-4180 CSV for the CCLI reporting workflow. */
export function buildCcliCsv(entries) {
  const header = ['Song Title', 'CCLI Number', 'Uses', 'Service Dates', 'Notes'].map(csvCell).join(',');
  const rows = (Array.isArray(entries) ? entries : []).map((entry) => ([
    entry?.title || '',
    entry?.ccliNumber || '',
    entry?.uses ?? '',
    Array.isArray(entry?.dates) ? entry.dates.join('; ') : (entry?.dates || ''),
    entry?.notes || '',
  ].map(csvCell).join(',')));
  return `${[header, ...rows].join('\n')}\n`;
}
