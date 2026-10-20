import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgPath = path.resolve(__dirname, '../package.json');
const readmePath = path.resolve(__dirname, '../README.md');
const guidePath = path.resolve(__dirname, '../INSTALLATION.md');
const openapiPath = path.resolve(__dirname, '../docs/openapi.yaml');
const asyncapiPath = path.resolve(__dirname, '../docs/asyncapi.yaml');

function getCurrentVersion() {
  if (!fs.existsSync(pkgPath)) return '0.0.0';
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.version;
}

function updateCopyrightYear(content) {
  const currentYear = new Date().getFullYear();
  // Match patterns like "© 2025", "Copyright © 2025", "© 2024", etc.
  return content.replace(
    /(©\s*)(\d{4})/g,
    `$1${currentYear}`
  );
}

/**
 * A version as written in the docs, INCLUDING any prerelease/build suffix.
 *
 * The suffix is the point. A bare `\d+\.\d+\.\d+` matches only the numeric
 * prefix of `6.11.0-nightly.1`, so bumping to `6.11.0-nightly.2` rewrote the
 * number and left `-nightly.1` glued behind it: the docs then read
 * `6.11.0-nightly.1-nightly.2`, and every subsequent nightly bump appends one
 * more. Defined once so all four documents agree.
 */
const VERSION_PATTERN = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;

function updateVersionNumbers(version) {
  if (!version) version = getCurrentVersion();

  if (fs.existsSync(readmePath)) {
    let content = fs.readFileSync(readmePath, 'utf8');
    content = content.replace(
      new RegExp(String.raw`(\*\*Version:\*\*\s*)(${VERSION_PATTERN})`, 'i'),
      `$1${version}`
    );
    content = updateCopyrightYear(content);
    fs.writeFileSync(readmePath, content);
    console.log(`ƒo. Updated README.md to version ${version}`);
  }

  if (fs.existsSync(guidePath)) {
    let content = fs.readFileSync(guidePath, 'utf8');
    content = content.replace(
      new RegExp(String.raw`(Version:\s*)(${VERSION_PATTERN})`, 'i'),
      `$1${version}`
    );
    content = updateCopyrightYear(content);
    fs.writeFileSync(guidePath, content);
    console.log(`ƒo. Updated Installation Guide to version ${version}`);
  }

  if (fs.existsSync(openapiPath)) {
    let content = fs.readFileSync(openapiPath, 'utf8');
    content = content.replace(
      new RegExp(String.raw`(version:\s*)(${VERSION_PATTERN})`, 'i'),
      `$1${version}`
    );
    fs.writeFileSync(openapiPath, content);
    console.log(`ƒo. Updated OpenAPI spec to version ${version}`);
  }

  if (fs.existsSync(asyncapiPath)) {
    let content = fs.readFileSync(asyncapiPath, 'utf8');
    content = content.replace(
      new RegExp(String.raw`(version:\s*)(${VERSION_PATTERN})`, 'i'),
      `$1${version}`
    );
    fs.writeFileSync(asyncapiPath, content);
    console.log(`ƒo. Updated AsyncAPI spec to version ${version}`);
  }
}

function updateGitHubReleaseLinks(version) {
  if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
    console.warn('Invalid version provided, skipping link update');
    return false;
  }

  const githubLinks = {
    windows: `https://github.com/Jemo69/lyric-display-app/releases/download/v${version}/LyricDisplay-${version}-Windows-Setup.exe`,
    macosArm: `https://github.com/Jemo69/lyric-display-app/releases/download/v${version}/LyricDisplay-${version}-macOS-arm64.dmg`,
    macosIntel: `https://github.com/Jemo69/lyric-display-app/releases/download/v${version}/LyricDisplay-${version}-macOS-x64.dmg`,
    linux: `https://github.com/Jemo69/lyric-display-app/releases/download/v${version}/LyricDisplay-${version}-Linux.AppImage`
  };

  if (fs.existsSync(guidePath)) {
    let content = fs.readFileSync(guidePath, 'utf8');

    content = content.replace(
      /(\[.*?download for Windows.*?\]\()([^\)]+)(\))/i,
      `$1${githubLinks.windows}$3`
    );

    content = content.replace(
      /(\[.*?download for Apple Silicon.*?\]\()([^\)]+)(\))/i,
      `$1${githubLinks.macosArm}$3`
    );

    content = content.replace(
      /(\[.*?download for Intel Mac.*?\]\()([^\)]+)(\))/i,
      `$1${githubLinks.macosIntel}$3`
    );

    content = content.replace(
      /(\[.*?download for Linux.*?\]\()([^\)]+)(\))/i,
      `$1${githubLinks.linux}$3`
    );

    fs.writeFileSync(guidePath, content);
    console.log(`Updated Installation Guide with links for v${version}`);
    return true;
  }
  return false;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const version = args[0] || getCurrentVersion();

  console.log(`\nUpdating documentation version to v${version}...\n`);
  updateVersionNumbers(version);

  updateGitHubReleaseLinks(version);
}

export { updateVersionNumbers, updateGitHubReleaseLinks };