/**
 * One-off generator: rebuild shared/speech/models.catalog.json from the real
 * published Hugging Face blob list for ggerganov/whisper.cpp.
 *
 * WHY A GENERATOR RATHER THAN HAND-EDITED JSON: the catalog is a mirror of an
 * upstream list. Hand-editing it is how entries drift out of sync with what is
 * actually downloadable, and an entry that 404s is worse than a missing option.
 * Run this to refresh; commit the result.
 *
 * NOT A NEW DEPENDENCY — it uses global fetch, which Node 18+ ships.
 *
 *   node scripts/refreshModelCatalog.mjs           # print a report, write nothing
 *   node scripts/refreshModelCatalog.mjs --write   # rewrite the catalog
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(HERE, '..', 'shared', 'speech', 'models.catalog.json');
const UPSTREAM = 'https://huggingface.co/api/models/ggerganov/whisper.cpp?blobs=true';

/** Published parameter counts, from the upstream model names. */
const PARAMS = {
  tiny: '39M',
  base: '74M',
  small: '244M',
  medium: '769M',
  'large-v3-turbo': '809M',
  'large-v3': '1.55B',
  'large-v2': '1.55B',
  'large-v1': '1.55B',
};

const Q_LABEL = {
  f16: 'f16 (full precision)',
  q8_0: 'q8_0',
  q5_0: 'q5_0',
  q5_1: 'q5_1',
};

/**
 * Split a file name into { family, englishOnly, quantization }.
 * ggml-large-v3-turbo-q8_0 -> { family: large-v3-turbo, en: false, q: q8_0 }
 * ggml-base.en-q5_1       -> { family: base,       en: true,  q: q5_1 }
 */
function parseFileName(fileName) {
  const id = fileName.replace(/^ggml-/, '').replace(/\.bin$/, '');
  const qMatch = id.match(/-(q8_0|q5_0|q5_1)$/);
  const quantization = qMatch ? qMatch[1] : 'f16';
  const stem = qMatch ? id.slice(0, -qMatch[0].length) : id;
  const englishOnly = stem.includes('.en');
  const family = englishOnly ? stem.replace(/\.en$/, '') : stem;
  return { id, family, englishOnly, quantization };
}

/**
 * What each model is FOR, and what choosing it costs. Grouped by family so the
 * tiers read as a ladder an operator can reason about rather than a flat list.
 * Written per family, not per file: base-q5_1 and base-q8_0 are the same trade
 * at different sizes, and saying so is more useful than two near-identical
 * sentences.
 */
function verdictFor({ family, englishOnly, quantization }) {
  const lang = englishOnly ? 'English only.' : 'Multilingual.';
  const q = quantization === 'f16' ? '' : ` at ${Q_LABEL[quantization]}`;
  switch (family) {
    case 'large-v3':
      return `THE DEFAULT. Best accuracy in the catalog${q}. Worth it on capable hardware.`;
    case 'large-v3-turbo':
      return `The speed pick${q}. Best accuracy per second; close to large-v3 in quality.`;
    case 'medium':
      return englishOnly
        ? `English-only sensible pick${q}. Rarely better than large-v3-turbo, at a fraction of the size.`
        : `Multilingual workhorse${q} for a machine that cannot hold large-v3 in RAM.`;
    case 'small':
      return `For weak machines${q}. Audible accuracy loss on accents and reverb.`;
    case 'base':
      return `Light and quick${q}. Reference detection and short segments; not for a whole sermon.`;
    case 'tiny':
      return `Emergency floor only${q}. Not usable for live sermon transcription. Listed for completeness.`;
    default:
      return `${family}${q}. ${lang}`;
  }
}

function tierFor({ family, quantization }) {
  if (family === 'large-v3') return 'flagship';
  if (family === 'large-v3-turbo') return 'fast';
  if (family === 'medium') return 'balanced';
  if (family === 'small') return 'weak';
  return 'floor';
}

/**
 * Inference memory, in GB, at default settings. These are the upstream figures
 * the plan tabulated; quantised models drop below them. Approximate by nature
 * — the plan calls them "the upstream inference-memory figure", not guarantees.
 */
function ramFor({ family, quantization }) {
  const base = { 'large-v3': 4.7, 'large-v3-turbo': 1.7, medium: 2.6, small: 1.0, base: 0.5, tiny: 0.1 }[
    family
  ];
  const factor = { f16: 1, q8_0: 0.48, q5_0: 0.34, q5_1: 0.42 }[quantization] ?? 1;
  // Floor at 0.1 GB: the tiny family at q5_1 rounds to 0.0 otherwise, and a
  // "RAM: 0 GB" row reads as a bug rather than as "very small".
  return Math.max(0.1, Number((base * factor).toFixed(1)));
}

function labelFor(bytes) {
  const gib = bytes / 1024 ** 3;
  return gib >= 1 ? `${gib.toFixed(2)} GiB` : `${Math.round(bytes / 1024 ** 2)} MiB`;
}

async function fetchPublished() {
  const response = await fetch(UPSTREAM);
  if (!response.ok) throw new Error(`upstream listing failed: HTTP ${response.status}`);
  const data = await response.json();
  return (data.siblings ?? [])
    .filter((s) => /^ggml-.*\.bin$/.test(s.rfilename ?? ''))
    .map((s) => ({ fileName: s.rfilename, bytes: s.size }))
    .filter((entry) => typeof entry.bytes === 'number' && entry.bytes > 0)
    .sort((a, b) => a.bytes - b.bytes);
}

const published = await fetchPublished();
const existing = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const byFile = new Map((existing.models ?? []).map((m) => [m.fileName, m]));

/**
 * Superseded large-v1 / large-v2 are deliberately NOT mirrored. large-v3 is
 * better on both axes that matter (accuracy, and turbo as the fast option), so
 * offering a 3 GB download that is worse in every way a user could choose is
 * padding the picker, not serving it.
 */
const SKIP_FAMILIES = new Set(['large-v1', 'large-v2']);

const kept = [];
const added = [];
const corrected = [];
const dropped = [];

for (const { fileName, bytes } of published) {
  const parsed = parseFileName(fileName);
  if (SKIP_FAMILIES.has(parsed.family)) {
    dropped.push(`${parsed.id} (superseded by large-v3)`);
    continue;
  }
  const prior = byFile.get(fileName);
  if (prior) {
    // Preserve any digest already read from the HF API. Fabricating one would
    // make a download fail verification for no reason.
    const next = {
      ...prior,
      downloadBytes: bytes,
      downloadLabel: labelFor(bytes),
      ramGb: ramFor(parsed),
      params: PARAMS[parsed.family] ?? prior.params,
      quantization: parsed.quantization,
      verdict: prior.verdict,
    };
    if (prior.downloadBytes !== bytes) {
      corrected.push(`${prior.id}: ${prior.downloadBytes} -> ${bytes} bytes`);
    }
    kept.push(next);
  } else {
    added.push(parsed.id);
    kept.push({
      id: parsed.id,
      displayName: parsed.id
        .replace(/-/g, ' ')
        .replace(/\bq(\d)_\d\b/, 'q$1')
        .replace(/\b(\w+)\b/g, (w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)),
      providerId: 'whispercpp',
      format: 'ggml',
      params: PARAMS[parsed.family] ?? 'unknown',
      downloadLabel: labelFor(bytes),
      downloadBytes: bytes,
      ramGb: ramFor(parsed),
      languages: parsed.englishOnly ? 'english' : 'multilingual',
      quantization: parsed.quantization,
      license: 'MIT',
      fileName,
      url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${fileName}`,
      sha1: null,
      sha256: null,
      verdict: verdictFor(parsed),
      tier: tierFor(parsed),
      ...(parsed.id === existing.defaultModelId ? { default: true } : {}),
    });
  }
}

// The default must keep its `default` flag even if the row was rebuilt.
const defaultRow = kept.find((m) => m.id === existing.defaultModelId);
if (defaultRow && !defaultRow.default) defaultRow.default = true;

const next = {
  ...existing,
  catalogVersion: '2.0.0',
  generated: 'refreshModelCatalog.mjs — mirrors the published upstream blob list',
  digestSource: `${UPSTREAM} (observed ${new Date().toISOString().slice(0, 10)})`,
  sizeNote:
    'downloadBytes are the exact published Hugging Face blob sizes, not rounded figures. ' +
    'ramGb is the upstream inference-memory estimate at default settings and is approximate by nature.',
  models: kept,
};

console.log(`published upstream : ${published.length}`);
console.log(`catalog entries    : ${kept.length}`);
console.log(`added              : ${added.length}${added.length ? ` — ${added.join(', ')}` : ''}`);
console.log(`size corrected     : ${corrected.length}`);
console.log(`dropped            : ${dropped.length}${dropped.length ? ` — ${dropped.join(', ')}` : ''}`);
console.log(`default            : ${defaultRow?.id} (${defaultRow ? 'flagged default' : 'MISSING!'})`);

if (process.argv.includes('--write')) {
  fs.writeFileSync(CATALOG, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\nwrote ${path.relative(process.cwd(), CATALOG)}`);
} else {
  console.log('\n(dry run — pass --write to rewrite the catalog)');
}
