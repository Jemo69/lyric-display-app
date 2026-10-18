import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MEDIA_PERMISSIONS,
  shouldGrantMedia,
  decidePermission,
  resolveControlWindowMatch,
} from '../../main/permissionPolicy.js';

// NOTE: main/windows.js imports `electron` at module scope and cannot be
// loaded under vitest/jsdom. The scoping rule therefore lives in
// main/permissionPolicy.js, which imports nothing from electron.

const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

const micUsage = pkg?.build?.mac?.extendInfo?.NSMicrophoneUsageDescription;
const audioCaptureUsage = pkg?.build?.mac?.extendInfo?.NSAudioCaptureUsageDescription;

describe('macOS build-time microphone permissions (package.json build.mac)', () => {
  it('declares NSMicrophoneUsageDescription as a non-trivial sentence', () => {
    expect(typeof micUsage).toBe('string');
    expect(micUsage.length).toBeGreaterThan(40);
  });

  it('declares NSAudioCaptureUsageDescription as a non-trivial sentence', () => {
    expect(typeof audioCaptureUsage).toBe('string');
    expect(audioCaptureUsage.length).toBeGreaterThan(40);
  });

  it('ships shared/**/* so the model catalog ships with the app', () => {
    expect(pkg?.build?.files).toContain('shared/**/*');
  });
});

describe('media permission scoping (control window only)', () => {
  it('grants media to the control window', () => {
    expect(
      shouldGrantMedia({ permissionName: 'media', isControlWindow: true, isQuitting: false })
    ).toBe(true);
  });

  it('denies media for an output window (different webContents)', () => {
    const isControlWindow = resolveControlWindowMatch({
      requestWebContentsId: 42, // output window
      controlWebContentsId: 7, // control window
      controlWindowAvailable: true,
    });
    expect(isControlWindow).toBe(false);
    expect(
      shouldGrantMedia({ permissionName: 'media', isControlWindow, isQuitting: false })
    ).toBe(false);
  });

  it('denies media for a stage or dynamic output window', () => {
    for (const outputId of [11, 12, 13]) {
      const isControlWindow = resolveControlWindowMatch({
        requestWebContentsId: outputId,
        controlWebContentsId: 7,
        controlWindowAvailable: true,
      });
      expect(isControlWindow).toBe(false);
      expect(
        shouldGrantMedia({ permissionName: 'media', isControlWindow, isQuitting: false })
      ).toBe(false);
    }
  });

  it('denies media before the control window exists', () => {
    const isControlWindow = resolveControlWindowMatch({
      requestWebContentsId: 42,
      controlWebContentsId: null,
      controlWindowAvailable: false,
    });
    expect(isControlWindow).toBe(false);
    expect(
      shouldGrantMedia({ permissionName: 'media', isControlWindow, isQuitting: false })
    ).toBe(false);
    // Handler contract: a missing control window is never the control window.
    expect(
      shouldGrantMedia({ permissionName: 'media', isControlWindow: false, isQuitting: false })
    ).toBe(false);
  });

  it('denies media when the control window has been destroyed', () => {
    const isControlWindow = resolveControlWindowMatch({
      requestWebContentsId: 42,
      controlWebContentsId: 7,
      controlWindowAvailable: false, // win.isDestroyed() === true
    });
    expect(isControlWindow).toBe(false);
    expect(
      shouldGrantMedia({ permissionName: 'media', isControlWindow, isQuitting: false })
    ).toBe(false);
  });

  it('denies media while the app is quitting', () => {
    expect(
      shouldGrantMedia({ permissionName: 'media', isControlWindow: true, isQuitting: true })
    ).toBe(false);
  });

  it('recognises every media permission name Electron may report', () => {
    for (const name of ['media', 'audioCapture', 'videoCapture']) {
      expect(MEDIA_PERMISSIONS).toContain(name);
      expect(
        shouldGrantMedia({ permissionName: name, isControlWindow: true, isQuitting: false })
      ).toBe(true);
      expect(
        shouldGrantMedia({ permissionName: name, isControlWindow: false, isQuitting: false })
      ).toBe(false);
    }
  });
});

describe('permission decision matrix', () => {
  it('denies unknown permissions even for the control window (logged, not silent)', () => {
    for (const name of ['geolocation', 'notifications', 'midi', 'display-capture', 'nonsense']) {
      expect(
        shouldGrantMedia({ permissionName: name, isControlWindow: true, isQuitting: false })
      ).toBe(false);
      expect(decidePermission({ permissionName: name, isControlWindow: true })).toEqual({
        allowed: false,
        reason: 'denied-unmapped',
      });
    }
  });

  it('passes fullscreen through for the control window', () => {
    expect(
      decidePermission({ permissionName: 'fullscreen', isControlWindow: true })
    ).toEqual({ allowed: true, reason: 'passthrough' });
    expect(decidePermission({ permissionName: 'fullscreen', isControlWindow: false })).toEqual({
      allowed: true,
      reason: 'passthrough',
    });
  });

  it('passes clipboard permissions through (existing copy/paste features depend on them)', () => {
    for (const name of ['clipboard-read', 'clipboard-sanitized-write']) {
      expect(decidePermission({ permissionName: name, isControlWindow: false })).toEqual({
        allowed: true,
        reason: 'passthrough',
      });
    }
  });

  it('reports distinct reasons for media denials', () => {
    expect(decidePermission({ permissionName: 'media', isControlWindow: true })).toEqual({
      allowed: true,
      reason: 'media-granted',
    });
    expect(
      decidePermission({ permissionName: 'media', isControlWindow: false, isQuitting: false })
    ).toEqual({ allowed: false, reason: 'media-denied-not-control-window' });
    expect(
      decidePermission({ permissionName: 'media', isControlWindow: true, isQuitting: true })
    ).toEqual({ allowed: false, reason: 'media-denied-quitting' });
  });
});
