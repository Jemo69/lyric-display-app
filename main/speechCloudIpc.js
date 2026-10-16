/*
 * main/speechCloudIpc.js — the three cloud channels (Phase 5).
 *
 * Split out of main/speechIpc.js so the credential half of the feature can be
 * read, and tested, without wading through the engine supervisor. It is
 * registered by registerSpeechIpc with its key store and its acknowledgement
 * file already resolved.
 *
 * ## The one thing this file must never do
 *
 * Return a key. There is no handler here that can. speech:cloud-status returns
 * masked tails; speech:cloud-key returns only success/failure. That is why the
 * renderer can hold a key for the duration of a request and never hold one at
 * all — the honest arrangement is the only one that survives contact with a
 * future contributor.
 */
import {
  decideCloudStart,
  findCloudProvider,
  cloudSetupSteps,
  CLOUD_ACK_TEXT,
  CLOUD_ACK_VERSION,
  CLOUD_COST_TEXT,
  CLOUD_PROVIDERS,
} from '../shared/speech/cloudPolicy.js';
import createMainLogger from './logger.js';

const log = createMainLogger('SpeechCloudIpc');

const invalidArgument = (field) => ({
  ok: false,
  code: 'invalid-argument',
  field,
  message: field + ' must be a non-empty string',
});

/**
 * Register the cloud channels.
 *
 * @param {object} deps
 * @param {object} deps.ipcMain electron's ipcMain
 * @param {object} deps.keyStore main/speechCloudKeys.js store
 * @param {() => ({acknowledged: boolean, ackVersion: number}|null)} deps.readAck
 * @param {(acknowledged: boolean) => {ok: boolean, code: string, message: string}} deps.writeAck
 * @param {() => object} deps.getSpeechState the renderer's current speech state
 * @param {(partial: object) => void} [deps.setSpeechState] records the renderer's
 *   current selection so the gate and this report read the SAME state
 */
export function registerCloudIpc({ ipcMain, keyStore, readAck, writeAck, getSpeechState, setSpeechState }) {
  /** Assemble the gate input from the store plus what main actually holds. */
  const cloudState = async () => {
    // A failed read leaves the store looking EMPTY, which is the safe
    // direction — the gate then refuses for want of a key. But telling the
    // operator to "add a key" when the truth is "we could not read the key
    // store" sends them to fix the wrong thing, so the reason travels with
    // the report.
    let readFailed = false;
    let status = { available: false, availabilityReason: '', providers: {} };
    try {
      status = await keyStore.status();
    } catch (error) {
      readFailed = true;
      log.warn('Cloud key status failed: ' + (error?.code ?? error?.name ?? 'Error'));
    }
    const ack = readAck();
    const speech = getSpeechState() ?? {};
    return {
      where: speech.where,
      cloudProviderId: speech.cloudProviderId ?? null,
      providerEntry: status.providers?.[speech.cloudProviderId] ?? null,
      hasStoredKey: Boolean(status.providers?.[speech.cloudProviderId]?.stored),
      keyShapeOk: status.providers?.[speech.cloudProviderId]?.usable === true,
      acknowledged: ack?.acknowledged === true,
      ackVersion: ack?.ackVersion ?? 0,
      // Reported straight from the store: whether the OS key store is usable
      // at all, which is what decides if a key can be saved here.
      keyStoreAvailable: status.available === true && !readFailed,
      keyStoreReason: readFailed
        ? 'The saved keys could not be read from this computer.'
        : status.availabilityReason ?? '',
    };
  };

  /**
   * speech:cloud-status — everything the panel needs, and nothing more.
   *
   * Includes the gate's own verdict so the UI cannot accidentally disagree
   * with what main will enforce: the same decideCloudStart, the same copy.
   */
  ipcMain.handle('speech:cloud-status', async (_event, payload) => {
    // The renderer reports WHICH provider it currently has selected.
    //
    // Without this the panel and the gate would read different state: the
    // panel asks what it needs to show before any engine has been started,
    // while the gate only learned the selection from speech:start. The
    // panel would then report on a stale provider and the gate on a
    // different one.
    //
    // This is a SELECTION, not a permission: naming a provider here cannot
    // open anything. The gate still demands a stored key FOR THAT PROVIDER
    // and an explicit yes.
    if (payload && typeof payload === 'object') {
      setSpeechState?.({
        where: typeof payload.where === 'string' ? payload.where : undefined,
        cloudProviderId:
          typeof payload.cloudProviderId === 'string' ? payload.cloudProviderId : undefined,
      });
    }
    const state = await cloudState();
    const verdict = decideCloudStart(state);
    return {
      ok: true,
      providers: CLOUD_PROVIDERS,
      ackText: CLOUD_ACK_TEXT,
      ackVersion: CLOUD_ACK_VERSION,
      costText: CLOUD_COST_TEXT,
      steps: cloudSetupSteps(state),
      canStart: verdict.start,
      blockedBy: verdict.start ? null : verdict.code,
      blockedMessage: verdict.start ? '' : verdict.message,
      keyStoreAvailable: state.keyStoreAvailable,
      keyStoreReason: state.keyStoreReason,
      acknowledged: state.acknowledged && state.ackVersion === CLOUD_ACK_VERSION,
      provider: state.providerEntry
        ? { id: speechProviderIdOf(state), stored: true, masked: state.providerEntry.masked, usable: state.providerEntry.usable }
        : null,
    };
  });

  /**
   * speech:cloud-key — store a key, or clear one.
   *
   * in:  { providerId, key }  — a key STORES
   *       { providerId, clear: true } — clears
   * out: { ok, code, message, masked?, removed? }
   */
  ipcMain.handle('speech:cloud-key', async (_event, payload) => {
    if (payload !== undefined && payload !== null && typeof payload !== 'object') {
      return invalidArgument('payload');
    }
    if (typeof payload?.providerId !== 'string' || !payload.providerId) {
      return invalidArgument('providerId');
    }
    if (!findCloudProvider(payload.providerId)) {
      return {
        ok: false,
        code: 'unknown-cloud-provider',
        field: 'providerId',
        message: payload.providerId + ' is not a cloud provider LyricDisplay offers.',
      };
    }

    if (payload?.clear === true) {
      const cleared = await keyStore.clearKey(payload.providerId);
      // A count and a provider id. Never the key, which is exactly what was
      // just discarded.
      log.info('Cloud key cleared by user request (' + payload.providerId + ')');
      return cleared;
    }

    if (typeof payload?.key !== 'string' || !payload.key) {
      return invalidArgument('key');
    }
    const saved = await keyStore.setKey(payload.providerId, payload.key);
    // Logged by the store itself: provider id and outcome only.
    return saved;
  });

  /**
   * speech:cloud-acknowledge — record (or withdraw) the explicit yes.
   *
   * The version recorded is ALWAYS the current wording's version. A renderer
   * cannot pass its own version, so it cannot agree to text that is not the
   * text on screen.
   */
  ipcMain.handle('speech:cloud-acknowledge', async (_event, payload) => {
    if (payload !== undefined && payload !== null && typeof payload !== 'object') {
      return invalidArgument('payload');
    }
    const acknowledged = payload?.acknowledged === true;
    const written = writeAck(acknowledged);
    if (!written.ok) return written;
    log.info(acknowledged ? 'Cloud egress acknowledged' : 'Cloud egress acknowledgement withdrawn');
    return {
      ok: true,
      acknowledged,
      ackVersion: acknowledged ? CLOUD_ACK_VERSION : 0,
    };
  });

  /**
   * The gate, as a function other modules can call.
   *
   * Exported so the start path in speechEngine can ask the same question rather
   * than reimplementing it. Two copies of a consent check is one too many.
   */
  return { cloudState, cloudVerdict: async () => decideCloudStart(await cloudState()) };
}

/** The selected provider id, narrowed to a string for the reply. */
function speechProviderIdOf(state) {
  return typeof state.cloudProviderId === 'string' ? state.cloudProviderId : null;
}

export default registerCloudIpc;
