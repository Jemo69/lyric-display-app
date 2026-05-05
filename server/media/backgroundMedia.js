import fs from 'fs';
import path from 'path';

export function createBackgroundMediaService({ backgroundMediaDir }) {
  const cleanupOldMediaFiles = async (outputKey) => {
    try {
      const files = await fs.promises.readdir(backgroundMediaDir);
      const pattern = new RegExp(`^${outputKey}-(output[12])-\\d+-[a-f0-9-]+\\.(jpg|jpeg|png|gif|webp|avif|mp4|webm|ogg|mov)$`, 'i');

      for (const file of files) {
        if (pattern.test(file)) {
          const filePath = path.join(backgroundMediaDir, file);
          await fs.promises.unlink(filePath);
          console.log(`Cleaned up old media file: ${file}`);
        }
      }
    } catch (error) {
      console.warn('Media cleanup warning (non-critical):', error.message);
    }
  };

  return { cleanupOldMediaFiles };
}

