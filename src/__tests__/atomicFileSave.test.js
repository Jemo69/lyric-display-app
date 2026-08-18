import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMock = vi.hoisted(() => ({
  chmod: vi.fn().mockResolvedValue(),
  link: vi.fn().mockResolvedValue(),
  lstat: vi.fn(),
  open: vi.fn(),
  rename: vi.fn().mockResolvedValue(),
  rm: vi.fn().mockResolvedValue()
}));

vi.mock('fs/promises', () => ({ ...fsMock, default: fsMock }));

import { saveTextFileAtomically, ATOMIC_FILE_SAVE_MODES } from '../../main/atomicFileSave.js';

function fakeHandle() {
  return {
    writeFile: vi.fn().mockResolvedValue(),
    sync: vi.fn().mockResolvedValue(),
    close: vi.fn().mockResolvedValue()
  };
}

describe('atomicFileSave create mode on filesystems without hard links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.link.mockResolvedValue();
    fsMock.open.mockResolvedValue(fakeHandle());
  });

  it('promotes with a hard link when the filesystem supports it', async () => {
    const result = await saveTextFileAtomically('/tmp/dir/new-song.txt', 'content', { mode: ATOMIC_FILE_SAVE_MODES.create });

    expect(fsMock.link).toHaveBeenCalledWith(expect.stringContaining('.tmp'), '/tmp/dir/new-song.txt');
    expect(fsMock.open).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: true, replaced: false });
  });

  it('falls back to exclusive open-and-write when the drive rejects hard links (EXDEV)', async () => {
    fsMock.link.mockRejectedValueOnce(Object.assign(new Error('EXDEV'), { code: 'EXDEV' }));

    const result = await saveTextFileAtomically('/tmp/usb/new-song.txt', 'fallback content', { mode: ATOMIC_FILE_SAVE_MODES.create });

    expect(fsMock.open).toHaveBeenCalledWith('/tmp/usb/new-song.txt', 'wx', 0o666);
    expect(result).toEqual({ created: true, replaced: false });
    expect(fsMock.rm).toHaveBeenCalled();
  });

  it('falls back when the drive reports EPERM instead of EXDEV', async () => {
    fsMock.link.mockRejectedValueOnce(Object.assign(new Error('EPERM'), { code: 'EPERM' }));

    const result = await saveTextFileAtomically('/tmp/usb/new-song.txt', 'content', { mode: ATOMIC_FILE_SAVE_MODES.create });

    expect(result).toEqual({ created: true, replaced: false });
  });

  it('surfaces FILE_EXISTS when the destination appears during a link-promoted save', async () => {
    fsMock.link.mockRejectedValueOnce(Object.assign(new Error('EEXIST'), { code: 'EEXIST' }));

    await expect(
      saveTextFileAtomically('/tmp/dir/taken.txt', 'content', { mode: ATOMIC_FILE_SAVE_MODES.create })
    ).rejects.toMatchObject({ code: 'FILE_EXISTS' });
  });

  it('surfaces FILE_EXISTS when the exclusive fallback races with another writer', async () => {
    fsMock.link.mockRejectedValueOnce(Object.assign(new Error('EPERM'), { code: 'EPERM' }));
    fsMock.open
      .mockResolvedValueOnce(fakeHandle())
      .mockRejectedValueOnce(Object.assign(new Error('EEXIST'), { code: 'EEXIST' }));

    await expect(
      saveTextFileAtomically('/tmp/usb/taken.txt', 'content', { mode: ATOMIC_FILE_SAVE_MODES.create })
    ).rejects.toMatchObject({ code: 'FILE_EXISTS' });
  });
});