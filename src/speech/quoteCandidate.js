/**
 * src/speech/quoteCandidate.js — the sermon-quote classifier (Phase 7).
 *
 * WHAT IT IS. An optional fourth lane that reads the transcript tail and offers
 * a candidate takeaway the operator can send to Free Note. It is NOT an output
 * lane. There is no send-to-screen action on its card and there will not be one
 * — see the note on QUOTE_ALLOWED_TYPES at the bottom.
 *
 * PORTED FROM FREESHOW'S STT_CONTROLLER_PROMPT, WITH CHANGES.
 *
 * FreeShow asks an LLM to classify transcript chunks as
 * `scripture | lyrics | quote | announcement | empty`, and will project the
 * result. Four rules are worth keeping and one is not:
 *
 *   KEPT — the ANCHOR RULE. A scripture citation is only ever emitted with an
 *   explicit callout or a verbatim reading. Selah already enforces this
 *   structurally (a complete reference is required), but the LLM boundary is a
 *   second place it can be got wrong.
 *
 *   KEPT — the CHAPTER-ONLY PROHIBITION. Never guess verse 1. Redundant with
 *   the detector, and cheap insurance here.
 *
 *   KEPT — PRESERVE THE SPOKEN LANGUAGE. "Genèse 1:1" must stay French. This
 *   matters more here than in FreeShow, because Phase 3 made the whole feature
 *   multilingual and a classifier that anglophoneises a reference would undo it.
 *
 *   KEPT — REJECT FILLER. Without it the model quotes "So it's..." onto a
 *   screen, which is the whole problem.
 *
 *   CHANGED — WHERE A QUOTE GOES. FreeShow makes `quote` a projection target.
 *   A machine's guess at a quotable sentence, one tap from the sanctuary
 *   screens, is exactly the liability decision D5 exists to prevent. Here a
 *   quote can only reach Free Note, and only on a deliberate press.
 *
 * THE GATES STILL RUN FIRST. `classifyQuote` is called with text that has
 * already cleared `gateSegment()`. A segment the hallucination gates discard
 * produces no quote candidate either — this module does not re-open that door
 * and does not need to know why.
 *
 * PURE. The prompt is a string constant and the response is validated. No I/O,
 * no network, no store. The fetch lives in QuoteLaneProvider.
 */

/**
 * The response schema. `strict` + `additionalProperties:false` is what stops
 * the model inventing a field the renderer then trusts.
 */
export const QUOTE_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['quote', 'announcement', 'empty'] },
    content: { type: 'string' },
    confidence: { type: 'integer', minimum: 1, maximum: 100 },
  },
  required: ['type', 'content', 'confidence'],
  additionalProperties: false,
});

/**
 * The system prompt.
 *
 * FreeShow's rules, restated for a lane that only ever feeds a note. The
 * scripture and lyrics branches are retained purely as REJECTION rules — this
 * lane does not emit references, it declines to mistake commentary for a quote
 * — which is why they appear here as "empty" outcomes rather than outputs.
 */
export const QUOTE_SYSTEM_PROMPT = `
You are an automated media assistant inside a church presentation app, reading a live
transcript of a sermon. Your only job is to spot ONE quotable takeaway the preacher
just said, so an operator can choose to save it as a note.

OUTPUT FORMAT
Output ONLY a raw JSON object:
{ "type": "quote" | "announcement" | "empty", "content": string, "confidence": integer }

CRITICAL SCHEMA RULE
If "type" is "empty", "content" MUST be an empty string. Never put rejected text in it.

WHAT COUNTS AS A QUOTE
- An ORIGINAL, self-contained takeaway the preacher just articulated — something that
  would stand alone as a note.
- It must be SUBJECT-ONLY or already in the speaker's own words. Do NOT summarise, do NOT
  improve the grammar, do NOT stitch together two different sentences, and do NOT write a
  caption that the preacher never said.
- Length: 6 to 25 words.

WHAT MUST BE REJECTED — return "empty"
- Anything that is scripture, a Bible quotation, or a citation. Even a beautiful one. Even
  if it names a book and chapter. This lane never handles scripture.
- NEVER GUESS VERSE 1. If the transcript names only a book and chapter ("Jeremiah 29"),
  return "empty". Do not complete it with a verse number.
- Commentary, background, historical explanation, or a story he told.
- Filler: anything beginning "So it's...", "Now, the reason...", "And I think...".
- Ambiguous pronouns with no antecedent: "It is misused", "They wrote about it".
- Anything shorter than 6 words or longer than 25.
- Anything that would need an ellipsis or an edit to stand alone.

DO NOT IMPROVE THE WORDING
- Do NOT improve the grammar, fix the punctuation, tidy the phrasing, or rewrite for style.
- If the preacher said something awkwardly, the quote is the awkward version. A note
  attributed to him must be something he actually said.

DO NOT GUESS
- If the transcript does not clearly contain a quotable statement, return "empty".
- Silence is always the correct answer. Returning "empty" costs the operator nothing;
  returning a fabricated quote costs them a note they did not make.

LANGUAGE
- Preserve the spoken language exactly. If the preacher spoke French, the quote is in
  French. Never translate and never anglicise.

CONFIDENCE
- An integer 1-100 reflecting how certain you are that this is genuinely quotable AND
  genuinely said.
- Be conservative. 85 means you would stake the note on it.
`.trim();

/** Minimum words for a quote to be usable as a note. */
export const QUOTE_MIN_WORDS = 6;
/** Maximum — a "quote" longer than this is a transcript excerpt, not a takeaway. */
export const QUOTE_MAX_WORDS = 25;

/**
 * The only types this lane may emit.
 *
 * `scripture` and `lyrics` are deliberately absent even though the classifier
 * is told about them: those are OTHER LANES' jobs, and a lane that emits them
 * blurs which suggestion is which on a screen the operator is reading at speed.
 * FreeShow's single classifier emits all five from one call; separating them is
 * what lets each lane keep its own gates.
 */
export const QUOTE_ALLOWED_TYPES = Object.freeze(['quote', 'announcement', 'empty']);

/** Confidence below which a quote is not shown at all. */
export const QUOTE_MIN_CONFIDENCE = 70;

/**
 * Validate and normalise a model response.
 *
 * THE POINT OF THIS FUNCTION is that the model's output is treated as
 * UNTRUSTED. A model asked for JSON will occasionally return prose, a JSON
 * fence, or a confidence of 150. Anything that does not survive here produces
 * `null`, which the rail renders as nothing — and nothing is always an
 * acceptable outcome on a screen.
 *
 * @param {unknown} raw the parsed model response
 * @param {object} [options]
 * @param {number} [options.minConfidence] floor, default QUOTE_MIN_CONFIDENCE
 * @returns {{type: string, content: string, confidence: number}|null}
 */
export function validateQuoteResponse(raw, options = {}) {
  const minConfidence = Number.isFinite(options.minConfidence)
    ? options.minConfidence
    : QUOTE_MIN_CONFIDENCE;

  if (!raw || typeof raw !== 'object') return null;

  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
  if (!QUOTE_ALLOWED_TYPES.includes(type)) return null;

  const content = typeof raw.content === 'string' ? raw.content.trim() : '';

  // "empty" is a valid, EXPECTED answer — not a failure. It returns a shape
  // so the caller can tell "nothing to offer" from "malformed response".
  if (type === 'empty') {
    return content ? null : { type: 'empty', content: '', confidence: 0 };
  }

  if (!content) return null;

  // A citation is never a quote, whatever the model said about it. This is the
  // structural half of the anchor rule: the prompt asks nicely, and this
  // refuses regardless.
  if (looksLikeCitation(content)) return null;

  const words = content.split(/\s+/).filter(Boolean).length;
  if (words < QUOTE_MIN_WORDS || words > QUOTE_MAX_WORDS) return null;

  const confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence)) return null;
  if (confidence < minConfidence) return null;

  return { type, content, confidence: Math.round(confidence) };
}

/**
 * Does this text name a Bible book and chapter?
 *
 * A deliberately small, deliberately conservative check — it looks for a
 * capitalized book-shaped word followed by digits, in either order. It does not
 * try to be a reference parser: the point is to catch the obvious "John 3:16"
 * so it can be refused, not to decide what is scripture. Anything subtler is
 * already the reference detector's job, and this lane never emits a reference
 * anyway.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeCitation(text) {
  const value = String(text ?? '');
  if (!value) return false;

  // "John 3:16", "Psalm 23", "Romans 8" — a capitalised book-shaped word
  // followed by digits.
  if (/\b[A-Z][a-z]{2,}\s+\d+(:\d+)?\b/u.test(value)) return true;

  // Spelled-out chapters, in every language the catalog serves. The earlier
  // version matched only the digit form, so "the book of Romans chapter eight"
  // — a perfectly ordinary way to cite — sailed straight through as a quote.
  if (
    /\b(?:chapter|chapitre|chapitre|kapitel|capítulo|capitulo|capitolo|capitolo|hoofdstuk|kapittel|capitolo)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/iu.test(value)
  ) return true;

  // "the book of Romans" / "le livre de Romains"
  if (/\b(?:the\s+)?(?:book|livre|libro|boek|buch|libro)\s+of\s+[A-Z\p{L}]{3,}/u.test(value)) return true;

  if (/\b\d+:\d+\b/u.test(value)) return true;

  return false;
}

/**
 * Parse a raw model response that may be fenced or surrounded by prose.
 *
 * Models return ```json fenced blocks often enough that not handling it means
 * the lane silently never works, which looks identical to "the model is bad".
 *
 * @param {string} text
 * @returns {unknown} the parsed object, or null
 */
export function parseQuoteResponse(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export default validateQuoteResponse;