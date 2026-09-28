/**
 * speech-engine/fakeEngine.js — the canned engine behind `--engine=fake`.
 *
 * This is the stand-in for the future whisper.cpp wrapper. It implements the
 * same engine interface the HTTP server consumes (see server.js) and serves
 * DETERMINISTIC canned data, so the whole app side — supervisor, health poll,
 * IPC surface, renderer — can be exercised end to end with NO model, NO
 * binary, and NO download. It never reads, writes, or downloads a single
 * weight byte.
 *
 * Hygiene rule (plan): transcripts are never logged. This module does not
 * log at all; the canned text only travels on the wire to the requester.
 */
import { randomUUID } from 'node:crypto';
import { SAMPLE_RATE } from '../shared/speech/protocol.js';
// Metadata only — the catalog is a ~12 KB text file; no weights exist
// anywhere in this package.
import catalog from '../shared/speech/models.catalog.json' with { type: 'json' };

/**
 * Catalog rows for GET /v1/models, mapped down to the wire fields.
 */
const CATALOG_MODEL_ROWS = catalog.models.map((entry) => ({
  id: entry.id,
  name: entry.name,
  providerId: entry.providerId,
  downloadBytes: entry.downloadBytes,
}));

/** The canned segment. Deliberately boring and clearly fake. */
export const CANNED_TEXT = 'Brothers and sisters, this is a canned sermon segment served by the fake engine.';

/** Word timings for the canned segment (start/end in ms, within [0, 2600]). */
const CANNED_WORDS = Object.freeze([
  { word: 'Brothers', startMs: 40, endMs: 460, confidence: 0.97 },
  { word: 'and', startMs: 470, endMs: 600, confidence: 0.96 },
  { word: 'sisters,', startMs: 610, endMs: 1020, confidence: 0.95 },
  { word: 'this', startMs: 1040, endMs: 1240, confidence: 0.97 },
  { word: 'is', startMs: 1250, endMs: 1390, confidence: 0.98 },
  { word: 'a', startMs: 1400, endMs: 1470, confidence: 0.98 },
  { word: 'canned', startMs: 1480, endMs: 1870, confidence: 0.94 },
  { word: 'sermon', startMs: 1880, endMs: 2240, confidence: 0.93 },
  { word: 'segment', startMs: 2250, endMs: 2600, confidence: 0.92 },
]);

const CANNED_END_MS = 2600;

/** Canned health metrics — plausible, stable, and obviously synthetic. */
const FAKE_HEALTH = Object.freeze({
  rtf: 0.08,
  memoryMb: 64,
});

/**
 * Create the fake engine.
 *
 * @param {Object} options
 * @param {ReturnType<typeof import('./bus.js').createMessageBus>} options.bus
 *   message bus every emitted message travels through.
 * @param {string} [options.model='fake-canned'] model id reported by health.
 * @returns {object} engine interface consumed by server.js.
 */
export function createFakeEngine({ bus, model = 'fake-canned' } = {}) {
  if (!bus || typeof bus.emit !== 'function') {
    throw new TypeError('createFakeEngine: a message bus is required');
  }

  /** @type {Map<string, { sessionId: string, model: string, sampleRate: number, createdAt: number }>} */
  const sessions = new Map();

  const buildReady = (session) => ({
    t: 'ready',
    sessionId: session.sessionId,
    model: session.model,
    sampleRate: session.sampleRate,
  });

  const createSession = ({ model: requestedModel } = {}) => {
    const session = {
      sessionId: randomUUID(),
      model: typeof requestedModel === 'string' && requestedModel ? requestedModel : model,
      sampleRate: SAMPLE_RATE,
      createdAt: Date.now(),
    };
    sessions.set(session.sessionId, session);
    return { session, messages: [buildReady(session)] };
  };

  return {
    backend: 'fake',
    model,

    /** Health payload for GET /v1/health (apiVersion is added by server.js). */
    health() {
      return {
        model,
        backend: 'fake',
        rtf: FAKE_HEALTH.rtf,
        memoryMb: FAKE_HEALTH.memoryMb,
      };
    },

    /**
     * Model rows this engine could serve. The fake engine downloads nothing
     * and has nothing on disk, so every catalog row is reported as NOT
     * installed — that is the honest answer for a scaffold with no weights.
     */
    models() {
      return CATALOG_MODEL_ROWS.map((row) => ({ ...row, installed: false }));
    },

    createSession,

    closeSession(sessionId) {
      return sessions.delete(sessionId);
    },

    hasSession(sessionId) {
      return sessions.has(sessionId);
    },

    /**
     * "Transcribe" a clip from canned data.
     *
     * No sessionId -> a session is created first, so the returned messages
     * start with `ready` (mirroring a real engine that opens a session on
     * demand). With a known sessionId the messages are the segment output.
     *
     * The request body's audio bytes are ignored ON PURPOSE: the fake engine
     * must never pretend to have processed real audio in a way that could be
     * mistaken for model output.
     *
     * @param {{ sessionId?: string }} body
     * @returns {{ sessionId: string, messages: object[] }}
     * @throws {Error} `code: 'unknown-session'` for an unknown sessionId.
     */
    transcribe(body = {}) {
      let session = null;
      const messages = [];

      if (body.sessionId !== undefined && body.sessionId !== null) {
        session = sessions.get(body.sessionId) || null;
        if (!session) {
          const error = new Error(`unknown session: ${String(body.sessionId).slice(0, 64)}`);
          error.code = 'unknown-session';
          throw error;
        }
      } else {
        const created = createSession({});
        session = created.session;
        messages.push(...created.messages);
      }

      messages.push(
        {
          t: 'partial',
          sessionId: session.sessionId,
          text: 'Brothers and sisters, this is a canned',
          tStartMs: 0,
          tEndMs: 1870,
          confidence: 0.62,
        },
        {
          t: 'partial',
          sessionId: session.sessionId,
          text: CANNED_TEXT,
          tStartMs: 0,
          tEndMs: CANNED_END_MS,
          confidence: 0.81,
        },
        {
          t: 'final',
          sessionId: session.sessionId,
          text: CANNED_TEXT,
          tStartMs: 0,
          tEndMs: CANNED_END_MS,
          words: CANNED_WORDS.map((word) => ({ ...word })),
        },
        {
          t: 'stats',
          rtf: FAKE_HEALTH.rtf,
          encodeMs: 3,
          decodeMs: 1,
          loadMs: 0,
          memoryMb: FAKE_HEALTH.memoryMb,
          backend: 'fake',
        }
      );

      return { sessionId: session.sessionId, messages };
    },
  };
}
