/**
 * tests/speech/speechArchive.test.js — the zip and tar readers that unpack
 * the ASR engine binaries.
 *
 * These are the code path that turns a downloaded release asset into a
 * working `whisper-cli`, so the tests build REAL archives in memory (a
 * hand-assembled zip with a deflate entry, and a gzipped tar) and read them
 * back. A hand-built fixture is the point: it pins the exact byte layout the
 * reader has to understand, so a change to either side shows up here rather
 * than in a 10 MB download at a user's desk.
 *
 * The security assertions matter as much as the happy path: an archive is
 * attacker-controlled the moment it is served over a network, and the reader
 * is the only thing standing between it and the filesystem.
 */

import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import {
  readZipEntries,
  readTarGzEntries,
  readArchiveEntries,
  flattenPayload,
  isSafeEntryName,
  archiveError,
} from '../../main/speechArchive.js';

/**
 * Build a minimal but structurally real zip in memory.
 *
 * @param {Array<{name: string, data: string, store?: boolean}>} files
 * @returns {Buffer}
 */
function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8');
    const raw = Buffer.from(file.data, 'utf8');
    const store = file.store === true;
    const payload = store ? raw : zlib.deflateRawSync(raw);
    const method = store ? 0 : 8;

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(0, 14); // crc (not verified by the reader)
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    locals.push(local, payload);
    centrals.push(central);
    offset += local.length + payload.length;
  }

  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

/**
 * Build a tar in memory. Names, sizes and a type flag — enough for a real
 * reader.
 *
 * @param {Array<{name: string, data: string, type?: string, link?: string}>} files
 * @returns {Buffer}
 */
function buildTar(files) {
  const blocks = [];

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8');
    const data = Buffer.from(file.data, 'utf8');
    const header = Buffer.alloc(512);
    nameBytes.copy(header, 0);
    header.write('000644 \0', 100);
    header.write('000000 \0', 108);
    header.write('000000 \0', 116);
    header.write(`${data.length.toString(8).padStart(11, '0')} `, 124);
    header.write('00000000000 ', 136);
    header.write('        ', 148);
    header.write(file.type ?? '0', 156);
    // A link's TARGET lives in the header's linkname field (157..256), not
    // in the data block — a symlink has no payload.
    if (file.link !== undefined) header.write(file.link, 157, 'utf8');
    header.write('ustar\0', 257);
    header.write('00', 263);

    // The checksum is the sum of the header bytes with the checksum field
    // treated as spaces. A reader that verifies it needs this to be right.
    header.fill(0x20, 148, 156);
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);

    blocks.push(header);
    const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
    data.copy(padded);
    blocks.push(padded);
  }

  blocks.push(Buffer.alloc(1024)); // end-of-archive marker
  return Buffer.concat(blocks);
}

describe('speechArchive — zip', () => {
  it('reads deflated and stored entries', () => {
    const zip = buildZip([
      { name: 'Release/whisper-cli.exe', data: 'MZ pretend executable' },
      { name: 'Release/whisper.dll', data: 'pretend dll', store: true },
    ]);

    const { files } = readZipEntries(zip);

    expect(files.size).toBe(2);
    expect(files.get('Release/whisper-cli.exe').toString('utf8')).toBe('MZ pretend executable');
    expect(files.get('Release/whisper.dll').toString('utf8')).toBe('pretend dll');
  });

  it('reads a real whisper.cpp release zip shape', () => {
    // The upstream Windows zip stores everything under `Release/` and the
    // reader must keep that path so the payload can be flattened later.
    const zip = buildZip([
      { name: 'Release/whisper-cli.exe', data: 'exe' },
      { name: 'Release/ggml-cpu-x64.dll', data: 'dll' },
      { name: 'Release/lib/keep.txt', data: 'nested' },
    ]);

    const { files } = readZipEntries(zip);
    expect([...files.keys()]).toContain('Release/ggml-cpu-x64.dll');
  });

  it('refuses a file that is not a zip', () => {
    expect(() => readZipEntries(Buffer.from('not a zip at all'))).toThrow(/zip/i);
  });

  it('reports a corrupt archive with a code, not a raw crash', () => {
    const zip = buildZip([{ name: 'a.txt', data: 'hello' }]);
    const damaged = Buffer.from(zip);
    damaged.writeUInt32LE(0, 0); // destroy the local header signature
    try {
      readZipEntries(damaged);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error.code).toBe('corrupt-archive');
    }
  });
});

describe('speechArchive — tar.gz', () => {
  it('reads regular files out of a gzipped tar', () => {
    const tar = buildTar([
      { name: 'whisper-bin-ubuntu-x64/whisper-cli', data: '#!/bin/sh\necho hi\n' },
      { name: 'whisper-bin-ubuntu-x64/libwhisper.so.1', data: 'so bytes' },
    ]);

    const { files } = readTarGzEntries(zlib.gzipSync(tar));

    expect(files.size).toBe(2);
    expect(files.get('whisper-bin-ubuntu-x64/whisper-cli').toString('utf8')).toContain('echo hi');
  });

  it('skips directory entries', () => {
    const tar = buildTar([
      { name: 'pkg/', data: '', type: '5' },
      { name: 'pkg/file.txt', data: 'data' },
    ]);
    const { files } = readTarGzEntries(zlib.gzipSync(tar));
    expect([...files.keys()]).toEqual(['pkg/file.txt']);
  });

  it('collects a link instead of materialising it', () => {
    const tar = buildTar([{ name: 'pkg/real.bin', data: 'real' }, { name: 'pkg/alias.bin', data: '', type: '2', link: 'real.bin' }]);
    const { files, links } = readTarGzEntries(zlib.gzipSync(tar));
    expect(files.has('pkg/alias.bin')).toBe(false);
    expect(links.get('pkg/alias.bin')).toBe('real.bin');
  });

  it('refuses a link that escapes the payload', () => {
    const tar = buildTar([
      { name: 'pkg/real.bin', data: 'real' },
      { name: 'pkg/evil', data: '', type: '2', link: '../../etc/passwd' },
    ]);
    const { files, links } = readTarGzEntries(zlib.gzipSync(tar));
    expect(() => flattenPayload({ files, links }, 'pkg')).toThrow(/outside/i);
  });

  it('reports a corrupt gzip with a code', () => {
    try {
      readTarGzEntries(Buffer.from('definitely not gzip'));
      throw new Error('expected a throw');
    } catch (error) {
      expect(error.code).toBe('corrupt-archive');
    }
  });
});

describe('speechArchive — dispatch and flattening', () => {
  it('dispatches on the archive kind', () => {
    const zip = buildZip([{ name: 'Release/a.txt', data: 'a' }]);
    expect(readArchiveEntries(zip, 'zip').files.size).toBe(1);

    const tar = buildTar([{ name: 'pkg/b.txt', data: 'b' }]);
    expect(readArchiveEntries(zlib.gzipSync(tar), 'tar.gz').files.size).toBe(1);
  });

  it('refuses an unknown archive kind', () => {
    expect(() => readArchiveEntries(Buffer.alloc(4), 'tar.bz2')).toThrow(/not supported/i);
  });

  it('flattens the single top-level payload directory', () => {
    // This is the shape that matters: the whisper binary is dynamically
    // linked and its libraries must land in the SAME directory, so the
    // payload is flattened, not reduced to the one executable.
    const zip = buildZip([
      { name: 'Release/whisper-cli.exe', data: 'exe' },
      { name: 'Release/whisper.dll', data: 'dll' },
    ]);

    const flat = flattenPayload(readZipEntries(zip), 'Release');

    expect([...flat.keys()].sort()).toEqual(['whisper-cli.exe', 'whisper.dll']);
  });

  it('complains when the expected payload directory is missing', () => {
    const zip = buildZip([{ name: 'Other/a.txt', data: 'a' }]);
    expect(() => flattenPayload(readZipEntries(zip), 'Release')).toThrow(/Release/);
  });

  it('resolves a link chain into copies, the way the whisper SONAME chain needs', () => {
    // libwhisper.so -> libwhisper.so.1 -> libwhisper.so.1.9.5
    const tar = buildTar([
      { name: 'pkg/libwhisper.so.1.9.5', data: 'the real library' },
      { name: 'pkg/libwhisper.so.1', data: '', type: '2', link: 'libwhisper.so.1.9.5' },
      { name: 'pkg/libwhisper.so', data: '', type: '2', link: 'libwhisper.so.1' },
    ]);
    const flat = flattenPayload(readTarGzEntries(zlib.gzipSync(tar)), 'pkg');
    expect(flat.get('libwhisper.so.1.9.5').toString('utf8')).toBe('the real library');
    expect(flat.get('libwhisper.so.1').toString('utf8')).toBe('the real library');
    expect(flat.get('libwhisper.so').toString('utf8')).toBe('the real library');
  });

  it('refuses a link cycle', () => {
    const tar = buildTar([
      { name: 'pkg/a', data: '', type: '2', link: 'b' },
      { name: 'pkg/b', data: '', type: '2', link: 'a' },
    ]);
    expect(() => flattenPayload(readTarGzEntries(zlib.gzipSync(tar)), 'pkg')).toThrow();
  });
});

describe('speechArchive — path safety', () => {
  it('accepts ordinary file names', () => {
    expect(isSafeEntryName('whisper-cli')).toBe(true);
    expect(isSafeEntryName('libwhisper.so.1')).toBe(true);
    expect(isSafeEntryName('nested/file.bin')).toBe(true);
  });

  it('rejects every shape that escapes the destination', () => {
    expect(isSafeEntryName('../escape')).toBe(false);
    expect(isSafeEntryName('a/../../escape')).toBe(false);
    expect(isSafeEntryName('/etc/passwd')).toBe(false);
    expect(isSafeEntryName('\\windows\\system32')).toBe(false);
    expect(isSafeEntryName('C:/windows')).toBe(false);
    expect(isSafeEntryName('bad\0name')).toBe(false);
    expect(isSafeEntryName('')).toBe(false);
  });
});

describe('speechArchive — error helper', () => {
  it('tags errors with a code', () => {
    expect(archiveError('corrupt-archive', 'boom').code).toBe('corrupt-archive');
  });
});
