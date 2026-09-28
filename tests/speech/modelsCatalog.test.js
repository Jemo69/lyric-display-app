/**
 * tests/speech/modelsCatalog.test.js — Live Sermon Assist Phase 0.
 *
 * Guards the static model catalog: it ships in the installer, so it must stay
 * a few KB of text with no weights, no fabricated digests, and no dangling
 * provider references. Also exercises the pure lookups in the barrel.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// jsdom installs a global URL that ignores the base argument and resolves
// against http://localhost:3000, and Vite rewrites the literal
// `new URL('<string>', import.meta.url)` asset pattern to a dev-server URL.
// Importing the WHATWG URL under an alias sidesteps both and yields a real
// file:// URL that readFileSync accepts.
import { URL as NodeURL } from 'node:url';
import {
  MODEL_CATALOG,
  getModel,
  getProvider,
  modelsForProvider,
  getDefaultModel,
} from '../../shared/speech/index.js';

const CATALOG_URL = new NodeURL('../../shared/speech/models.catalog.json', import.meta.url);
const RAW_TEXT = readFileSync(CATALOG_URL, 'utf8');
const catalog = JSON.parse(RAW_TEXT);

const HEX_40 = /^[0-9a-f]{40}$/i;
const HEX_64 = /^[0-9a-f]{64}$/i;

/** Recursively collect every string value in the parsed JSON. */
function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) collectStrings(value[key], out);
  }
  return out;
}

describe('models catalog: shape', () => {
  it('declares its schema, version, and metadata-only intent', () => {
    expect(catalog.schema).toBe(1);
    expect(typeof catalog.catalogVersion).toBe('string');
    expect(catalog.catalogVersion.length).toBeGreaterThan(0);
    expect(typeof catalog.generated).toBe('string');
    expect(typeof catalog.note).toBe('string');
    expect(catalog.note.toLowerCase()).toContain('metadata only');
    expect(catalog.digestsPinned).toBe(false);
    expect(typeof catalog.digestNote).toBe('string');
    expect(catalog.digestNote).toContain('null');
  });

  it('exposes exactly 12 models', () => {
    expect(catalog.models).toHaveLength(12);
  });

  it('defaults to large-v3, and only large-v3 is flagged default', () => {
    expect(catalog.defaultModelId).toBe('large-v3');
    const flagged = catalog.models.filter((model) => model.default === true);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].id).toBe('large-v3');
    expect(getDefaultModel()).toBeTruthy();
    expect(getDefaultModel().id).toBe('large-v3');
  });

  it('has every model row carry the required fields', () => {
    const required = [
      'id', 'displayName', 'providerId', 'format', 'params', 'downloadLabel',
      'downloadBytes', 'ramGb', 'languages', 'quantization', 'license',
      'fileName', 'url', 'sha1', 'sha256', 'verdict', 'tier',
    ];
    for (const model of catalog.models) {
      for (const field of required) {
        expect(Object.prototype.hasOwnProperty.call(model, field), `${model.id}.${field}`).toBe(true);
      }
      expect(model.providerId).toBe('whispercpp');
      expect(model.format).toBe('ggml');
      expect(model.license).toBe('MIT');
      expect(model.tier).toBeTruthy();
      expect(model.verdict.length).toBeGreaterThan(0);
    }
  });

  it('references only providers that exist in the catalog', () => {
    const providerIds = new Set(catalog.providers.map((provider) => provider.id));
    for (const model of catalog.models) {
      expect(providerIds.has(model.providerId), `${model.id} -> ${model.providerId}`).toBe(true);
    }
  });

  it('points every url at its own fileName over https', () => {
    for (const model of catalog.models) {
      expect(typeof model.fileName).toBe('string');
      expect(model.fileName.length).toBeGreaterThan(0);
      expect(model.url).toMatch(/^https:\/\//);
      expect(model.url.endsWith(model.fileName), `${model.id}: ${model.url}`).toBe(true);
    }
  });
});

describe('models catalog: anti-fabrication guards', () => {
  it('only carries null or correctly-shaped hex digests', () => {
    for (const model of catalog.models) {
      const sha1 = model.sha1;
      const sha256 = model.sha256;
      const sha1Ok = sha1 === null || (typeof sha1 === 'string' && HEX_40.test(sha1));
      const sha256Ok = sha256 === null || (typeof sha256 === 'string' && HEX_64.test(sha256));
      expect(sha1Ok, `${model.id}.sha1 = ${JSON.stringify(sha1)}`).toBe(true);
      expect(sha256Ok, `${model.id}.sha256 = ${JSON.stringify(sha256)}`).toBe(true);
    }
  });

  it('never invents a digest for a file it has not pinned', () => {
    // sha1 is deliberately unpinned everywhere: the Hugging Face API exposes
    // git blob ids for LFS pointers, which are NOT content sha1 values.
    for (const model of catalog.models) {
      expect(model.sha1).toBeNull();
    }
    expect(catalog.digestsPinned).toBe(false);
    expect(typeof catalog.digestSource).toBe('string');
  });

  it('ships only a few KB of text', () => {
    expect(RAW_TEXT.length).toBeLessThan(40 * 1024);
  });

  it('contains no field value longer than the file itself', () => {
    const strings = collectStrings(catalog);
    expect(strings.length).toBeGreaterThan(0);
    for (const value of strings) {
      expect(value.length, `string of length ${value.length}: ${value.slice(0, 40)}...`).toBeLessThanOrEqual(
        RAW_TEXT.length
      );
    }
  });

  it('contains no model weight payloads', () => {
    const text = RAW_TEXT.toLowerCase();
    expect(text).not.toContain('base64');
    expect(text).not.toContain('gguf"');
    expect(RAW_TEXT.length).toBeLessThan(1024 * 1024);
  });
});

describe('models catalog: providers', () => {
  it('has exactly six providers', () => {
    expect(catalog.providers).toHaveLength(6);
    const ids = catalog.providers.map((provider) => provider.id);
    expect(ids).toEqual(['whispercpp', 'sherpaonnx', 'osondevice', 'vosk', 'fasterwhisper', 'custom']);
  });

  it('marks osondevice as the one provider needing no install', () => {
    const noInstall = catalog.providers.filter((provider) => provider.needsNoInstall === true);
    expect(noInstall).toHaveLength(1);
    expect(noInstall[0].id).toBe('osondevice');
    expect(noInstall[0].needsInstall).toBe(false);
    expect(noInstall[0].installMethod).toBe('probe');
    expect(noInstall[0].reads).toEqual([]);
    expect(noInstall[0].gpu).toEqual(['os-accelerated']);
  });

  it('describes whispercpp as the local default', () => {
    const whisper = getProvider('whispercpp');
    expect(whisper).toBeTruthy();
    expect(whisper.name).toBe('whisper.cpp');
    expect(whisper.reads).toEqual(['ggml']);
    expect(whisper.wordTimestamps).toBe(true);
    expect(whisper.biasSupport).toBe(true);
    expect(whisper.streaming).toBe(true);
    expect(whisper.needsInstall).toBe(true);
    expect(whisper.installMethod).toBe('binary');
    expect(catalog.defaultProviderId).toBe('whispercpp');
  });

  it('gives every provider the full capability block', () => {
    for (const provider of catalog.providers) {
      for (const field of [
        'id', 'name', 'requires', 'reads', 'wordTimestamps', 'biasSupport',
        'streaming', 'gpu', 'needsInstall', 'installMethod', 'license',
        'description', 'platforms',
      ]) {
        expect(Object.prototype.hasOwnProperty.call(provider, field), `${provider.id}.${field}`).toBe(true);
      }
      expect(Array.isArray(provider.reads)).toBe(true);
      expect(Array.isArray(provider.gpu)).toBe(true);
      expect(Array.isArray(provider.platforms)).toBe(true);
      expect(provider.description.length).toBeGreaterThan(0);
      expect(typeof provider.needsInstall).toBe('boolean');
    }
  });

  it('gives the custom provider the conservative null capability default', () => {
    const custom = getProvider('custom');
    expect(custom.wordTimestamps).toBeNull();
    expect(custom.biasSupport).toBeNull();
    expect(custom.streaming).toBeNull();
    expect(custom.needsInstall).toBe(false);
    expect(custom.installMethod).toBe('command');
  });
});

describe('models catalog: lookups', () => {
  it('finds a model by id and misses cleanly', () => {
    expect(getModel('large-v3')).toBeTruthy();
    expect(getModel('large-v3').fileName).toBe('ggml-large-v3.bin');
    expect(getModel('does-not-exist')).toBeNull();
    expect(getModel(null)).toBeNull();
  });

  it('finds a provider by id and misses cleanly', () => {
    expect(getProvider('osondevice')).toBeTruthy();
    expect(getProvider('nope')).toBeNull();
    expect(getProvider(7)).toBeNull();
  });

  it('lists models per provider', () => {
    expect(modelsForProvider('whispercpp')).toHaveLength(12);
    expect(modelsForProvider('sherpaonnx')).toHaveLength(0);
    expect(modelsForProvider('osondevice')).toHaveLength(0);
    expect(modelsForProvider('custom')).toHaveLength(0);
    expect(modelsForProvider(undefined)).toEqual([]);
  });

  it('exposes the same objects as the raw JSON', () => {
    expect(MODEL_CATALOG).toEqual(catalog);
    expect(getModel('large-v3')).toEqual(catalog.models[0]);
    expect(getProvider('whispercpp')).toEqual(catalog.providers[0]);
  });
});
