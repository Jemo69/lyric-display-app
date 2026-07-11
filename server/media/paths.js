import fs from 'fs';
import path from 'path';

export function createMediaPaths({ dataRoot }) {
  const uploadsRoot = path.join(dataRoot, 'uploads');
  const backgroundMediaDir = path.join(uploadsRoot, 'backgrounds');
  const userMediaRoot = path.join(uploadsRoot, 'user-media');
  const userImageMediaDir = path.join(userMediaRoot, 'images');
  const userVideoMediaDir = path.join(userMediaRoot, 'videos');

  fs.mkdirSync(backgroundMediaDir, { recursive: true });
  fs.mkdirSync(userImageMediaDir, { recursive: true });
  fs.mkdirSync(userVideoMediaDir, { recursive: true });

  return {
    uploadsRoot,
    backgroundMediaDir,
    userImageMediaDir,
    userVideoMediaDir,
  };
}

