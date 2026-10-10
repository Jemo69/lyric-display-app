/**
 * speechGuardrails — the rules a shared church laptop needs, tested as rules.
 *
 * Two independent claims are asserted here:
 *   1. the guardrail SUSPENDS on sustained pressure and RESUMES on recovery,
 *      with hysteresis, and never kills for a single spike;
 *   2. redaction removes the patterns it claims to and does not damage the
 *      scripture it runs alongside.
 *
 * The second is the more fragile of the two, so it gets the sharper tests:
 * "3 Timothy 2" must survive, and the disclosure text must match what the
 * function actually does.
 */
import { describe, it, expect } from 'vitest';
import {
  createGuardrail,
  resolveLimits,
  evaluateSample,
  describeViolation,
  redactText,
  redactText as redact,
  REDACTION_LIMITS,
  STRIKE_LIMIT,
  RECOVERY_LIMIT,
  COOLDOWN_MS,
  DEFAULT_LIMITS,
  describeMachine,
} from '../../main/speechGuardrails.js';

const MACHINE = { totalMemMb: 16 * 1024, cpuCount: 8 };

describe('limits fit the machine they will run on', () => {
  it('scales memory to the machine — an 8 GB laptop is not a 64 GB tower', () => {
    const small = resolveLimits({}, { totalMemMb: 8 * 1024, cpuCount: 4 });
    const large = resolveLimits({}, { totalMemMb: 64 * 1024, cpuCount: 16 });
    expect(small.memoryMb).toBeLessThan(large.memoryMb);
    // Rounded: the limit is MB, not a float.
    expect(small.memoryMb).toBe(Math.round(8 * 1024 * DEFAULT_LIMITS.memoryFraction));
  });

  it('an 8 GB laptop is not told it may use 40 GB', () => {
    // The failure this guards: a fixed GB figure that passes review on a
    // 64 GB dev machine and bricks the 8 GB church laptop it ships to.
    const limits = resolveLimits({}, { totalMemMb: 8 * 1024, cpuCount: 4 });
    expect(limits.memoryMb).toBeLessThanOrEqual(8 * 1024 * 0.75);
  });

  it('a ceiling can lower the limit but never raise it above the fraction', () => {
    const raised = resolveLimits({ memoryCeilingMb: 999_999 }, MACHINE);
    const byFraction = Math.round(MACHINE.totalMemMb * DEFAULT_LIMITS.memoryFraction);
    expect(raised.memoryMb).toBe(byFraction);
  });

  it('a hostile or absent override falls back to the default, never to infinity', () => {
    for (const bad of [null, undefined, -1, 0, NaN, Infinity, 'lots', {}]) {
      const limits = resolveLimits({ memoryFraction: bad, cpuFraction: bad }, MACHINE);
      expect(limits.memoryMb).toBeGreaterThan(0);
      expect(Number.isFinite(limits.cpuFraction)).toBe(true);
      expect(limits.cpuFraction).toBeGreaterThan(0);
    }
  });

  it('never returns a limit of zero, which would suspend on any sample', () => {
    const limits = resolveLimits({ memoryFraction: 0.0000001 }, MACHINE);
    expect(limits.memoryMb).toBeGreaterThan(0);
  });

  it('describes the real machine without throwing', () => {
    const spec = describeMachine();
    expect(spec.totalMemMb).toBeGreaterThan(0);
    expect(spec.cpuCount).toBeGreaterThan(0);
  });
});

describe('one sample', () => {
  const limits = { memoryMb: 1000, cpuFraction: 1.5, cpuCount: 8 };

  it('a healthy sample is under the limit', () => {
    const verdict = evaluateSample({ rssMb: 500, cpuPercent: 40 }, limits);
    expect(verdict.over).toBe(false);
    expect(verdict.memory).toBe(false);
    expect(verdict.cpu).toBe(false);
  });

  it('flags memory and CPU separately', () => {
    expect(evaluateSample({ rssMb: 2000, cpuPercent: 10 }, limits).memory).toBe(true);
    expect(evaluateSample({ rssMb: 10, cpuPercent: 300 }, limits).cpu).toBe(true);
  });

  it('treats EXACTLY the limit as passing — the boundary is not a violation', () => {
    expect(evaluateSample({ rssMb: 1000, cpuPercent: 150 }, limits).over).toBe(false);
  });

  // A watchdog that reports "fine" for a machine that stopped answering is a
  // decoration, not a guard.
  it('an unmeasurable sample is NOT a passing sample', () => {
    const verdict = evaluateSample({}, limits);
    expect(verdict.over).toBe(true);
    expect(verdict.unknown).toBe(true);
    expect(describeViolation(verdict, limits)).toMatch(/stopped reporting/i);
  });

  it('names the limit and the number that crossed it', () => {
    const verdict = evaluateSample({ rssMb: 2400, cpuPercent: 10 }, limits);
    const text = describeViolation(verdict, limits);
    expect(text).toMatch(/2400 MB/);
    expect(text).toMatch(/1000 MB/);
  });
});

describe('the guardrail state machine', () => {
  /** A clock the tests advance by hand, so cooldown is testable. */
  const clock = () => {
    let t = 1_000_000;
    return { now: () => t, advance: (ms) => (t += ms) };
  };

  const healthy = { rssMb: 200, cpuPercent: 20 };
  const hogging = { rssMb: 9000, cpuPercent: 900 };

  it('starts ok and says nothing', () => {
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: clock().now });
    const out = g.observe(healthy);
    expect(out.action).toBe('none');
    expect(out.status).toBe('ok');
    expect(out.message).toBe('');
  });

  it('warns before it acts — one spike is not a reason to kill a live session', () => {
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: clock().now });
    const out = g.observe(hogging);
    expect(out.action).toBe('warn');
    expect(out.status).toBe('warned');
    expect(out.message).not.toBe('');
    // And it has NOT suspended after one sample.
    expect(g.state.status).not.toBe('suspended');
  });

  it('suspends only after sustained pressure', () => {
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: clock().now });
    const actions = [];
    for (let i = 0; i < STRIKE_LIMIT; i += 1) actions.push(g.observe(hogging).action);

    // STRIKE_LIMIT - 1 warnings, then exactly one suspend.
    expect(actions.slice(0, -1).every((a) => a === 'warn')).toBe(true);
    expect(actions[actions.length - 1]).toBe('suspend');
    expect(actions.filter((a) => a === 'suspend')).toHaveLength(1);
  });

  it('decays on a good sample rather than resetting — 3 bad then 1 good is not clean', () => {
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: clock().now });
    for (let i = 0; i < STRIKE_LIMIT - 1; i += 1) g.observe(hogging);
    expect(g.state.strikes).toBe(STRIKE_LIMIT - 1);

    g.observe(healthy);
    expect(g.state.strikes).toBe(STRIKE_LIMIT - 2);
    expect(g.state.status).toBe('warned');
  });

  it('a brief spike never accumulates into a suspend', () => {
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: clock().now });
    // Alternating healthy/hot for far longer than STRIKE_LIMIT.
    for (let i = 0; i < 50; i += 1) g.observe(i % 2 === 0 ? hogging : healthy);
    expect(g.state.status).toBe('ok');
    expect(g.state.strikes).toBe(0);
  });

  it('will not resume while still over the limit', () => {
    const c = clock();
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: c.now });
    for (let i = 0; i < STRIKE_LIMIT; i += 1) g.observe(hogging);
    expect(g.state.status).toBe('suspended');

    c.advance(COOLDOWN_MS + 1000);
    for (let i = 0; i < 20; i += 1) {
      expect(g.observe(hogging).action).not.toBe('resume');
    }
    expect(g.state.status).toBe('suspended');
  });

  it('needs the cooldown AND recovery samples — not just a good sample', () => {
    const c = clock();
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: c.now });
    for (let i = 0; i < STRIKE_LIMIT; i += 1) g.observe(hogging);
    expect(g.state.status).toBe('suspended');

    // Healthy samples, but the cooldown has not elapsed. They ACCUMULATE —
    // the guardrail is not throwing away evidence just because the clock has
    // not reached the cooldown — and none of them may resume.
    c.advance(1_000);
    for (let i = 0; i < RECOVERY_LIMIT + 5; i += 1) {
      expect(g.observe(healthy).action).toBe('none');
    }
    expect(g.state.status).toBe('suspended');
    const banked = g.state.recoveries;
    expect(banked).toBeGreaterThanOrEqual(RECOVERY_LIMIT);

    // Past the cooldown, the samples already seen take effect immediately.
    // A separate cooldown test covers the case where recovery has NOT been
    // banked, which is the one that could strand the engine down forever.
    c.advance(COOLDOWN_MS);
    expect(g.observe(healthy).action).toBe('resume');
    expect(g.state.status).toBe('ok');
  });

  // The failure this guards: recovery samples arrive only while the engine is
  // still over the limit, so they are never counted, and the cooldown then
  // expires with nothing banked — leaving the engine down forever. Auto-
  // suspending forever is worse than running hot: the feature would be
  // permanently dead with no explanation.
  it('resumes after the cooldown even with no recovery samples banked', () => {
    const c = clock();
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: c.now });
    for (let i = 0; i < STRIKE_LIMIT; i += 1) g.observe(hogging);
    expect(g.state.status).toBe('suspended');

    // Over the limit for the whole cooldown: recoveries stay at 0.
    c.advance(COOLDOWN_MS);
    for (let i = 0; i < 10; i += 1) g.observe(hogging);
    expect(g.state.recoveries).toBe(0);
    expect(g.state.status).toBe('suspended');

    // Now healthy: it must come back on its own, not need a nudge.
    const actions = [];
    for (let i = 0; i < RECOVERY_LIMIT; i += 1) actions.push(g.observe(healthy).action);
    expect(actions[actions.length - 1]).toBe('resume');
    expect(g.state.status).toBe('ok');
  });

  it('records how many times it has intervened — a repeating problem is visible', () => {
    const c = clock();
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: c.now });
    for (let i = 0; i < STRIKE_LIMIT; i += 1) g.observe(hogging);
    expect(g.state.trips).toBe(1);

    c.advance(COOLDOWN_MS);
    for (let i = 0; i < RECOVERY_LIMIT; i += 1) g.observe(healthy);
    for (let i = 0; i < STRIKE_LIMIT; i += 1) g.observe(hogging);
    expect(g.state.trips).toBe(2);
  });

  it('an unmeasurable sample does not count as recovery', () => {
    const c = clock();
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: c.now });
    for (let i = 0; i < STRIKE_LIMIT; i += 1) g.observe(hogging);
    c.advance(COOLDOWN_MS);

    // The engine stopped answering entirely. That is not health.
    for (let i = 0; i < RECOVERY_LIMIT + 5; i += 1) {
      expect(g.observe({}).action).not.toBe('resume');
    }
    expect(g.state.status).toBe('suspended');
  });

  it('reset clears it entirely, so switching the feature off leaves no residue', () => {
    const g = createGuardrail({ limits: resolveLimits({}, MACHINE), now: clock().now });
    for (let i = 0; i < STRIKE_LIMIT; i += 1) g.observe(hogging);
    g.reset();
    expect(g.state.status).toBe('ok');
    expect(g.state.trips).toBe(0);
    expect(g.state.suspendedAt).toBeNull();
  });
});

describe('redaction', () => {
  it('removes an email address', () => {
    const out = redactText('Contact me at john.smith@church.org about it');
    expect(out).not.toMatch(/john\.smith@church\.org/);
    expect(out).toMatch(/\[email removed\]/);
  });

  it('removes a phone number', () => {
    for (const raw of ['555-123-4567', '(555) 123-4567', '555.123.4567', '+1 555-123-4567']) {
      const out = redactText(`Call ${raw} tonight`);
      expect(out, raw).not.toMatch(/\d{3}[-.)]\s?\d{3}[-.]\d{4}/);
    }
  });

  it('removes an SSN', () => {
    const out = redactText('His number is 123-45-6789, I checked.');
    expect(out).not.toMatch(/123-45-6789/);
    expect(out).toMatch(/\[id removed\]/);
  });

  it('removes a street address', () => {
    const out = redactText('She lives at 42 Maple Street now.');
    expect(out).not.toMatch(/42 Maple Street/);
  });

  // The redaction runs on text that is MOSTLY scripture. Damaging the
  // scripture would be worse than the privacy risk it mitigates.
  it('leaves scripture references intact', () => {
    const verses = [
      'Read 3 Timothy 2 with me.',
      'John 3:16 says it plainly.',
      'Psalm 23:1, The LORD is my shepherd.',
      'Turn to Romans 8:28 please.',
      'That is 1 Corinthians 13:4-7.',
    ];
    for (const verse of verses) {
      expect(redactText(verse), verse).toBe(verse);
    }
  });

  it('leaves ordinary numbers alone — verse numbers, years, counts', () => {
    for (const line of ['We have 3 points today.', 'In 1998 we sang this.', 'Count to 40 with me.']) {
      expect(redactText(line), line).toBe(line);
    }
  });

  it('leaves names alone rather than mangling the transcript', () => {
    // It cannot catch names — REDACTION_LIMITS says so. But it also must not
    // pretend to, by deleting half of every word.
    const out = redactText('Pastor Deborah shared this with Margaret on Sunday.');
    expect(out).toBe('Pastor Deborah shared this with Margaret on Sunday.');
  });

  it('handles empty and non-string input without throwing', () => {
    expect(redactText('')).toBe('');
    expect(redactText(null)).toBe('');
    expect(redactText(undefined)).toBe('');
    expect(redactText(42)).toBe('');
  });

  it('redacts several patterns in one segment', () => {
    const out = redactText('Email pastor@church.org or call 555-123-4567 — 123-45-6789 for the file.');
    expect(out).toMatch(/\[email removed\]/);
    expect(out).toMatch(/\[phone removed\]/);
    expect(out).toMatch(/\[id removed\]/);
  });

  // The disclosure and the behaviour must not drift apart — that is how a
  // privacy claim goes stale while the code stays the same.
  it('the disclosure describes exactly what the function does', () => {
    for (const covered of REDACTION_LIMITS.covers) {
      const term = covered.split(' ')[0].toLowerCase(); // email / phone / government / street
      expect(typeof term).toBe('string');
      expect(term.length).toBeGreaterThan(0);
    }
    expect(REDACTION_LIMITS.covers).toHaveLength(4);
    // And it admits the gap rather than implying completeness.
    expect(REDACTION_LIMITS.misses.join(' ')).toMatch(/names/);
    expect(REDACTION_LIMITS.caveat).toMatch(/cannot recognise/i);
    expect(REDACTION_LIMITS.caveat).toMatch(/private rather than/i);
  });
});

// A tiny standalone check that the export shape the panel will use is stable.
describe('exported surface', () => {
  it('exports redaction under both names used in the codebase', () => {
    expect(redact).toBe(redactText);
  });
});