/**
 * NDI runtime detection (main process).
 *
 * Probes for a usable NDI video-over-IP runtime WITHOUT loading anything
 * native at boot:
 *   1. LYRICDISPLAY_NDI_COMPANION — explicit companion sender binary path.
 *   2. NDI_RUNTIME_DIR / NDI_RUNTIME_PATH — official NDI SDK env overrides.
 *   3. Best-effort standard install locations per platform.
 *
 * This is intentionally a probe, not a guarantee: finding the runtime
 * library means a native sender *can* work, not that one is bundled. The
 * bundled native sender module itself is a follow-up (see
 * NATIVE_SENDER_FOLLOW_UP below + transport.js tryLoadNativeSender).
 *
 * Pure-ish by design: env + existsSync are injectable so vitest can cover
 * every branch without touching the real filesystem.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const COMPANION_BINARY_ENV = 'LYRICDISPLAY_NDI_COMPANION';
export const RUNTIME_DIR_ENV_VARS = ['NDI_RUNTIME_DIR', 'NDI_RUNTIME_PATH'];
export const LOOPBACK_TRANSPORT_ENV = 'LYRICDISPLAY_NDI_TRANSPORT';
export const NATIVE_SENDER_MODULE_ENV = 'LYRICDISPLAY_NDI_SENDER_MODULE';

/**
 * Alpha-transparency contract for the native sender follow-up.
 *
 * Lyrics must key cleanly over switcher inputs (vMix, TriCaster, ATEM), so
 * the sender has to preserve the output's alpha channel end to end:
 * straight (non-premultiplied) alpha, full-range RGBA frames handed to the
 * NDI SDK with an RGBA FourCC — never a flattened opaque frame. Outputs
 * intended for NDI keying should run with backgroundOpacity 0 (transparent
 * canvas); any compositing behind the text must happen downstream in the
 * switcher, not in the sender. This note ships in-repo so the follow-up PR
 * implements key/fill correctly the first time.
 */
export const ALPHA_HANDLING_NOTE =
  'NDI lyrics must be sent as straight-alpha RGBA (transparent canvas, ' +
  'backgroundOpacity 0 on the output). Never flatten to opaque: the video ' +
  'switcher (vMix / TriCaster / ATEM) composites downstream.';

export const NATIVE_SENDER_FOLLOW_UP =
  'Native sender ships as a follow-up: bundle an NDI SDK sender module, ' +
  'point LYRICDISPLAY_NDI_SENDER_MODULE at it (or wire the companion ' +
  'binary via LYRICDISPLAY_NDI_COMPANION), and implement ALPHA_HANDLING_NOTE.';

function standardRuntimePaths(platform = process.platform) {
  if (platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    return [
      path.join(programFiles, 'NDI', 'NDI 6 Runtime'),
      path.join(programFiles, 'NDI', 'NDI 5 Runtime'),
    ];
  }
  if (platform === 'darwin') {
    return ['/usr/local/lib/libndi.dylib', '/Library/Application Support/NDI'];
  }
  // linux + everything else: system NDI SDK library locations.
  return ['/usr/lib/libndi.so', '/usr/local/lib/libndi.so'];
}

export function isLoopbackAllowed(env = process.env) {
  return String(env?.[LOOPBACK_TRANSPORT_ENV] || '').trim().toLowerCase() === 'loopback';
}

export function sanitizeSourceName(raw, fallback = 'LyricDisplay') {
  const cleaned = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 96);
  return cleaned || fallback;
}

export function detectNdiRuntime({ env = process.env, existsSync = fs.existsSync, platform = process.platform } = {}) {
  const searched = [];
  let libPath = null;

  for (const varName of RUNTIME_DIR_ENV_VARS) {
    const candidate = String(env?.[varName] || '').trim();
    if (!candidate) continue;
    searched.push(`${varName}=${candidate}`);
    try {
      if (existsSync(candidate)) {
        libPath = candidate;
        break;
      }
    } catch {
      // Probe must never throw — keep searching.
    }
  }

  if (!libPath) {
    for (const candidate of standardRuntimePaths(platform)) {
      searched.push(candidate);
      try {
        if (existsSync(candidate)) {
          libPath = candidate;
          break;
        }
      } catch {
        // Keep searching.
      }
    }
  }

  let companionPath = null;
  const companionCandidate = String(env?.[COMPANION_BINARY_ENV] || '').trim();
  if (companionCandidate) {
    searched.push(`${COMPANION_BINARY_ENV}=${companionCandidate}`);
    try {
      if (existsSync(companionCandidate)) companionPath = companionCandidate;
    } catch {
      // Keep a clean "not found" below.
    }
  }

  const available = Boolean(libPath || companionPath);
  return {
    available,
    kind: libPath ? 'native' : companionPath ? 'companion' : 'none',
    libPath,
    companionPath,
    searched,
    hint: available
      ? null
      : 'NDI runtime not installed. Install the free NDI Runtime (NewTek/Vizrt) on this PC, ' +
        'or keep NDI output off — the app works normally without it. ' +
        'Developers: set LYRICDISPLAY_NDI_TRANSPORT=loopback to exercise the pipeline without hardware.',
  };
}

export function runtimeSummary(runtime) {
  return {
    available: Boolean(runtime?.available),
    kind: runtime?.kind || 'none',
  };
}

export function homeDir() {
  try {
    return os.homedir();
  } catch {
    return '';
  }
}
