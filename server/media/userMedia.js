import fs from 'fs';
import path from 'path';
import { inferMediaKind, inferMimeTypeFromFilename } from './mediaTypes.js';

export function createUserMediaService({ userImageMediaDir, userVideoMediaDir }) {
  const mediaTypeDirectories = {
    image: userImageMediaDir,
    video: userVideoMediaDir,
  };

  const getMediaDirectory = (type) => mediaTypeDirectories[type] || null;

  const safeMediaFilename = (filename = '') => {
    const base = path.basename(String(filename));
    return base && base === filename && !base.includes('..') ? base : null;
  };

  const toUserMediaPayload = async (type, filename) => {
    const directory = getMediaDirectory(type);
    if (!directory) return null;
    const stats = await fs.promises.stat(path.join(directory, filename));
    const mimeType = inferMimeTypeFromFilename(filename);
    const originalName = filename.replace(/^media-\d+-[a-f0-9-]+-/, '');
    return {
      id: `${type}:${filename}`,
      type,
      name: originalName || filename,
      filename,
      url: `/media/user-media/${type === 'image' ? 'images' : 'videos'}/${filename}`,
      mimeType,
      size: stats.size,
      uploadedAt: stats.birthtimeMs || stats.mtimeMs,
    };
  };

  const listUserMedia = async (requestedType = 'all') => {
    const types = requestedType === 'all'
      ? ['image', 'video']
      : [requestedType].filter((type) => type === 'image' || type === 'video');

    if (types.length === 0) {
      const error = new Error('Invalid media type');
      error.statusCode = 400;
      throw error;
    }

    const entries = [];
    for (const type of types) {
      const directory = getMediaDirectory(type);
      const filenames = await fs.promises.readdir(directory);
      const payloads = await Promise.all(
        filenames
          .filter((filename) => {
            const mimeType = inferMimeTypeFromFilename(filename);
            return type === inferMediaKind(mimeType);
          })
          .map((filename) => toUserMediaPayload(type, filename).catch(() => null))
      );
      entries.push(...payloads.filter(Boolean));
    }

    entries.sort((a, b) => Number(b.uploadedAt || 0) - Number(a.uploadedAt || 0));
    return entries;
  };

  const deleteUserMedia = async (type, requestedFilename) => {
    const filename = safeMediaFilename(requestedFilename);
    const directory = getMediaDirectory(type);
    if (!directory || !filename) {
      const error = new Error('Invalid media reference');
      error.statusCode = 400;
      throw error;
    }

    await fs.promises.unlink(path.join(directory, filename));
  };

  const deleteAllUserMedia = async (requestedType = 'all') => {
    const types = requestedType === 'all'
      ? ['image', 'video']
      : [requestedType].filter((type) => type === 'image' || type === 'video');

    if (types.length === 0) {
      const error = new Error('Invalid media type');
      error.statusCode = 400;
      throw error;
    }

    let deleted = 0;
    for (const type of types) {
      const directory = getMediaDirectory(type);
      const filenames = await fs.promises.readdir(directory);
      await Promise.all(filenames.map(async (filename) => {
        const mimeType = inferMimeTypeFromFilename(filename);
        if (type !== inferMediaKind(mimeType)) return;
        await fs.promises.unlink(path.join(directory, filename));
        deleted += 1;
      }));
    }

    return deleted;
  };

  return {
    getMediaDirectory,
    toUserMediaPayload,
    listUserMedia,
    deleteUserMedia,
    deleteAllUserMedia,
  };
}

