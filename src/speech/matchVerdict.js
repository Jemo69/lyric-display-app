/**
 * src/speech/matchVerdict.js — turning a match quality into words (Phase 4).
 *
 * WHY A NUMBER IS NOT ENOUGH.
 *
 * The card used to render "94% match". That invites the operator to read it as
 * a probability — "94% chance this is John 3:16" — which it is not, and cannot
 * be. It is the product of two things: how well the words matched, and how much
 * the engine trusted the audio segment the words came from. A perfect text match
 * on a half-heard segment arrives as a low number for reasons that have nothing
 * to do with the verse.
 *
 * So the number is still computed and still gated on — the gates in
 * hallucination.js own that — but it is not SHOWN. What is shown is a word, and
 * optionally the runner-up the detector actually considered.
 *
 * FreeShow shows a 14px conic-gradient pie and nothing else, and asks the
 * operator to trust a colour. It also computes a runner-up for its ambiguity
 * penalty and throws it away, so its operator never learns the detector was
 * torn between two passages. Both are things this module exists to do better.
 *
 * PURE. No imports, no I/O. One function and its thresholds.
 */

/**
 * Bands, highest first. The first band whose floor the score meets wins, so the
 * ordering of this array is the behaviour.
 *
 * WHY THE FLOORS SIT WHERE THEY DO. `THRESHOLDS.suggestion` is 0.6 — the shared
 * floor every lane is held to — so nothing below 0.6 can ever reach a card at
 * all. That leaves three bands above it, and they are deliberately coarse:
 * "Strong", "Likely", "Close". An operator under time pressure acts on one
 * word, and a four-band scale invites them to agonise over the difference
 * between two shades of the same decision.
 */
const VERDICT_BANDS = Object.freeze([
  { id: 'strong', floor: 0.85, label: 'Strong match' },
  { id: 'likely', floor: 0.7, label: 'Likely' },
  { id: 'close', floor: 0, label: 'Close — check the text' },
]);

/**
 * Below this relative score, the runner-up is disclosed.
 *
 * The scorer reports `relative` (runner-up / winner) and flags the match
 * ambiguous above 0.75. 0.85 is a little stricter than that on purpose: the
 * disclosure is only useful if it appears when the operator would genuinely
 * want to know, and a warning that fires on every fourth suggestion trains
 * people to stop reading it.
 */
export const RUNNER_UP_DISCLOSURE_RATIO = 0.85;

/**
 * A worded verdict for a match quality in [0, 1].
 *
 * @param {number} quality match quality, already segment-weighted
 * @returns {{id: string, label: string, tone: 'high'|'medium'|'low'}}
 */
export function matchVerdict(quality) {
  const score = Number.isFinite(Number(quality)) ? Number(quality) : 0;

  const band = VERDICT_BANDS.find((candidate) => score >= candidate.floor) || VERDICT_BANDS.at(-1);

  const tone = band.id === 'strong' ? 'high' : band.id === 'likely' ? 'medium' : 'low';
  return { id: band.id, label: band.label, tone };
}

/**
 * Should the card tell the operator a second passage was considered?
 *
 * @param {object|null} runnerUp the scorer's runnerUp, if any
 * @returns {boolean}
 */
export function shouldDiscloseRunnerUp(runnerUp) {
  if (!runnerUp || typeof runnerUp.reference !== 'string') return false;
  const relative = Number(runnerUp.relative);
  return Number.isFinite(relative) && relative >= RUNNER_UP_DISCLOSURE_RATIO;
}

/**
 * The disclosure line, or null when there is nothing worth saying.
 *
 * Deliberately does NOT render the runner-up's score. A second percentage on
 * the card invites the operator to pick the higher of two numbers instead of
 * reading the verse, which is the opposite of what the disclosure is for.
 *
 * @param {object|null} runnerUp
 * @returns {string|null} e.g. 'Also considered: John 3:17.'
 */
export function runnerUpDisclosure(runnerUp) {
  if (!shouldDiscloseRunnerUp(runnerUp)) return null;
  const reference = String(runnerUp.reference).trim();
  if (!reference) return null;
  return `Also considered: ${reference}.`;
}

/**
 * Everything the card needs to say about a match, in one call.
 *
 * @param {object|null} suggestion a verse suggestion from deriveSuggestions
 * @returns {{label: string, tone: string, disclosure: string|null}}
 */
export function describeMatch(suggestion) {
  const verdict = matchVerdict(suggestion?.confidence);
  return {
    label: verdict.label,
    tone: verdict.tone,
    disclosure: runnerUpDisclosure(suggestion?.runnerUp ?? null),
  };
}

export default describeMatch;