/**
 * shared/speech/redaction.js — transcript redaction, in one place.
 *
 * Plan 5.6 names this: what a pastor says on stage about a member's hospital
 * stay should not outlive the service in a plaintext file that a later user of
 * a shared laptop can find with a search.
 *
 * ## Why this lives in shared/ and not in main/
 *
 * Because it has two callers with opposite constraints: main/ applies it when
 * writing history, and the renderer has to state its limits next to the toggle.
 * A second copy of the disclosure text would drift from the function within a
 * release, and a privacy claim that has drifted is worse than none — so the
 * behaviour and the words describing it ship together, here.
 *
 * No node imports: this file is bundled for the renderer AND imported by main.
 */
/**
 * Deliberately CONSERVATIVE, and honest about its limits: it matches patterns,
 * not meaning. A person's name looks like any other words.
 *
 * @param {string} text
 * @returns {string}
 */
export function redactText(text) {
  if (typeof text !== 'string' || text.length === 0) return '';
  let out = text;

  // EMAIL — unambiguous.
  out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email removed]');

  // PHONE — requires separators, because a bare run of digits is usually a
  // verse number, a year, or a count.
  out = out.replace(/(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone removed]');

  // SSN — distinctive shape, worth matching outright.
  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[id removed]');

  // STREET ADDRESS — "123 Maple Street". Requires a street suffix so that
  // "3 Timothy 2" is never touched. This matters more than it looks: the
  // redaction runs over text that is MOSTLY scripture, and damaging a verse
  // reference would be a worse failure than the one it prevents.
  out = out.replace(
    /\b\d{1,6}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Terrace|Circle)\b\.?/gi,
    '[address removed]'
  );

  return out;
}

/**
 * What redaction can and cannot catch.
 *
 * Returned rather than hard-coded in a component so the disclosure and the
 * behaviour cannot drift apart.
 */
export const REDACTION_LIMITS = Object.freeze({
  covers: Object.freeze(['email addresses', 'phone numbers', 'government ID numbers', 'street addresses']),
  misses: Object.freeze([
    'people’s names',
    'dates of birth',
    'medical details',
    'anything said without a number or an @ in it',
  ]),
  caveat:
    'This removes the patterns above before a transcript is saved. It cannot recognise a person’s name or anything else said in plain words, so treat the transcript as private rather than as anonymous.',
});

export default redactText;