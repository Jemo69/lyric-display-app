/**
 * shared/speech/quotePolicy.js — what the quote lane may send, and where
 * (Phase 7).
 *
 * WHY THIS FILE IS SEPARATE FROM THE UI.
 *
 * The rule that makes consent meaningful is that the string SHOWN and the
 * string ENFORCED are the same string, from one place. The moment a consent
 * dialog keeps its own copy of the wording, it describes something other than
 * what is checked — and a consent dialog that describes something other than
 * what is checked means nothing. This is the same rule
 * `CloudTranscriptionPanel.jsx` already states in its own header, applied to
 * the lane that would otherwise be the first thing in the app to send a
 * pastor's actual words to a third party.
 *
 * WHAT MAKES THIS LANE DIFFERENT FROM THE CLOUD TRANSCRIPTION PATH.
 *
 * Cloud transcription sends AUDIO to a provider and gets text back. That is bad,
 * and it is gated. But the audio never left the room, and the provider is
 * being paid to do exactly one thing with it.
 *
 * The quote lane sends the transcript — the pastor's own words, mid-sentence,
 * including anything not in the published recording — to a model that will
 * reason over it. That is a different promise, and it gets its own gate.
 *
 * SO: OFF BY DEFAULT, AND STAYING THAT WAY.
 *
 * `laneEnabled` is false unless a provider has been explicitly chosen AND
 * consent recorded. There is no auto-detect, no "just this once", and no
 * default provider. D9's local-by-default stance is not bent here; a lane that
 * quietly egresses sermon text is not a feature, it is a leak with a toggle.
 *
 * NO I/O, NO IMPORTS. Static data and pure predicates.
 */

/** Providers this lane can talk to. Local-first: Ollama needs no egress. */
export const QUOTE_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'none',
    name: 'Not configured',
    local: true,
    requiresKey: false,
    description: 'The quote lane is off. Nothing is sent anywhere.',
  }),
  Object.freeze({
    id: 'ollama',
    name: 'Ollama (on this machine)',
    local: true,
    requiresKey: false,
    description: 'Runs on this computer. Sermon text does not leave the machine.',
  }),
  Object.freeze({
    id: 'openai',
    name: 'OpenAI',
    local: false,
    requiresKey: true,
    description: 'Sends sermon text to OpenAI.',
  }),
  Object.freeze({
    id: 'anthropic',
    name: 'Anthropic',
    local: false,
    requiresKey: true,
    description: 'Sends sermon text to Anthropic.',
  }),
  Object.freeze({
    id: 'google',
    name: 'Google',
    local: false,
    requiresKey: true,
    description: 'Sends sermon text to Google.',
  }),
]);

/** The provider id meaning "off". */
export const NO_PROVIDER = 'none';

/**
 * THE CONSENT STRING.
 *
 * Rendered by the opt-in panel and checked by `assertMaySend`. One string, so
 * the two cannot drift. It names the provider and says what leaves the machine,
 * because "enable AI features" tells an operator nothing they can act on.
 */
export const QUOTE_CONSENT_TEMPLATE = Object.freeze(
  'Sermon text from this service will be sent to {provider} to look for quotable takeaways. ' +
    'This includes anything said on stage that is not in the published recording. ' +
    'The app will not send anything until you turn this on.'
);

/**
 * The exact consent sentence for a provider id.
 *
 * @param {string} providerId
 * @returns {string}
 */
export function consentTextFor(providerId) {
  const provider = QUOTE_PROVIDERS.find((candidate) => candidate.id === providerId);
  const name = provider && provider.id !== NO_PROVIDER ? provider.name : 'the configured provider';
  return QUOTE_CONSENT_TEMPLATE.replace('{provider}', name);
}

/**
 * Where does this provider's traffic go?
 *
 * @param {string} providerId
 * @returns {'local'|'remote'|'off'}
 */
export function egressFor(providerId) {
  const provider = QUOTE_PROVIDERS.find((candidate) => candidate.id === providerId);
  if (!provider || provider.id === NO_PROVIDER) return 'off';
  return provider.local ? 'local' : 'remote';
}

/**
 * May the lane send anything right now?
 *
 * EVERY condition must hold, and the failure is a reason rather than a boolean,
 * because the panel shows this sentence to the operator.
 *
 * @param {object} state
 * @param {string} [state.providerId]
 * @param {boolean} [state.consented] consent explicitly recorded this session
 * @param {boolean} [state.providerReady] key saved / model present
 * @returns {{ok: boolean, reason: string}}
 */
export function assertMaySend(state = {}) {
  const { providerId = NO_PROVIDER, consented = false, providerReady = false } = state;

  if (providerId === NO_PROVIDER) {
    return { ok: false, reason: 'The quote lane has no provider configured.' };
  }
  if (!consented) {
    return { ok: false, reason: 'You have not turned the quote lane on for this service.' };
  }
  if (!providerReady) {
    return { ok: false, reason: `The selected provider is not ready. ${consentTextFor(providerId)}` };
  }
  return { ok: true, reason: '' };
}

/**
 * The lane's state for the capability table in src/speech/capabilities.js.
 *
 * Off until explicitly enabled, with the reason stated — the same rule every
 * other lane follows, and the reason it is expressed as a function rather than
 * a boolean is so the reason can never be absent.
 *
 * @param {object} [state]
 * @returns {{id: string, enabled: boolean, degraded: boolean, reason: string}}
 */
export function quoteLaneState(state = {}) {
  const gate = assertMaySend(state);
  const remote = egressFor(state.providerId ?? NO_PROVIDER) === 'remote';
  return {
    id: 'quote',
    enabled: gate.ok,
    // "Degraded" is for a lane that runs but less well. Off is off — and when a
    // REMOTE provider is chosen, that is worth saying out loud even once it is
    // on, because it is the fact that would matter if the operator later
    // wondered where the text went.
    degraded: gate.ok && remote,
    reason: gate.ok
      ? (remote ? 'Sermon text is being sent off this machine.' : '')
      : gate.reason,
  };
}

/**
 * The provider rows for the settings UI, minus the "off" entry.
 *
 * @returns {Array<object>}
 */
export function selectableQuoteProviders() {
  return QUOTE_PROVIDERS.filter((provider) => provider.id !== NO_PROVIDER);
}

export default quoteLaneState;