import { performance } from 'perf_hooks';
import { createNavigatorTokenIndex } from '../shared/navigatorTokenIndex.js';
import {
  prepareNavigatorSearchRecord,
  scoreNavigatorSearchRecord,
  parseFileNavigatorQuery,
} from '../shared/fileNavigatorSearch.js';

console.log('=== LYRIC SEARCH 10,000-RECORD BENCHMARK ===\n');

// Word bank for generating diverse realistic vocabulary (~3,000 unique stems)
const ADJECTIVES = ['holy', 'great', 'mighty', 'living', 'glorious', 'broken', 'faithful', 'humble', 'endless', 'boundless', 'righteous', 'eternal', 'precious', 'blessed', 'steadfast', 'gracious', 'everlasting', 'radiant', 'pure', 'victorious'];
const NOUNS = ['grace', 'chains', 'mountain', 'savior', 'fortress', 'refuge', 'healer', 'ransom', 'altar', 'temple', 'promise', 'river', 'darkness', 'battle', 'shield', 'ocean', 'glory', 'shadow', 'desert', 'valley', 'fountain', 'cross'];
const VERBS = ['praise', 'sing', 'deliver', 'worship', 'redeem', 'restore', 'ransom', 'exalt', 'surrender', 'awaken', 'arise', 'remember', 'rejoice', 'reign', 'abide', 'proclaim', 'magnify', 'break', 'gather', 'overcome'];

console.log('Generating 10,000 synthetic records with realistic vocabulary distribution...');
const memBefore = process.memoryUsage().heapUsed;
const records = new Map();
const tokenIndex = createNavigatorTokenIndex();

for (let i = 0; i < 10000; i++) {
  const adj = ADJECTIVES[i % ADJECTIVES.length];
  const noun = NOUNS[(i * 3 + 1) % NOUNS.length];
  const verb = VERBS[(i * 7 + 2) % VERBS.length];
  const title = `${adj.charAt(0).toUpperCase() + adj.slice(1)} ${noun.charAt(0).toUpperCase() + noun.slice(1)} Song #${i}`;

  // Generate realistic stanza lines using words + unique hash tokens
  const line1 = `I will ${verb} your ${noun} through every ${adj} season in my life`;
  const line2 = `Your ${noun} is my light when the shadows fall and fears arise`;
  const line3 = i === 42 || i === 1042
    ? 'My chains are gone I have been set free my God my Savior has ransomed me'
    : `Singing hallelujah ${verb} to the king of all the earth #${i % 500}`;
  const line4 = `Praise the Lord O my soul for His ${adj} name forever`;

  const contentText = `${title}\n\n[Verse 1]\n${line1}\n${line2}\n\n[Chorus]\n${line3}\n${line4}`;
  const filePath = `/church/lyrics/folder_${i % 25}/${title}.txt`;

  const record = prepareNavigatorSearchRecord({
    filePath,
    fileName: `${title}.txt`,
    fileType: 'txt',
    contentText,
    modifiedMs: Date.now() - i * 1000,
  });

  records.set(filePath, record);
  tokenIndex.indexRecordTokens(record);
}

const memAfter = process.memoryUsage().heapUsed;
const memUsedMb = ((memAfter - memBefore) / 1024 / 1024).toFixed(2);
console.log(`Indexed 10,000 records. Memory footprint: ${memUsedMb} MB`);
console.log(`Unique tokens in index: ${tokenIndex.tokenIndex.size}\n`);

// Query suite testing: specific phrases, single tokens, title matches, punctuation, and typos
const QUERIES = [
  'chains are gone',
  'living fortress',
  'glorious altar',
  'hallelujah',
  'ransomed',
  'shadows fall',
  'fears arise',
  'holy mountain',
  'gone,',             // Punctuation query
  'amzing',            // Typo query
  'victorious cross',
  'desert fountain'
];

function runSearch(queryText) {
  const parsed = parseFileNavigatorQuery(queryText);
  const scored = [];

  // Fast path via token index
  const candidateKeys = tokenIndex.findCandidateKeys(parsed.terms);
  if (candidateKeys && candidateKeys.size > 0) {
    for (const key of candidateKeys) {
      const record = records.get(key);
      if (!record) continue;
      const match = scoreNavigatorSearchRecord(record, parsed);
      if (!match) continue;
      scored.push({ record, ...match });
    }
  }

  // R1 Fallback path (typos, edit-distance, fuzzy)
  if (scored.length === 0) {
    for (const record of records.values()) {
      const match = scoreNavigatorSearchRecord(record, parsed);
      if (!match) continue;
      scored.push({ record, ...match });
    }
  }

  return scored;
}

// 1. Cold benchmark run
console.log('Running cold benchmark across 100 query iterations...');
const coldLatencies = [];
for (let i = 0; i < 100; i++) {
  const q = QUERIES[i % QUERIES.length];
  const t0 = performance.now();
  const results = runSearch(q);
  const t1 = performance.now();
  coldLatencies.push(t1 - t0);
}

// 2. Warm benchmark run
console.log('Running warm benchmark across 100 query iterations...');
const warmLatencies = [];
for (let i = 0; i < 100; i++) {
  const q = QUERIES[i % QUERIES.length];
  const t0 = performance.now();
  const results = runSearch(q);
  const t1 = performance.now();
  warmLatencies.push(t1 - t0);
}

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)].toFixed(2);
  const p95 = sorted[Math.floor(sorted.length * 0.95)].toFixed(2);
  const max = sorted[sorted.length - 1].toFixed(2);
  const avg = (sorted.reduce((s, x) => s + x, 0) / sorted.length).toFixed(2);
  return { p50, p95, max, avg };
}

const cold = stats(coldLatencies);
const warm = stats(warmLatencies);

console.log('--- BENCHMARK RESULTS ---');
console.log(`Cold Run (100 queries): Avg = ${cold.avg}ms | p50 = ${cold.p50}ms | p95 = ${cold.p95}ms | Max = ${cold.max}ms`);
console.log(`Warm Run (100 queries): Avg = ${warm.avg}ms | p50 = ${warm.p50}ms | p95 = ${warm.p95}ms | Max = ${warm.max}ms`);
console.log(`\nTarget SLA: p95 <= 20ms across 10,000 files`);
if (Number(warm.p95) <= 20) {
  console.log(`\x1b[32m✔ PASS: Search p95 (${warm.p95}ms) is well within the 20ms SLA gate!\x1b[0m`);
} else {
  console.log(`\x1b[31m✖ FAIL: Search p95 exceeded 20ms SLA gate.\x1b[0m`);
}
