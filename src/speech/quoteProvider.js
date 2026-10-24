/**
 * src/speech/quoteProvider.js — the LLM adapters for the quote lane (Phase 7).
 *
 * WHY PLAIN fetch AND NO SDK. Same reasoning as decision D6 in the original
 * sermon-assist plan, and it has aged well: official SDKs are heavy, they pull
 * transitive dependencies that break on a fresh machine, and they abstract away
 * exactly the request shape you need to control when the payload is a pastor's
 * words. These four APIs are stable, and hand-writing them costs less than a
 * dependency tree.
 *
 * ONE REQUEST SHAPE, FOUR TRANSPORTS. The classification prompt, the schema,
 * and the validation are identical everywhere; only the envelope and the
 * credentials differ. So the difference between providers is data, not code —
 * which is also what makes adding a fifth one a data change.
 *
 * THE CALLER OWNS CONSENT. `requestQuote` does NOT check whether the operator
 * agreed; `assertMaySend()` in shared/speech/quotePolicy.js does, and it is the
 * renderer's job to call it first. That split is deliberate — a consent check
 * buried inside a fetch wrapper is a consent check that gets skipped the first
 * time someone reaches for the wrapper directly.
 *
 * NO AUDIO IS EVER SENT. Only the transcript tail the operator opted into
 * sharing, and only while the lane is on.
 */

import {
  QUOTE_RESPONSE_SCHEMA,
  QUOTE_SYSTEM_PROMPT,
  parseQuoteResponse,
  validateQuoteResponse,
} from './quoteCandidate.js';

/** Endpoints. One place, so a change is a data change. */
const ENDPOINTS = Object.freeze({
  ollama: 'http://127.0.0.1:11434/api/chat',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
});

/** Defaults per provider. A model id the user did not choose is a guess; these are the documented safe ones. */
const MODELS = Object.freeze({
  ollama: 'llama3.1',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  google: 'gemini-1.5-flash',
});

/**
 * Build the provider-specific request.
 *
 * Exported so the shape of each envelope is testable without a network, and so
 * a reviewer can see in one place exactly what leaves the machine.
 *
 * @param {string} providerId
 * @param {string} text the transcript tail
 * @param {object} [options] { model, apiKey }
 * @returns {{url: string, init: object}|null}
 */
export function buildRequest(providerId, text, options = {}) {
  const model = options.model || MODELS[providerId];
  if (!model) return null;

  switch (providerId) {
    case 'ollama':
      return {
        url: ENDPOINTS.ollama,
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            format: 'json',
            messages: [
              { role: 'system', content: QUOTE_SYSTEM_PROMPT },
              { role: 'user', content: text },
            ],
          }),
        },
      };

    case 'openai':
      return {
        url: ENDPOINTS.openai,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            // A local keyring value, sent to its own provider and nowhere else.
            authorization: `Bearer ${options.apiKey || ''}`,
          },
          body: JSON.stringify({
            model,
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'quote',
                strict: true,
                schema: QUOTE_RESPONSE_SCHEMA,
              },
            },
            messages: [
              { role: 'system', content: QUOTE_SYSTEM_PROMPT },
              { role: 'user', content: text },
            ],
          }),
        },
      };

    case 'anthropic':
      return {
        url: ENDPOINTS.anthropic,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': options.apiKey || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 200,
            system: QUOTE_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: text }],
          }),
        },
      };

    case 'google':
      return {
        url: `${ENDPOINTS.google}?key=${encodeURIComponent(options.apiKey || '')}`,
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: QUOTE_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: QUOTE_RESPONSE_SCHEMA,
              temperature: 0.2,
            },
          }),
        },
      };

    default:
      return null;
  }
}

/**
 * Ask a provider for a quote candidate.
 *
 * Returns the SAME shape regardless of provider, or null. Null means "nothing
 * to show", and the caller renders nothing — which is the correct outcome the
 * overwhelming majority of the time, because the prompt tells the model that
 * silence is the right answer.
 *
 * @param {object} options
 * @param {string} options.providerId
 * @param {string} options.text the transcript tail
 * @param {string} [options.apiKey]
 * @param {string} [options.model]
 * @param {number} [options.minConfidence]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{type:string, content:string, confidence:number}|null>}
 */
export async function requestQuote(options = {}) {
  const { providerId, text, apiKey, model, minConfidence, signal } = options;

  if (!providerId || providerId === 'none') return null;
  if (typeof text !== 'string' || text.trim().length === 0) return null;

  const request = buildRequest(providerId, text, { apiKey, model });
  if (!request) return null;

  let response;
  try {
    response = await fetch(request.url, { ...request.init, signal });
  } catch {
    // A network failure is silence, not an exception. This runs during a
    // service and must never take the rail down.
    return null;
  }

  if (!response?.ok) return null;

  let body;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  // Unwrap each provider's envelope to the same "text of the model" shape.
  const raw = unwrap(providerId, body);
  return validateQuoteResponse(parseQuoteResponse(raw), { minConfidence });
}

/**
 * Pull the model's output text out of a provider envelope.
 *
 * @param {string} providerId
 * @param {object} body
 * @returns {string}
 */
export function unwrap(providerId, body) {
  if (!body || typeof body !== 'object') return '';

  switch (providerId) {
    case 'ollama':
      return body?.message?.content ?? '';
    case 'openai':
      return body?.choices?.[0]?.message?.content ?? '';
    case 'anthropic':
      // Anthropic returns a content BLOCK array, not a string.
      if (Array.isArray(body?.content)) {
        return body.content.map((block) => block?.text ?? '').join('');
      }
      return '';
    case 'google':
      return body?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    default:
      return '';
  }
}

export default requestQuote;