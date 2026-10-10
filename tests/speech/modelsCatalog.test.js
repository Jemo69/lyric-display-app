/**
 * The catalog is a MIRROR of what upstream actually publishes. These tests exist
 * so a stale or invented entry cannot ship: a model the user selects and then
 * cannot download is worse than an option that was never offered.
 */
import { describe, it, expect } from 'vitest';
import catalog from '../../shared/speech/models.catalog.json';

/**
 * Every `ggml-*.bin` published by ggerganov/whisper.cpp, observed from the
 * Hugging Face blob listing. Regenerate with
 * `node scripts/refreshModelCatalog.mjs --write` when upstream changes — this
 * fixture is the gate that says "update it deliberately".
 */
const PUBLISHED_FILES = new Set([
  'ggml-base-q5_1.bin', 'ggml-base-q8_0.bin', 'ggml-base.bin',
  'ggml-base.en-q5_1.bin', 'ggml-base.en-q8_0.bin', 'ggml-base.en.bin',
  'ggml-large-v1.bin',
  'ggml-large-v2-q5_0.bin', 'ggml-large-v2-q8_0.bin', 'ggml-large-v2.bin',
  'ggml-large-v3-q5_0.bin', 'ggml-large-v3-turbo-q5_0.bin',
  'ggml-large-v3-turbo-q8_0.bin', 'ggml-large-v3-turbo.bin',
  'ggml-large-v3.bin',
  'ggml-medium-q5_0.bin', 'ggml-medium-q8_0.bin', 'ggml-medium.bin',
  'ggml-medium.en-q5_0.bin', 'ggml-medium.en-q8_0.bin', 'ggml-medium.en.bin',
  'ggml-small-q5_1.bin', 'ggml-small-q8_0.bin', 'ggml-small.bin',
  'ggml-small.en-q5_1.bin', 'ggml-small.en-q8_0.bin', 'ggml-small.en.bin',
  'ggml-tiny-q5_1.bin', 'ggml-tiny-q8_0.bin', 'ggml-tiny.bin',
  'ggml-tiny.en-q5_1.bin', 'ggml-tiny.en-q8_0.bin', 'ggml-tiny.en.bin',
]);

const models = catalog.models ?? catalog;
const required = [
  'id', 'displayName', 'providerId', 'format', 'params', 'downloadLabel',
  'downloadBytes', 'ramGb', 'languages', 'quantization', 'license', 'fileName',
  'url', 'sha1', 'sha256', 'verdict', 'tier',
];

describe('model catalog mirrors what is actually downloadable', () => {
  it('every entry names a file upstream actually publishes', () => {
    // THE test. A typo, a quantisation that does not exist (there is no
    // small-q8_0 in some builds, no medium-q5_1 ever), or a model invented from
    // memory all fail here rather than 404-ing during a service.
    const unknown = models
      .map((m) => m.fileName)
      .filter((fileName) => !PUBLISHED_FILES.has(fileName));
    expect(unknown, 'these entries reference a file that is not published').toEqual([]);
  });

  it('every entry carries every field the downloader and UI read', () => {
    for (const model of models) {
      for (const field of required) {
        expect(model, `${model.id} is missing ${field}`).toHaveProperty(field);
      }
      expect(typeof model.downloadBytes, model.id).toBe('number');
      expect(model.downloadBytes, model.id).toBeGreaterThan(0);
      expect(model.ramGb, model.id).toBeGreaterThan(0);
      expect(model.verdict.trim().length, `${model.id} needs a real verdict`).toBeGreaterThan(10);
    }
  });

  it('the file name, the id and the download URL agree', () => {
    for (const model of models) {
      expect(model.fileName, model.id).toBe(`ggml-${model.id}.bin`);
      expect(model.url.endsWith(`/${model.fileName}`), `${model.id} url points elsewhere`).toBe(true);
    }
  });

  it('ids are unique', () => {
    const ids = models.map((m) => m.id);
    expect(new Set(ids).size, 'duplicate model id').toBe(ids.length);
  });

  it('large-v3 is still the default — capable hardware is the stated target', () => {
    // Deliberate (plan 8.3): the default is the BEST model, not the smallest.
    // Silently re-ranking this to "tiny, it's faster to download" is exactly
    // the change that would need arguing for.
    expect(catalog.defaultModelId).toBe('large-v3');
    const flagged = models.filter((m) => m.default);
    expect(flagged.map((m) => m.id)).toEqual(['large-v3']);
  });

  it('languages are honest — an .en model never claims to be multilingual', () => {
    for (const model of models) {
      if (model.id.includes('.en')) {
        expect(model.languages, `${model.id} is an English-only model`).toBe('english');
      } else {
        expect(model.languages, `${model.id} should be multilingual`).toBe('multilingual');
      }
    }
  });

  it('offers a small option for BOTH English and non-English services', () => {
    // The gap this expansion closed: before it, every small model was .en, so a
    // non-English church had no cheap option at all.
    const small = models.filter((m) => m.downloadBytes < 500e6);
    expect(small.some((m) => m.languages === 'multilingual')).toBe(true);
    expect(small.some((m) => m.languages === 'english')).toBe(true);
  });

  it('no digest is fabricated', () => {
    // sha1/sha256 stay null until the downloader pins on first fetch. A made-up
    // hex string would make a legitimate download fail verification.
    expect(catalog.digestsPinned).toBe(false);
    for (const model of models) {
      for (const digest of [model.sha1, model.sha256]) {
        if (digest === null || digest === undefined) continue;
        expect(digest, `${model.id} has a non-empty digest but digestsPinned is false`).toMatch(
          /^[0-9a-f]{40}$|^[0-9a-f]{64}$/
        );
      }
    }
  });

  it('sizes are the real published byte counts, not rounded placeholders', () => {
    for (const model of models) {
      expect(model.downloadBytes, `${model.id} looks rounded`).not.toBe(
        Math.round(model.downloadBytes / 1e7) * 1e7
      );
      expect(model.downloadLabel, model.id).toMatch(/^\d+(\.\d+)? (MiB|GiB)$/);
    }
  });

  it('carries no weights — metadata only (invariant 1)', () => {
    // NOT "no 64-char hex string": a legitimate sha256 digest IS 64 hex chars,
    // and asserting their absence would forbid pinning digests at all. The rule
    // that matters is the plan's own — no field may carry anything whose value
    // is large enough to be a model. So assert the whole catalog is text-sized,
    // which is the property that would break if weights were ever inlined.
    const bytes = Buffer.byteLength(JSON.stringify(catalog));
    expect(bytes, 'the catalog is metadata, not weights').toBeLessThan(64 * 1024);
    for (const model of models) {
      for (const [field, value] of Object.entries(model)) {
        expect(
          typeof value === 'string' ? Buffer.byteLength(value) : 0,
          `${model.id}.${field} is too large to be metadata`
        ).toBeLessThan(1024);
      }
    }
  });
});
