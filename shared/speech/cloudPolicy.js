/**
 * shared/speech/cloudPolicy.js — the rules for sending audio off this computer.
 *
 * Plan section 5.6 and decision D5 put cloud transcription behind two gates,
 * and both exist because a church laptop is not a private machine and a
 * sermon is not the operator's to publish:
 *
 *   1. A KEY MUST BE STORED. Not typed into a box that goes nowhere, and not
 *      in localStorage — which is a plaintext file any user of the machine can
 *      read with a text editor.
 *   2. AN EXPLICIT ACKNOWLEDGEMENT THAT AUDIO LEAVES. Not a checkbox that
 *      comes pre-ticked, not a modal dismissed by reflex, and not a line of
 *      fine print. A person has to say yes.
 *
 * ## Why the decision function is pure and lives in shared/
 *
 * It is the chokepoint for a gate that must not be bypassable, so it has to be
 * testable without electron, without a network, and without a key store. Main
 * enforces it on every start; the renderer shows the same copy the decision
 * quotes. A UI that words a warning differently from the check that enforces
 * it is how a consent dialog becomes decoration.
 */

/** Cloud providers, with what each one is actually good at. */
export const CLOUD_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'deepgram',
    name: 'Deepgram',
    copy: 'True streaming, the lowest latency of the three / priced per second.',
    docUrl: 'https://console.deepgram.com/',
  }),
  Object.freeze({
    id: 'assemblyai',
    name: 'AssemblyAI',
    copy: 'Strong punctuation and speaker diarisation / priced per second.',
    docUrl: 'https://www.assemblyai.com/app/account',
  }),
  Object.freeze({
    id: 'openai',
    name: 'OpenAI Whisper API',
    copy: 'Already-known quality, strong on accented English / chunked uploads mean more latency.',
    docUrl: 'https://platform.openai.com/api-keys',
  }),
  Object.freeze({
    id: 'groq',
    name: 'Groq',
    copy: 'Whisper-large speed at low cost / best latency-per-cent, and rate limits bite on a long service.',
    docUrl: 'https://console.groq.com/keys',
  }),
  Object.freeze({
    id: 'google',
    name: 'Google Cloud STT',
    copy: 'Best multi-dialect coverage / needs service-account credentials, so heavier setup.',
    docUrl: 'https://console.cloud.google.com/apis/credentials',
  }),
]);


/** A provider by id, or null. Case-insensitive; never throws. */
export function findCloudProvider(providerId) {
  if (typeof providerId !== 'string' || providerId.length === 0) return null;
  const wanted = providerId.trim().toLowerCase();
  return CLOUD_PROVIDERS.find((p) => p.id === wanted) ?? null;
}

/**
 * The version of the acknowledgement wording.
 *
 * Bumped whenever the text below changes, and stored with the user's yes.
 * A stale yes is then not accepted for new wording — because agreeing to
 * "audio may be sent to your provider" is not agreeing to a sentence nobody
 * has read yet.
 */
export const CLOUD_ACK_VERSION = 1;

/**
 * The exact text a person agrees to. Quoted verbatim by the decision function
 * so the warning shown and the warning enforced cannot differ.
 */
export const CLOUD_ACK_TEXT =
  'Audio from your microphone is sent over the internet to your chosen speech provider, ' +
  'where it may be stored and processed under their terms, and it may be billed to you. ' +
  'Your sermon is usually published, but the live feed may contain audio that is not in the ' +
  'published recording. Switch back to “This Device” at any time to stop sending audio.';

/**
 * The cost warning, stated as a range rather than a promise.
 *
 * Per-second and per-minute providers differ by more than an order of
 * magnitude over a 45-minute service, and "cents" alone would read as cheap on
 * a provider where it is not.
 */
export const CLOUD_COST_TEXT =
  'Cloud speech is billed by the provider for the audio it receives. A 40-minute sermon is ' +
  'typically a few dollars, and a provider that bills per minute can cost more on a long ' +
  'service. LyricDisplay cannot see or predict that bill.';

/**
 * Is a stored key usable for this provider?
 *
 * SHAPE ONLY. This says whether a string is plausible for the provider — it
 * cannot say whether a key works, and nothing here claims it does. A key that
 * passes this check and is still wrong fails at the provider, which is the
 * honest place for that to fail.
 *
 * @param {string} key
 * @param {string} providerId
 * @returns {{ok: boolean, code: string, message: string}}
 */
export function checkCloudKeyShape(key, providerId) {
  const provider = findCloudProvider(providerId);
  if (!provider) {
    return {
      ok: false,
      code: 'unknown-cloud-provider',
      message: 'Choose a cloud provider before adding a key.',
    };
  }
  if (typeof key !== 'string' || key.trim().length === 0) {
    return {
      ok: false,
      code: 'empty-key',
      message: 'That key is empty. Copy it from your provider’s dashboard and paste it in.',
    };
  }
  const trimmed = key.trim();
  if (trimmed.length < 16) {
    return {
      ok: false,
      code: 'key-too-short',
      // The length only — never the value. A rejected key is still a secret.
      message: `That key looks too short to be real (${trimmed.length} characters). Most providers' keys are longer than 30.`,
    };
  }
  // Whitespace inside a key is always a paste accident, and it produces a
  // confusing provider-side 401 that looks like a wrong key.
  if (/\s/.test(trimmed)) {
    return {
      ok: false,
      code: 'key-contains-whitespace',
      message: 'That key contains a space or a line break. Copy it again without the formatting.',
    };
  }
  return { ok: true, code: 'ok', message: '' };
}

/**
 * Mask a key for display. NEVER returns anything that could be used as a key.
 *
 * The last four characters are kept because that is how a person confirms
 * they pasted the key they meant to. Everything else is dots.
 *
 * @param {string|null} key
 * @returns {string} e.g. '••••••••••••abcd', or '' when there is no key
 */
export function maskCloudKey(key) {
  if (typeof key !== 'string' || key.trim().length === 0) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 4) return '•'.repeat(trimmed.length);
  return `${'•'.repeat(Math.min(12, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

/** Transports that never hand audio to a third party. Anything else is unknown. */
export const CLOUD_GATE_PASSTHROUGH = Object.freeze(['local', 'network']);

/**
 * THE GATE. May a cloud session start?
 *
 * Both conditions must hold. Neither is implied by the other, and neither is
 * inferred from a previous session having worked: a key that was revoked and a
 * warning that was dismissed last month are both facts about the past.
 *
 * @param {object} state
 * @param {string} state.where 'local' | 'network' | 'cloud'
 * @param {string|null} [state.cloudProviderId]
 * @param {boolean} [state.hasStoredKey] a key is in the OS key store
 * @param {boolean} [state.keyShapeOk] the stored key is plausible for this provider
 * @param {boolean} [state.acknowledged]
 * @param {number} [state.ackVersion] the version the user agreed to
 * @returns {{start: boolean, reason: string, code: string, message: string}}
 */
export function decideCloudStart(state = {}) {
  const { where, cloudProviderId, hasStoredKey, keyShapeOk, acknowledged, ackVersion } = state;

  if (where !== 'cloud') {
    // An unrecognised `where` is NOT 'local'. Defaulting an unknown value to
    // 'not cloud, therefore allowed' fails OPEN on the one gate that decides
    // whether a sermon leaves the machine — the same conservative default the
    // benchmark applies to an engine that will not declare what it is. Only a
    // value we actually recognise can clear this gate.
    if (!CLOUD_GATE_PASSTHROUGH.includes(where)) {
      return {
        start: false,
        reason: 'unknown-transport',
        code: 'unknown-transport',
        message: 'It is not clear where audio should be sent. Choose This Device, a Network Device, or a cloud provider.',
      };
    }
    // Not the gate's business. Local and network never send audio to a
    // third party, and making them answer for it would train people to
    // click through the warning that matters.
    return { start: true, reason: 'not-cloud', code: 'ok', message: '' };
  }


  if (!findCloudProvider(cloudProviderId)) {
    return {
      start: false,
      reason: 'no-cloud-provider',
      code: 'no-cloud-provider',
      message: 'Choose which speech provider should receive your audio.',
    };
  }

  if (hasStoredKey !== true || keyShapeOk !== true) {
    return {
      start: false,
      reason: 'no-stored-key',
      code: 'no-stored-key',
      message: 'Add a saved API key for your provider before sending audio to it.',
    };
  }

  if (acknowledged !== true || ackVersion !== CLOUD_ACK_VERSION) {
    return {
      start: false,
      reason: 'cloud-not-acknowledged',
      code: 'cloud-not-acknowledged',
      message: CLOUD_ACK_TEXT,
    };
  }

  return { start: true, reason: 'cloud-acknowledged', code: 'ok', message: '' };
}

/**
 * What the UI still needs from the user, in the order it should ask.
 *
 * Ordered so the cheapest, least committal step comes first: choosing a
 * provider is reversible and asks nothing, while the acknowledgement is the
 * one that commits them to sending audio.
 *
 * @returns {Array<{id: string, label: string, done: boolean}>}
 */
export function cloudSetupSteps(state = {}) {
  const provider = findCloudProvider(state.cloudProviderId);
  return [
    { id: 'provider', label: 'Choose a provider', done: Boolean(provider) },
    {
      id: 'key',
      label: 'Save an API key',
      done: state.hasStoredKey === true && state.keyShapeOk === true,
    },
    {
      id: 'acknowledge',
      label: 'Confirm audio leaves this computer',
      done: state.acknowledged === true && state.ackVersion === CLOUD_ACK_VERSION,
    },
  ];
}

export default decideCloudStart;
