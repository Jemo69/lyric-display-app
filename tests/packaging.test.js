import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * tests/packaging.test.js — the packaged-backend boundary.
 *
 * Regression guard for the v6.16.0 white/blue-screen outage: server/events.js
 * imported `../main/diagnosticsLog.js`. That resolves in dev (repo layout),
 * but in packaged builds the server ships UNPACKED while main/ stays INSIDE
 * the asar — so the forked backend crashed on startup with
 * ERR_MODULE_NOT_FOUND, the health check never passed, and every window
 * showed a blank screen with "backend is not working".
 *
 * Production resolution roots for the unpacked server are server/ and
 * shared/ only (see electron-builder asarUnpack + resolveProductionPath).
 * Anything under server/ or shared/ importing from ../main WILL boot fine
 * in dev and die in production — this test fails the build if that happens.
 *
 * The backend's wire surface (HTTP routes, socket events, persisted state
 * shape) is version-agnostic by design: fixes behind this boundary never
 * change what older remotes, outputs, or stored data expect.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const FORBIDDEN_MAIN_IMPORTS = [
  /from\s+['"]\.\.\/main[^'"]*['"]/,
  /import\s*\(\s*['"]\.\.\/main[^'"]*['"]\s*\)/,
  /require\s*\(\s*['"]\.\.\/main[^'"]*['"]\s*\)/,
];

async function listJsFiles(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await listJsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

describe('packaged-backend boundary', () => {
  it('server/ and shared/ never import from main/ (breaks packaged backend, works in dev)', async () => {
    const offenders = [];
    for (const sub of ['server', 'shared']) {
      const files = await listJsFiles(path.join(repoRoot, sub));
      for (const file of files) {
        const text = await fs.readFile(file, 'utf8');
        if (FORBIDDEN_MAIN_IMPORTS.some((re) => re.test(text))) {
          offenders.push(path.relative(repoRoot, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
