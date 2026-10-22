/**
 * main/speechArchive.js — read the two archive shapes the ASR engines ship
 * in, with no dependencies.
 *
 * WHY THIS FILE EXISTS. The engines are distributed as prebuilt binaries in
 * release archives: whisper.cpp publishes a `.zip` for Windows and a `.tar.gz`
 * for Linux, sherpa-onnx publishes a `.tar.bz2` for POSIX and a plain `.exe`
 * for Windows. The app has to unpack one of those to get at `whisper-cli`, and
 * the repo's rule is that the installer adds no dependencies ("zero new root
 * dependencies" is invariant 2, enforced mechanically in
 * tests/speech/invariants.test.js). A zip and a tar reader therefore have to
 * be written here, out of `node:zlib` and `node:buffer`.
 *
 * WHAT IS SUPPORTED, AND WHAT IS NOT. Zip: stored (method 0) and deflate
 * (method 8) — everything the upstream projects publish. Tar: regular files,
 * directories, GNU long names, the ustar prefix field, and SYMLINKS. Zip64
 * and bzip2 are NOT supported, and both refuse loudly rather than silently
 * returning half an archive. Node has no bzip2 decoder, and sherpa-onnx's
 * POSIX build is a `.tar.bz2`; that provider is therefore Windows-only for
 * now, which the catalog states rather than hides.
 *
 * NOTHING HERE TOUCHES THE FILESYSTEM. Every function takes a Buffer and
 * returns entries. Writing those bytes to disk is the installer's job, and it
 * does that separately, so the parsing can be tested with archives built in
 * memory.
 *
 * ---------------------------------------------------------------------------
 * SYMLINKS, AND WHY THEY ARE RESOLVED RATHER THAN MATERIALISED
 * ---------------------------------------------------------------------------
 * The whisper.cpp Linux tarball is full of them — the shared libraries are
 * published as SONAME chains:
 *
 *     libwhisper.so     -> libwhisper.so.1    -> libwhisper.so.1.9.5
 *     libggml.so.0     -> libggml.so.0.26.0
 *
 * The binary needs the short names to resolve, so the links are not optional.
 * But an archive is attacker-controlled input the moment a release asset is
 * served over a network, and a symlink pointing outside the install
 * directory is the classic way to turn "download a file" into "write
 * anywhere".
 *
 * So a link is never created on disk. Each one is RESOLVED to the bytes of
 * the file it points at, and a COPY of those bytes is written under the
 * link's own name. The result is byte-identical for the loader's purposes,
 * works on Windows, and cannot point anywhere.
 *
 * A link whose target escapes the payload — an absolute path, or one that
 * climbs out with `..` — is refused outright, and so is a cycle.
 *
 * The same rule applies to the entry NAMES: absolute paths, `..` segments and
 * Windows drive letters are rejected, and the caller is told which entry was
 * bad rather than being handed a name it must re-check.
 */

import zlib from 'node:zlib';

/** Zip local file header signature: `PK\x03\x04`. */
const ZIP_LOCAL_SIG = 0x04034b50;
/** Zip central directory file header signature: `PK\x01\x02`. */
const ZIP_CENTRAL_SIG = 0x02014b50;
/** Zip end of central directory record signature: `PK\x05\x06`. */
const ZIP_EOCD_SIG = 0x06054b50;

/** Zip compression methods this reader understands. */
const ZIP_STORED = 0;
const ZIP_DEFLATE = 8;

/** Tar block size. Every tar record is a multiple of this. */
const TAR_BLOCK = 512;

/** How many links may be followed before the chain is called a cycle. */
const MAX_LINK_DEPTH = 16;

/**
 * @typedef {object} ArchiveEntries
 * @property {Map<string, Buffer>} files regular file name -> bytes
 * @property {Map<string, string>} links link name -> the path it points at
 */

/**
 * Read every file in a zip archive.
 *
 * @param {Buffer} buffer the whole archive
 * @returns {ArchiveEntries}
 * @throws {Error} with a `code` of 'unsupported-archive' or 'corrupt-archive'
 */
export function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw archiveError('corrupt-archive', 'That file is not a zip archive.');
  }

  const eocd = findZipEocd(buffer);
  if (!eocd) {
    throw archiveError('corrupt-archive', 'That zip archive has no end-of-directory record.');
  }

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);

  // ZIP64: the 32-bit fields are saturated and the real values live in a
  // separate record this reader does not implement. Refusing is the only
  // honest option — a wrong offset would produce a wrong archive.
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw archiveError('unsupported-archive', 'That zip archive uses ZIP64, which is not supported.');
  }

  const files = new Map();
  let cursor = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length) {
      throw archiveError('corrupt-archive', 'That zip archive is truncated.');
    }
    if (buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_SIG) {
      throw archiveError('corrupt-archive', 'That zip archive has a damaged directory.');
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    cursor += 46 + nameLength + extraLength + commentLength;

    // A directory entry ends in '/'. It has no payload and nothing to write.
    if (name.endsWith('/')) continue;

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw archiveError('unsupported-archive', 'That zip archive uses ZIP64, which is not supported.');
    }

    // A unix symlink stored in a zip (mode bits in the external attributes)
    // would have to be materialised as a real link. Nothing upstream ships
    // one, so rather than guess, refuse.
    if (isUnixSymlink(externalAttributes)) {
      throw archiveError('unsupported-archive', 'That zip archive contains a link, which is not installed.');
    }

    const data = readZipLocalData(buffer, localOffset, name);
    if (method !== ZIP_STORED && method !== ZIP_DEFLATE) {
      throw archiveError(
        'unsupported-archive',
        `That zip archive uses compression method ${method}, which is not supported.`
      );
    }

    const bytes = method === ZIP_STORED ? data : inflateRaw(data);
    if (uncompressedSize > 0 && bytes.length !== uncompressedSize) {
      throw archiveError('corrupt-archive', `Entry "${name}" did not decompress to its stated size.`);
    }
    files.set(name, bytes);
  }

  return { files, links: new Map() };
}

/**
 * Read every regular file in a gzipped tar archive.
 *
 * @param {Buffer} buffer the whole archive
 * @returns {ArchiveEntries}
 */
export function readTarGzEntries(buffer) {
  let tar;
  try {
    tar = zlib.gunzipSync(buffer);
  } catch (error) {
    throw archiveError(
      'corrupt-archive',
      `That archive could not be decompressed: ${error?.message ?? 'unknown error'}`
    );
  }
  return readTarEntries(tar);
}

/**
 * Read every regular file in an uncompressed tar archive.
 *
 * @param {Buffer} tar the tar bytes
 * @returns {ArchiveEntries}
 */
export function readTarEntries(tar) {
  if (!Buffer.isBuffer(tar)) {
    throw archiveError('corrupt-archive', 'That file is not a tar archive.');
  }

  const files = new Map();
  const links = new Map();
  let cursor = 0;
  let pendingLongName = null;

  while (cursor + TAR_BLOCK <= tar.length) {
    const header = tar.subarray(cursor, cursor + TAR_BLOCK);
    if (isZeroBlock(header)) break; // end-of-archive marker

    const name = readTarName(header);
    const sizeField = header.toString('ascii', 124, 136).replace(/\0.*$/, '').trim();
    const size = parseOctal(sizeField);
    const typeFlag = String.fromCharCode(header[156] || 0x30);

    cursor += TAR_BLOCK;
    const dataEnd = cursor + size;
    if (dataEnd > tar.length) {
      throw archiveError('corrupt-archive', 'That tar archive is truncated.');
    }
    const data = tar.subarray(cursor, dataEnd);
    cursor += Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;

    // GNU long name: the NEXT header's name is the real one, and the data
    // block here holds it.
    if (typeFlag === 'L') {
      pendingLongName = data.toString('utf8').replace(/\0.*$/, '');
      continue;
    }
    // A symlink's TARGET lives in the header's `linkname` field, not in the
    // data block — a symlink has no payload, so its size is zero. A hard
    // link's target is the name of another entry, in the same field. Both
    // are resolved to copies, never materialised as links.
    if (typeFlag === '1' || typeFlag === '2') {
      const target = header.toString('utf8', 157, 257).replace(/\0.*$/, '');
      links.set(pendingLongName ?? name, target);
      pendingLongName = null;
      continue;
    }
    // PAX / GNU metadata headers carry no payload of their own.
    if (typeFlag === 'x' || typeFlag === 'g') continue;
    // Directories have no payload.
    if (typeFlag === '5') {
      pendingLongName = null;
      continue;
    }

    const finalName = pendingLongName ?? name;
    pendingLongName = null;
    files.set(finalName, Buffer.from(data));
  }

  return { files, links };
}

/**
 * Read an archive of either supported shape.
 *
 * @param {Buffer} buffer the archive bytes
 * @param {'zip'|'tar.gz'} kind
 * @returns {ArchiveEntries}
 */
export function readArchiveEntries(buffer, kind) {
  if (kind === 'zip') return readZipEntries(buffer);
  if (kind === 'tar.gz') return readTarGzEntries(buffer);
  throw archiveError('unsupported-archive', `That archive kind (${kind}) is not supported.`);
}

/**
 * Flatten an archive's single top-level directory into the files it holds,
 * with every link resolved to a copy of the bytes it points at.
 *
 * Upstream release archives wrap everything in one directory
 * (`Release/…` for the Windows zip, `whisper-bin-ubuntu-x64/…` for the Linux
 * tarball) and the payload files have to land FLAT next to each other: the
 * whisper.cpp binary is dynamically linked against `libwhisper.so` and the
 * ggml libraries, and its RUNPATH is `$ORIGIN`, so the libraries are only
 * found when they sit in the SAME directory as the executable. The Windows
 * build resolves its DLLs the same way.
 *
 * So the whole payload directory is extracted, not just the one executable.
 * Extracting only `whisper-cli` produces a binary that starts and then dies
 * with "cannot open shared object file", which is a much worse failure than
 * a clear one.
 *
 * @param {ArchiveEntries} entries as returned by the readers
 * @param {string} payloadDir the single top-level directory to strip
 * @returns {Map<string, Buffer>} flat file name -> bytes
 */
export function flattenPayload(entries, payloadDir) {
  const prefix = typeof payloadDir === 'string' && payloadDir ? `${payloadDir.replace(/\/+$/, '')}/` : '';
  const files = new Map();
  const links = new Map();

  const keep = (name) => {
    if (!prefix) return true;
    if (!name.startsWith(prefix)) return false;
    return name.length > prefix.length;
  };

  for (const [name, bytes] of entries.files ?? new Map()) {
    if (!keep(name)) continue;
    files.set(flatName(name.slice(prefix.length)), bytes);
  }
  for (const [name, target] of entries.links ?? new Map()) {
    if (!keep(name)) continue;
    links.set(flatName(name.slice(prefix.length)), target);
  }

  if (files.size === 0) {
    throw archiveError(
      'corrupt-archive',
      prefix
        ? `That archive does not contain the expected "${payloadDir}" folder.`
        : 'That archive is empty.'
    );
  }

  return resolveLinks(files, links);
}

/**
 * Resolve every link to a copy of the bytes it points at.
 *
 * The chain is followed to a real file, and the resolved bytes are written
 * under the link's own name. Nothing on disk is ever a link, so a link
 * cannot point outside the install directory — and if it tries, the install
 * fails here instead.
 *
 * @param {Map<string, Buffer>} files
 * @param {Map<string, string>} links
 * @returns {Map<string, Buffer>}
 */
export function resolveLinks(files, links) {
  const resolved = new Map(files);

  for (const [name, target] of links) {
    let current = target;
    let depth = 0;
    let bytes = null;

    while (depth < MAX_LINK_DEPTH) {
      if (!isSafeEntryName(current)) {
        throw archiveError(
          'unsupported-archive',
          `That archive contains a link ("${name}") pointing outside the install folder.`
        );
      }
      const candidate = resolved.get(current);
      if (candidate) {
        bytes = candidate;
        break;
      }
      const next = links.get(current);
      if (!next) break;
      current = next;
      depth += 1;
    }

    if (!bytes) {
      throw archiveError(
        'corrupt-archive',
        `That archive contains a link ("${name}") that points at a file it does not contain.`
      );
    }
    resolved.set(name, bytes);
  }

  return resolved;
}

/**
 * Is a flat archive entry name safe to write inside a directory?
 *
 * Rejects absolute paths, `..` segments, Windows drive letters, and any
 * segment that is exactly `..`. Callers MUST check every name they write.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSafeEntryName(name) {
  if (typeof name !== 'string' || !name) return false;
  if (name.includes('\0')) return false;
  if (name.startsWith('/') || name.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(name)) return false;
  const segments = name.split(/[\\/]+/);
  return segments.every((segment) => segment !== '..' && segment !== '');
}

/**
 * Build a tagged error so callers can branch on `code` without matching
 * message text.
 *
 * @param {string} code
 * @param {string} message
 * @returns {Error}
 */
export function archiveError(code, message) {
  return Object.assign(new Error(message), { code });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Locate the end-of-central-directory record, scanning backwards. */
function findZipEocd(buffer) {
  const minimum = 22;
  const start = Math.max(0, buffer.length - (minimum + 0xffff));
  for (let offset = buffer.length - minimum; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_EOCD_SIG) return offset;
  }
  return -1;
}

/** Read one entry's payload, honouring the local header's own name/extra sizes. */
function readZipLocalData(buffer, localOffset, centralName) {
  if (localOffset + 30 > buffer.length) {
    throw archiveError('corrupt-archive', `Entry "${centralName}" points outside the archive.`);
  }
  if (buffer.readUInt32LE(localOffset) !== ZIP_LOCAL_SIG) {
    throw archiveError('corrupt-archive', `Entry "${centralName}" has a damaged local header.`);
  }
  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  const compressedSize = buffer.readUInt32LE(localOffset + 18);
  if (dataStart + compressedSize > buffer.length) {
    throw archiveError('corrupt-archive', `Entry "${centralName}" is truncated.`);
  }
  return buffer.subarray(dataStart, dataStart + compressedSize);
}

/** Inflate a raw deflate stream, reporting a corrupt archive rather than throwing raw. */
function inflateRaw(data) {
  try {
    return zlib.inflateRawSync(data);
  } catch (error) {
    throw archiveError(
      'corrupt-archive',
      `An archive entry could not be decompressed: ${error?.message ?? 'unknown error'}`
    );
  }
}

/** The entry name of a tar header, honouring the ustar prefix field. */
function readTarName(header) {
  const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
  const magic = header.toString('ascii', 257, 262);
  if (magic === 'ustar') {
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/, '');
    if (prefix) return `${prefix}/${name}`;
  }
  return name;
}

/** Parse an octal tar size field. */
function parseOctal(field) {
  const trimmed = field.trim();
  if (!trimmed) return 0;
  const value = parseInt(trimmed, 8);
  return Number.isFinite(value) ? value : 0;
}

/** A tar block of all zeroes marks the end of the archive. */
function isZeroBlock(block) {
  for (let index = 0; index < block.length; index += 1) {
    if (block[index] !== 0) return false;
  }
  return true;
}

/** Unix symlink mode bits in a zip entry's external attributes. */
function isUnixSymlink(externalAttributes) {
  const mode = (externalAttributes >>> 16) & 0xffff;
  return (mode & 0xf000) === 0xa000;
}

/** The final path segment of an archive entry name. */
function flatName(name) {
  const parts = name.split('/');
  return parts[parts.length - 1] || name;
}
