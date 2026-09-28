/**
 * shared/speech/index.js — barrel for the Live Sermon Assist contract.
 *
 * Re-exports the protocol surface (see ./protocol.js) plus pure lookups over
 * the static model catalog (./models.catalog.json). No runtime dependencies,
 * no Electron, no DOM — safe to import from main, server, the renderer, and
 * web workers.
 *
 * The catalog is imported with an explicit `with { type: 'json' }` attribute:
 * plain `import ... from './x.json'` works under Vite/Vitest but throws
 * ERR_IMPORT_ATTRIBUTE_MISSING under plain Node ESM, and main/server load
 * shared/ through plain Node. The attributed form works in both.
 */
import catalog from './models.catalog.json' with { type: 'json' };

export * from './protocol.js';

/** The whole parsed catalog (providers + models + metadata). */
export const MODEL_CATALOG = catalog;

/** All catalog models, in tier order. */
export const SPEECH_MODELS = catalog.models;

/** All catalog providers (the local "who" axis). */
export const SPEECH_PROVIDERS = catalog.providers;

/**
 * Look up a model by id.
 *
 * @param {string} id
 * @returns {object|null}
 */
export function getModel(id) {
  if (typeof id !== 'string') return null;
  return catalog.models.find((model) => model.id === id) || null;
}

/**
 * Look up a provider by id.
 *
 * @param {string} id
 * @returns {object|null}
 */
export function getProvider(id) {
  if (typeof id !== 'string') return null;
  return catalog.providers.find((provider) => provider.id === id) || null;
}

/**
 * Models a provider can actually read. Providers that read no downloadable
 * format (OS on-device) or have no catalog rows yet (everything except
 * whisper.cpp) get an empty array, never undefined.
 *
 * @param {string} providerId
 * @returns {object[]}
 */
export function modelsForProvider(providerId) {
  if (typeof providerId !== 'string') return [];
  return catalog.models.filter((model) => model.providerId === providerId);
}

/**
 * The catalog's default model (defaultModelId, falling back to the single
 * row flagged `default`).
 *
 * @returns {object|null}
 */
export function getDefaultModel() {
  return getModel(catalog.defaultModelId) || catalog.models.find((model) => model.default === true) || null;
}
