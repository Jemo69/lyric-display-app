import { appendFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Batched async log writer with size + retention caps (missing-feature #05,
 * piece 2 of 3).
 *
 * Why this exists: the main process currently logs to console only, and any
 * file logging added ad hoc would grow unbounded across rehearsal plus two
 * services (the log-bloat half of card #05). This writer batches appends on a
 * short interval so hot log paths never await disk per line, rotates the file
 * when it passes `maxFileBytes`, and retains at most `maxRetainedFiles`
 * rotated siblings (`<name>.1`, `<name>.2`, …).
 *
 * Hard guarantees:
 * - Public methods never throw to the caller. Internal I/O failures are
 *   swallowed after a best-effort console.error so logging can never crash
 *   or wedge the app.
 * - Single lines are truncated to `maxLineChars` so one giant payload cannot
 *   blow past the caps in a single write.
 * - The flush timer is unref'd so the writer never holds the process open.
 * - Callers must never pass secrets (tokens, keys, JWTs) — this writer
 *   persists exactly what it is given. See CONTRIBUTING.md logging rules.
 */

export const DEFAULT_LOG_WRITER_OPTIONS = {
  /** Rotate when the active file passes this size. */
  maxFileBytes: 2 * 1024 * 1024,
  /** Keep this many rotated siblings besides the active file. */
  maxRetainedFiles: 3,
  /** Flush cadence for queued lines. */
  flushIntervalMs: 1000,
  /** Flush immediately once the queued batch reaches this size. */
  maxBatchBytes: 64 * 1024,
  /** Truncate any single line past this length. */
  maxLineChars: 8000,
};

const toLogLine = (line, maxLineChars) => {
  let text;
  if (typeof line === 'string') text = line;
  else {
    try {
      text = JSON.stringify(line);
    } catch {
      text = String(line);
    }
  }
  if (text.length > maxLineChars) text = `${text.slice(0, maxLineChars)}…[truncated]`;
  return text.endsWith('\n') ? text : `${text}\n`;
};

export class BatchedLogWriter {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.options = { ...DEFAULT_LOG_WRITER_OPTIONS, ...options };
    this.queue = [];
    this.queuedBytes = 0;
    this.timer = null;
    this.flushing = false;
    this.closed = false;
    this.droppedWrites = 0;
  }

  /** Queue a line for async append. Returns false when closed. Never throws. */
  write(line) {
    try {
      if (this.closed) return false;
      const text = toLogLine(line, this.options.maxLineChars);
      this.queue.push(text);
      this.queuedBytes += Buffer.byteLength(text, 'utf8');
      if (this.queuedBytes >= this.options.maxBatchBytes) {
        void this.flush();
      } else {
        this.scheduleFlush();
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Number of lines currently queued (introspection for tests/health). */
  get pendingLines() {
    return this.queue.length;
  }

  scheduleFlush() {
    try {
      if (this.timer || this.closed) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.options.flushIntervalMs);
      if (typeof this.timer.unref === 'function') this.timer.unref();
    } catch {
      // Timer setup must never break logging.
    }
  }

  /** Append the queued batch, rotating first when over the size cap. */
  async flush() {
    if (this.flushing) return;
    if (this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue;
    this.queue = [];
    this.queuedBytes = 0;
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await this.rotateIfNeeded();
      await appendFile(this.filePath, batch.join(''), 'utf8');
    } catch (error) {
      this.droppedWrites += batch.length;
      try {
        console.error('[BatchedLogWriter] flush failed, dropping batch:', error?.message || error);
      } catch {
        // Logging the logging failure must not throw either.
      }
    } finally {
      this.flushing = false;
    }
    // A slow producer may have queued more while we flushed.
    if (this.queue.length > 0 && !this.closed) this.scheduleFlush();
  }

  async currentSizeBytes() {
    try {
      const info = await stat(this.filePath);
      return info.size;
    } catch {
      return 0;
    }
  }

  async rotateIfNeeded() {
    try {
      const size = await this.currentSizeBytes();
      if (size < this.options.maxFileBytes) {
        // Prune stray rotations left by older un-capped runs.
        await this.pruneRotations();
        return;
      }
      const { maxRetainedFiles } = this.options;
      const oldest = `${this.filePath}.${maxRetainedFiles}`;
      await rm(oldest, { force: true });
      for (let i = maxRetainedFiles - 1; i >= 1; i -= 1) {
        const from = `${this.filePath}.${i}`;
        const to = `${this.filePath}.${i + 1}`;
        try {
          await rename(from, to);
        } catch {
          // Missing sibling — nothing to shift.
        }
      }
      await rename(this.filePath, `${this.filePath}.1`);
      await this.pruneRotations();
    } catch {
      // Rotation is best-effort; the append still proceeds.
    }
  }

  async pruneRotations() {
    try {
      const dir = path.dirname(this.filePath);
      const base = path.basename(this.filePath);
      const entries = await readdir(dir);
      const stale = entries.filter((name) => {
        if (!name.startsWith(`${base}.`)) return false;
        const suffix = Number(name.slice(base.length + 1));
        return Number.isInteger(suffix) && suffix > this.options.maxRetainedFiles;
      });
      await Promise.all(stale.map((name) => rm(path.join(dir, name), { force: true })));
    } catch {
      // Best-effort.
    }
  }

  /** Flush remaining lines and stop the timer. Never throws. */
  async close() {
    try {
      this.closed = true;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      await this.flush();
    } catch {
      // Ignore.
    }
  }
}

export default BatchedLogWriter;
