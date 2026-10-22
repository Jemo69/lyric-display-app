/**
 * The driver and the downloader must agree on ONE file name per model.
 *
 * They did not, and the disagreement was invisible to every existing test:
 *
 *   - `speechDownloader` writes `modelPaths(modelsDir, model.fileName)`, i.e.
 *     `ggml-tiny.en-q5_1.bin`;
 *   - `listInstalledModels` reads that same name, which is what lights the
 *     "installed" badge in the catalog UI;
 *   - the whisper driver resolved `${modelId}.bin`, i.e. `tiny.en-q5_1.bin`.
 *
 * Nothing in this repo has ever created the second name. So the wizard could
 * complete a download, the catalog could show the model as installed, the user
 * could select it, and the engine would still throw ENGINE_UNAVAILABLE and fall
 * back to the canned engine — a green "listening" badge over text the process
 * wrote itself.
 *
 * The fix is asserted PER CATALOG ROW on purpose. Checking one row would not
 * have caught the class, and checking the two functions in isolation would not
 * have caught a catalog entry whose `fileName` stops following the `ggml-`
 * convention. The agreement is the invariant.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import catalog from '../../shared/speech/models.catalog.json';
import { modelPaths } from '../../main/speechDownloader.js';
import { resolveWeights, weightsFileName } from '../../speech-engine/drivers/whispercpp.js';

const whisperRows = (catalog.models || []).filter(
  (model) => model.providerId === 'whispercpp' && typeof model.fileName === 'string'
);

const created = [];
function scratchModelsDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ld-weights-'));
  created.push(dir);
  return dir;
}

afterEach(() => {
  while (created.length > 0) {
    rmSync(created.pop(), { recursive: true, force: true });
  }
});

describe('the engine resolves the weights the downloader actually wrote', () => {
  it('covers the whisper.cpp catalog', () => {
    // A filter that silently matches nothing would make every case below pass
    // vacuously — the same shape of blind spot that hid this bug.
    expect(whisperRows.length).toBeGreaterThan(0);
  });

  it.each(whisperRows.map((model) => [model.id, model.fileName]))(
    'model id %s resolves to the downloaded %s',
    (id, fileName) => {
      const modelsDir = scratchModelsDir();

      // Exactly what a completed install leaves behind.
      const { finalPath } = modelPaths(modelsDir, fileName);
      writeFileSync(finalPath, 'weights');

      expect(weightsFileName(id)).toBe(fileName);
      expect(resolveWeights(modelsDir, id)).toBe(finalPath);
    }
  );

  it('still accepts the legacy <id>.bin shape', () => {
    // Hand-placed drop-ins and the driver's own fixtures use this form. It
    // costs nothing to keep, and renaming a user's file to match us would be
    // the worse answer.
    const modelsDir = scratchModelsDir();
    writeFileSync(path.join(modelsDir, 'base.bin'), 'weights');

    expect(resolveWeights(modelsDir, 'base')).toBe(path.join(modelsDir, 'base.bin'));
  });

  it('prefers the catalog name when both shapes are present', () => {
    const modelsDir = scratchModelsDir();
    const { finalPath } = modelPaths(modelsDir, 'ggml-tiny.en-q5_1.bin');
    writeFileSync(finalPath, 'catalog');
    writeFileSync(path.join(modelsDir, 'tiny.en-q5_1.bin'), 'legacy');

    expect(resolveWeights(modelsDir, 'tiny.en-q5_1')).toBe(finalPath);
  });

  it('accepts a plain .bin file name in place of an id', () => {
    const modelsDir = scratchModelsDir();
    const { finalPath } = modelPaths(modelsDir, 'ggml-tiny.en-q5_1.bin');
    writeFileSync(finalPath, 'weights');

    expect(resolveWeights(modelsDir, 'ggml-tiny.en-q5_1.bin')).toBe(finalPath);
  });

  it('treats a zero-byte weights file as not installed', () => {
    const modelsDir = scratchModelsDir();
    const { finalPath } = modelPaths(modelsDir, 'ggml-tiny.en-q5_1.bin');
    writeFileSync(finalPath, '');

    expect(resolveWeights(modelsDir, 'tiny.en-q5_1')).toBeNull();
  });

  it('cannot be walked out of the models directory', () => {
    // `modelId` reaches this function from persisted renderer state, so it is
    // not a constant to be trusted with the filesystem.
    //
    // THE DECOY IS THE POINT. Asserting that `../decoy` returns null only
    // proves the path INSIDE the models dir does not exist — an implementation
    // with the basename guard removed would return the outside file and the
    // old assertions would still pass. So the outside file must exist, and the
    // assertion is that it is never the answer.
    const base = scratchModelsDir();
    const modelsDir = path.join(base, 'models');
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(path.join(base, 'decoy.bin'), 'outside the models directory');

    expect(resolveWeights(modelsDir, '../decoy')).toBeNull();
    expect(resolveWeights(modelsDir, '../decoy.bin')).toBeNull();
    expect(resolveWeights(modelsDir, '..\\..\\decoy')).toBeNull();

    // The general property, so a future branch cannot slip past the cases
    // above: any non-null answer lives INSIDE the models directory.
    writeFileSync(path.join(modelsDir, 'ggml-tiny.en-q5_1.bin'), 'weights');
    const inside = resolveWeights(modelsDir, 'tiny.en-q5_1');
    expect(inside).not.toBeNull();
    expect(inside.startsWith(`${path.resolve(modelsDir)}${path.sep}`)).toBe(true);
  });
});
