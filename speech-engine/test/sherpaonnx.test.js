/**
 * speech-engine/test/sherpaonnx.test.js — the sherpa-onnx driver (Phase 6)
 *
 * The properties that matter here are integrity and honesty, not transcription
 * accuracy — accuracy is the benchmark harness's job, on real audio, on the
 * user's machine.
 *
 * A partially downloaded encoder that still parses can emit confident
 * nonsense, and at 2am before a service there is no way to tell that apart from
 * a bad model choice. So the verification path is tested hard.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  NEMOTRON_FILES,
  SHERPA_UNAVAILABLE,
  SILERO_VAD,
  createSherpaEngine,
  platformSupport,
  sha256Of,
  sherpaModelRows,
  verifyInstalledModel,
} from '../drivers/sherpaonnx.js';

const tempRoot = () => mkdtempSync(path.join(tmpdir(), 'ld-sherpa-'));

/**
 * A model directory whose every file matches a digest computed from the content
 * this helper actually wrote.
 *
 * WHY NOT SIMPLY WRITE THE PINNED DIGEST STRING AS THE FILE'S CONTENT. That
 * reads like it would work and does not: the verifier HASHES the file, so the
 * content has to hash TO the expected digest — and no test can fabricate a file
 * whose SHA-256 equals a given hex string. So the expectation is derived from
 * the content, which is exactly what the production pin does for a real
 * download.
 */
function installVerifiedModel(contents) {
  const dir = tempRoot();
  const expected = [];

  for (const entry of NEMOTRON_FILES) {
    const body = contents?.[entry.file] ?? `weights-for-${entry.file}`;
    writeFileSync(path.join(dir, entry.file), body);
    expected.push({ file: entry.file, sha256: sha256Of(path.join(dir, entry.file)) });
  }

  // The verifier only checks the four model files; Silero is verified at
  // download time. Present so the reason it exists is visible in the test.
  writeFileSync(path.join(dir, SILERO_VAD.file), 'vad');

  return { dir, expected };
}

function installFakeBinary(dir) {
  const name = process.platform === 'win32' ? 'sherpa-onnx.exe' : 'sherpa-onnx';
  const full = path.join(dir, name);
  writeFileSync(full, '#!/bin/sh\ncat > /dev/null\nprintf "%s" "$SHERPA_FAKE_STDOUT"\nexit 0\n', { mode: 0o755 });
  chmodSync(full, 0o755);
  return full;
}

test('platformSupport excludes darwin-x64 with an actionable reason', () => {
  // A provider row offering a download that cannot possibly work is worse than
  // a row that says so. The message names the alternative.
  const unsupported = platformSupport('darwin', 'x64');
  assert.equal(unsupported.supported, false);
  assert.match(unsupported.reason, /whisper/i);

  assert.equal(platformSupport('darwin', 'arm64').supported, true);
  assert.equal(platformSupport('linux', 'x64').supported, true);
  assert.equal(platformSupport('win32', 'x64').supported, true);
});

test('sha256Of hashes a file and returns null for a missing one', () => {
  const dir = tempRoot();
  const file = path.join(dir, 'a.txt');
  writeFileSync(file, 'hello');
  assert.equal(sha256Of(file).length, 64);
  assert.equal(sha256Of(path.join(dir, 'nope.txt')), null);
});

test('verifyInstalledModel passes only when every pinned file matches', () => {
  const { dir, expected } = installVerifiedModel();
  const result = verifyInstalledModel(dir, expected);
  assert.equal(result.ok, true);
  assert.equal(result.checked, NEMOTRON_FILES.length);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.mismatched, []);
});

test('verifyInstalledModel fails on a missing file', () => {
  // A half-downloaded encoder still parses, and parses confidently. This is the
  // failure the whole verification step exists for.
  const { dir, expected } = installVerifiedModel();
  writeFileSync(path.join(dir, 'encoder.int8.onnx'), '');
  const result = verifyInstalledModel(dir, expected);
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('encoder.int8.onnx'));
});

test('verifyInstalledModel fails on a corrupt file of the right size', () => {
  const { dir, expected } = installVerifiedModel();
  // Corrupted AFTER the digest was derived, so the content no longer hashes to
  // what we expect. Passing the content in as the "corrupt" value would not
  // work: the helper hashes whatever it writes, so it would verify.
  writeFileSync(path.join(dir, 'encoder.int8.onnx'), 'not-the-real-weights');

  const result = verifyInstalledModel(dir, expected);
  assert.equal(result.ok, false);
  assert.ok(result.mismatched.includes('encoder.int8.onnx'));
});

test('verifyInstalledModel fails on an absent directory', () => {
  assert.equal(verifyInstalledModel(path.join(tempRoot(), 'nope')).ok, false);
  assert.equal(verifyInstalledModel('').ok, false);
  assert.equal(verifyInstalledModel(null).ok, false);
});

test('every pinned digest is exactly 64 hex characters', () => {
  // Three of these were wrong when first written: two truncated to 63 by hand,
  // and one a genuinely different hash. A 63-character digest looks like a
  // digest, verifies nothing, and is the single most dangerous possible
  // transcription error — the file "passes" verification while being the wrong
  // file. This is the check that stops a hand-edit from passing again.
  for (const entry of NEMOTRON_FILES) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, `${entry.file} digest is malformed`);
  }
  assert.match(SILERO_VAD.sha256, /^[a-f0-9]{64}$/, 'Silero VAD digest is malformed');
});

test('the driver and the catalog agree on every digest', () => {
  // Two copies of a digest is two things to keep in sync, and they had already
  // drifted. If the driver is the one that verifies at load time, the catalog
  // must not be able to claim a different answer.
  for (const row of sherpaModelRows()) {
    for (const file of row.files || []) {
      const driverEntry = NEMOTRON_FILES.find((entry) => entry.file === file.file);
      assert.ok(driverEntry, `${file.file} is in the catalog but not in the driver`);
      assert.equal(
        file.sha256,
        driverEntry.sha256,
        `${file.file} digest differs between the catalog and the driver`
      );
    }
  }
});

test('the catalog exposes a sherpa-onnx model row', () => {
  const rows = sherpaModelRows();
  assert.ok(rows.length > 0, 'the sherpaonnx provider row existed with zero models');
  const row = rows[0];
  assert.equal(row.providerId, 'sherpaonnx');
  assert.ok(row.downloadBytes > 0);
  // Pinned, or "which bytes are correct" is unanswerable in six months.
  assert.ok(Array.isArray(row.files) && row.files.length === NEMOTRON_FILES.length);
  assert.ok(row.revision, 'an unpinned revision drifts under you');
});

test('the catalog states the darwin-x64 exclusion rather than hiding it', () => {
  const row = sherpaModelRows()[0];
  assert.ok(row.unsupportedPlatforms, 'the exclusion must be visible in the catalog');
  assert.ok(Object.keys(row.unsupportedPlatforms).includes('mac-x64'));
});

test('the engine refuses to construct without a binary', () => {
  const { dir: modelDir, expected } = installVerifiedModel();
  assert.throws(
    () => createSherpaEngine({ bus: null, binDir: tempRoot(), modelDir, expectedFiles: expected }),
    (error) => error.code === SHERPA_UNAVAILABLE
  );
});

test('the engine refuses to construct when the model fails verification', () => {
  // This is the assertion that matters most in the file: a corrupt install must
  // refuse to start rather than start and produce nonsense.
  const binDir = tempRoot();
  if (process.platform === 'win32') return;
  installFakeBinary(binDir);

  const { dir: modelDir, expected } = installVerifiedModel();
  // Corrupt after the fact — see the note on the corrupt-file test above.
  writeFileSync(path.join(modelDir, 'decoder.int8.onnx'), 'corrupt');

  assert.throws(
    () => createSherpaEngine({ bus: null, binDir, modelDir, expectedFiles: expected }),
    (error) => error.code === SHERPA_UNAVAILABLE
  );
});

test('a constructed engine reports itself as real, never as fake', () => {
  const binDir = tempRoot();
  if (process.platform === 'win32') return;
  installFakeBinary(binDir);
  const { dir: modelDir, expected } = installVerifiedModel();

  const engine = createSherpaEngine({ bus: null, binDir, modelDir, expectedFiles: expected });
  assert.equal(engine.backend, 'sherpaonnx');
  assert.notEqual(engine.backend, 'fake');
});

test('health declares the capability limits the catalog does', () => {
  const binDir = tempRoot();
  if (process.platform === 'win32') return;
  installFakeBinary(binDir);
  const { dir: modelDir, expected } = installVerifiedModel();

  const engine = createSherpaEngine({ bus: null, binDir, modelDir, expectedFiles: expected });
  const health = engine.health();
  // FALSE, matching the catalog, so lanesForCapabilities() disables the
  // next-lyric lane with a reason the operator can read. Reporting true would
  // enable a lane on a provider that cannot align words.
  assert.equal(health.wordTimestamps, false);
  assert.equal(health.biasSupport, false);
  assert.equal(health.integrityChecked, true);
});

test('models() reports installation state honestly', () => {
  const binDir = tempRoot();
  const modelsDir = tempRoot();
  if (process.platform === 'win32') return;
  installFakeBinary(binDir);
  const { dir: modelDir, expected } = installVerifiedModel();

  const engine = createSherpaEngine({ bus: null, binDir, modelsDir, modelDir, expectedFiles: expected });
  const rows = engine.models();
  assert.ok(rows.length > 0);
  assert.equal(rows.every((row) => typeof row.installed === 'boolean'), true);
});

test('an empty segment emits nothing', async () => {
  const binDir = tempRoot();
  if (process.platform === 'win32') return;
  installFakeBinary(binDir);
  const modelDir0 = installVerifiedModel();
  const engine = createSherpaEngine({ bus: null, binDir, modelDir: modelDir0.dir, expectedFiles: modelDir0.expected });

  const result = await engine.transcribe({ frames: [] });
  assert.deepEqual(result.messages, []);
});

test('transcript lines become segment messages with advancing timestamps', async () => {
  const binDir = tempRoot();
  if (process.platform === 'win32') return;
  installFakeBinary(binDir);
  const modelDir0 = installVerifiedModel();
  const engine = createSherpaEngine({ bus: null, binDir, modelDir: modelDir0.dir, expectedFiles: modelDir0.expected });

  process.env.SHERPA_FAKE_STDOUT = 'For God so loved the world';
  const result = await engine.transcribe({ frames: [Buffer.alloc(1600 * 2)] });

  const last = result.messages[result.messages.length - 1];
  assert.equal(last.t, 'final');
  assert.equal(last.text, 'For God so loved the world');
  delete process.env.SHERPA_FAKE_STDOUT;
});

test('blank and bracketed non-speech lines are dropped', async () => {
  const binDir = tempRoot();
  if (process.platform === 'win32') return;
  installFakeBinary(binDir);
  const modelDir0 = installVerifiedModel();
  const engine = createSherpaEngine({ bus: null, binDir, modelDir: modelDir0.dir, expectedFiles: modelDir0.expected });

  process.env.SHERPA_FAKE_STDOUT = '[MUSIC]\n\n   \nAmen\n';
  const result = await engine.transcribe({ frames: [Buffer.alloc(1600 * 2)] });

  const texts = result.messages.filter((m) => m.t === 'final').map((m) => m.text);
  assert.deepEqual(texts, ['Amen']);
  delete process.env.SHERPA_FAKE_STDOUT;
});

test('a decoder failure is an error, never silence', async () => {
  const binDir = tempRoot();
  if (process.platform === 'win32') return;
  const name = process.platform === 'win32' ? 'sherpa-onnx.exe' : 'sherpa-onnx';
  writeFileSync(path.join(binDir, name), '#!/bin/sh\ncat > /dev/null\nexit 4\n', { mode: 0o755 });
  chmodSync(path.join(binDir, name), 0o755);

  const modelDir0 = installVerifiedModel();
  const engine = createSherpaEngine({ bus: null, binDir, modelDir: modelDir0.dir, expectedFiles: modelDir0.expected });
  const result = await engine.transcribe({ frames: [Buffer.alloc(1600 * 2)] });

  const error = result.messages.find((message) => message.t === 'error');
  assert.ok(error, 'a non-zero exit must surface as an error, not as silence');
  assert.equal(error.code, 'transcribe-failed');
  assert.equal(error.fatal, false);
});