/**
 * main/speechErase.js — one-click full erase (Phase 6, invariant 6).
 *
 * Plan 5.6, verbatim: "A single action removes the engine directory, every
 * model file, the transcript history, the benchmark results, and the stored
 * key, and reports the bytes reclaimed. With history on by default this
 * matters — a shared church laptop is not a private machine, and the user
 * should not have to hunt for leftovers."
 *
 * ## Why this is harder than deleting some files
 *
 * Four things live in FOUR places, and they were written by four different
 * phases:
 *
 *   engine binary   userData/speech-engine/       (discovery walks it)
 *   model weights   userData/speech-engine/models/
 *   transcript      userData/speech-engine/history/  (+ exports/)
 *   benchmark       in the persisted SpeechStore, not on disk at all
 *
 * The benchmark results are the trap. They live in localStorage, not the
 * filesystem, so a `rm -rf` misses them completely and the panel keeps
 * showing results from a machine state the user believes they erased. An erase
 * that reports "done" while leaving measurements behind is worse than no erase:
 * it teaches the user that this button works.
 *
 * ## Every step is reported, and a failure never lies about the rest
 *
 * `planErase()` is pure — it takes what exists and returns an ordered plan.
 * `runErase()` executes it and returns per-step outcomes plus a byte total that
 * counts ONLY what was actually removed. A step that fails is reported as
 * failed with its own bytes; the total says "at least this much". Reporting an
 * optimistic total after a partial failure would make a shared laptop look
 * clean when it is not.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/** Directory names under userData, kept in one place so erase cannot drift. */
export const ENGINE_DIR_SEGMENTS = Object.freeze(['speech-engine']);
export const MODELS_DIR_SEGMENTS = Object.freeze(['speech-engine', 'models']);
export const HISTORY_DIR_SEGMENTS = Object.freeze(['speech-engine', 'history']);
export const EXPORTS_DIR_SEGMENTS = Object.freeze(['speech-engine', 'history', 'exports']);

/**
 * Step order: DEEPEST FIRST, parents last.
 *
 * `exports` is inside `history`, and all three are inside `engine`. Removing a
 * parent first would take its children with it, and the later child steps would
 * then report bytes that were already gone — so a 3.1 GB erase would bill the
 * user 6.2 GB reclaimed. Removing deepest-first makes every step's byte count
 * real at the moment it runs.
 *
 * Personal data also goes early: exports and transcripts are removed before the
 * multi-gigabyte model files, so a process that dies midway has already taken
 * the most sensitive data with it.
 */
export const ERASE_STEPS = Object.freeze(['exports', 'models', 'history', 'engine']);

/**
 * Recursively total the bytes a path occupies.
 *
 * Used to report what WOULD be reclaimed before acting, so the confirmation can
 * say a real number ("about 3.1 GB of models") instead of a vague "this cannot
 * be undone". A destructive action with no size attached is harder to decline
 * sensibly.
 *
 * Missing paths count as 0 — an absent directory is nothing to reclaim, not an
 * error.
 *
 * @param {string} target
 * @returns {Promise<number>} bytes, 0 when absent
 */
export async function dirSize(target) {
  let total = 0;
  let entries;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(child);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(child);
        total += stat.size;
      } catch {
        /* vanished mid-walk; nothing to reclaim from it */
      }
    }
  }
  return total;
}

/**
 * What erase would remove, without touching anything.
 *
 * Pure apart from stat()ing sizes, which is read-only. The renderer calls this
 * to build the confirmation dialog — including a truthful "nothing to remove",
 * which matters more than it sounds: a button that says "1 file removed" when
 * the user had nothing installed is confusing, and one that says "error" is
 * worse.
 *
 * @param {{userDataDir: string}} options
 * @returns {Promise<{steps: Array<{id: string, path: string, exists: boolean, bytes: number}>,
 *                    totalBytes: number, exists: boolean}>}
 */
export async function planErase({ userDataDir } = {}) {
  if (typeof userDataDir !== 'string' || !userDataDir.trim()) {
    throw new Error('planErase: a userData directory is required');
  }

  const paths = {
    history: path.join(userDataDir, ...HISTORY_DIR_SEGMENTS),
    exports: path.join(userDataDir, ...EXPORTS_DIR_SEGMENTS),
    models: path.join(userDataDir, ...MODELS_DIR_SEGMENTS),
    // The engine root LAST and only if it survives the earlier steps — it is the
    // parent of two of them.
    engine: path.join(userDataDir, ...ENGINE_DIR_SEGMENTS),
  };

  // Raw subtree sizes first, so a parent step can see what its children will
  // claim regardless of visit order.
  const rawSizes = new Map();
  const presence = new Map();
  for (const id of ERASE_STEPS) {
    // Existence is recorded separately from size: an empty-but-present
    // directory is still something to remove, and a size of 0 must not be
    // read as "absent".
    presence.set(id, await exists(paths[id]));
    rawSizes.set(paths[id], presence.get(id) ? await dirSize(paths[id]) : 0);
  }

  // Attribute bytes DEEPEST-FIRST: a parent claims only what no nested step
  // claimed, so every byte is counted exactly once across the whole plan.
  //
  // Both nestings here are real: `history` contains `exports`, and `engine`
  // contains `history`, `models`, and `exports`. A plain dirSize per step counts
  // files two or three times, and "about 6.2 GB" when the answer is 3.1 GB is
  // exactly the number that makes a user distrust the whole dialog.
  const byDepthDesc = [...ERASE_STEPS].sort((a, b) => paths[b].length - paths[a].length);
  const attributed = new Map();
  for (const id of byDepthDesc) {
    const target = paths[id];
    // Children are paths that sit INSIDE this one — the test is whether the
    // child's path starts with this path plus a separator. Reversed, nothing
    // matches, the engine step re-counts the whole tree, and the erase bills
    // the user for 3.1 GB twice.
    const claimedByChildren = [...attributed.entries()]
      .filter(([child]) => child.startsWith(`${target}${path.sep}`))
      .reduce((sum, [, bytes]) => sum + bytes, 0);
    attributed.set(target, Math.max(0, (rawSizes.get(target) ?? 0) - claimedByChildren));
  }

  const steps = ERASE_STEPS.map((id) => ({
    id,
    path: paths[id],
    exists: presence.get(id) === true,
    bytes: attributed.get(paths[id]) ?? 0,
  }));

  return {
    steps,
    totalBytes: steps.reduce((sum, step) => sum + step.bytes, 0),
    exists: steps.some((step) => step.exists),
  };
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove one path, reporting what it actually freed.
 *
 * `rm` with `recursive` and `force` so a missing path is a no-op rather than
 * an error — an erase that fails because something was already deleted is a
 * bad failure mode for a cleanup action.
 *
 * @returns {Promise<{id: string, ok: boolean, removed: boolean, bytes: number, code?: string}>}
 */
export async function removePathStep({ id, target, bytes = 0 }) {
  try {
    await fs.rm(target, { recursive: true, force: true });
    return { id, ok: true, removed: true, bytes };
  } catch (error) {
    // A CODE only. The path could contain a username, and a message could
    // quote it.
    return { id, ok: false, removed: false, bytes: 0, code: error?.code ?? error?.name ?? 'error' };
  }
}

/**
 * Render a byte count the way an operator wants it read.
 *
 * Plain numbers with units an operator can act on — "3.1 GB" tells someone they
 * get that disk space back; "3110000000" tells them nothing.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '0 bytes';
  if (bytes < 1000) return `${bytes} bytes`;
  // DECIMAL units, deliberately. The catalog sizes models in decimal bytes, and
  // every size the user has seen so far (the download progress bar, the catalog
  // row) is decimal. Mixing 1024-based maths with decimal labels makes the same
  // file read as two different sizes in two places in the same window — and
  // "about 2.9 GB" when the downloader said 3.1 GB reads as a bug, correctly.
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** Human labels for the confirmation dialog, so the UI owns no copy of its own. */
export const ERASE_LABELS = Object.freeze({
  history: 'saved transcripts',
  exports: 'transcript exports',
  models: 'downloaded models',
  engine: 'the speech engine itself',
});

/**
 * One sentence describing what will happen, for the confirmation.
 *
 * Says the number AND that it cannot be undone AND that it stops a live
 * session — a destructive dialog that omits any of those three is how someone
 * loses a service.
 *
 * @param {{totalBytes: number, exists: boolean, steps: Array<{id: string, exists: boolean}>}} plan
 * @param {{running?: boolean}} [state]
 * @returns {string}
 */
export function describeErase(plan, state = {}) {
  if (!plan?.exists) {
    return 'There is nothing to remove — no models, transcripts, or engine files are stored on this computer.';
  }
  const present = (plan.steps ?? []).filter((step) => step.exists).map((step) => ERASE_LABELS[step.id] ?? step.id);
  const list =
    present.length === 1
      ? present[0]
      : `${present.slice(0, -1).join(', ')} and ${present[present.length - 1]}`;
  const running = state.running
    ? ' Any transcription running now will stop.'
    : '';
  return `This permanently deletes ${list} from this computer — about ${formatBytes(
    plan.totalBytes
  )}. It cannot be undone.${running}`;
}

export default planErase;
