import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BatchedLogWriter } from '../../../main/batchedLogWriter.js';

const makeDir = () => mkdtempSync(path.join(tmpdir(), 'ld-logtest-'));

describe('BatchedLogWriter batching', () => {
  it('batches queued lines into a single file on flush', async () => {
    const dir = makeDir();
    const writer = new BatchedLogWriter(path.join(dir, 'app.log'), { flushIntervalMs: 60000 });
    expect(writer.write('line one')).toBe(true);
    expect(writer.write('line two')).toBe(true);
    expect(writer.pendingLines).toBe(2);
    await writer.flush();
    expect(writer.pendingLines).toBe(0);
    const content = readFileSync(path.join(dir, 'app.log'), 'utf8');
    expect(content).toBe('line one\nline two\n');
    await writer.close();
  });

  it('auto-flushes on the interval without an explicit flush call', async () => {
    const dir = makeDir();
    const writer = new BatchedLogWriter(path.join(dir, 'app.log'), { flushIntervalMs: 20 });
    writer.write('auto');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(readFileSync(path.join(dir, 'app.log'), 'utf8')).toBe('auto\n');
    await writer.close();
  });
});

describe('BatchedLogWriter caps', () => {
  it('rotates past maxFileBytes and retains at most maxRetainedFiles', async () => {
    const dir = makeDir();
    const file = path.join(dir, 'app.log');
    const writer = new BatchedLogWriter(file, {
      flushIntervalMs: 60000,
      maxFileBytes: 100,
      maxRetainedFiles: 2,
    });
    // Push ~5 rotations worth of lines, flushing each batch.
    for (let round = 0; round < 5; round += 1) {
      for (let i = 0; i < 10; i += 1) writer.write(`round-${round}-line-${i}-padding-xyz`);
      await writer.flush();
    }
    await writer.close();
    const entries = readdirSync(dir).filter((n) => n.startsWith('app.log')).sort();
    expect(entries.length).toBeLessThanOrEqual(3); // active + 2 retained
    expect(entries).toContain('app.log');
    for (const name of entries) {
      expect(statSync(path.join(dir, name)).size).toBeGreaterThan(0);
    }
  });

  it('truncates a single giant line so one payload cannot blow the caps', async () => {
    const dir = makeDir();
    const file = path.join(dir, 'app.log');
    const writer = new BatchedLogWriter(file, { flushIntervalMs: 60000, maxLineChars: 100 });
    writer.write(`prefix-${'x'.repeat(100000)}`);
    await writer.flush();
    await writer.close();
    expect(statSync(file).size).toBeLessThan(1000);
    expect(readFileSync(file, 'utf8')).toContain('[truncated]');
  });
});

describe('BatchedLogWriter failure safety', () => {
  it('never throws: closed writer refuses writes, bad paths drop batches', async () => {
    const dir = makeDir();
    const writer = new BatchedLogWriter(path.join(dir, 'app.log'), { flushIntervalMs: 60000 });
    await writer.close();
    expect(writer.write('after close')).toBe(false);
    await expect(writer.flush()).resolves.toBeUndefined();
    await expect(writer.close()).resolves.toBeUndefined();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Unwritable target (a directory) — flush must swallow, not throw.
    const bad = new BatchedLogWriter(path.join(dir), { flushIntervalMs: 60000 });
    bad.write('lost line');
    await expect(bad.flush()).resolves.toBeUndefined();
    expect(bad.droppedWrites).toBeGreaterThan(0);
    await bad.close();
    errSpy.mockRestore();
  });
});

describe('main/logger file wiring', () => {
  let dir;

  beforeEach(() => {
    vi.resetModules();
    dir = makeDir();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const mod = await import('../../../main/logger.js');
    await mod.closeMainLogs();
    mod.configureMainLogFile(null);
  });

  it('persists warn/error lines to the capped log file, console behaviour unchanged', async () => {
    const mod = await import('../../../main/logger.js');
    mod.configureMainLogFile(dir);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const log = mod.default('FileSinkProbe');
    log.warn('sunday warning', { service: '8am' });
    log.error('sunday error');
    log.info('info stays console-only by design');
    await mod.flushMainLogs();
    await mod.closeMainLogs();

    expect(warnSpy).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    const content = readFileSync(path.join(dir, 'lyricdisplay-main.log'), 'utf8');
    expect(content).toContain('[WARN] [FileSinkProbe]');
    expect(content).toContain('sunday warning');
    expect(content).toContain('[ERROR] [FileSinkProbe]');
    expect(content).not.toContain('info stays console-only');
  });

  it('stays console-only when no log dir is configured (tests/plain node)', async () => {
    const mod = await import('../../../main/logger.js');
    mod.configureMainLogFile(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mod.default('NoSink').warn('console only');
    await mod.flushMainLogs();
    expect(warnSpy).toHaveBeenCalled();
    expect(readdirSync(dir)).toHaveLength(0);
  });
});
