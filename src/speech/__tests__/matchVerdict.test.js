/**
 * src/speech/__tests__/matchVerdict.test.js — the worded verdict (Phase 4)
 *
 * The point of this file is that the card no longer shows a bare percentage.
 * These tests pin both what replaced it and — just as importantly — that the
 * gates still own the decision. The verdict DESCRIBES a suggestion that already
 * passed; it never decides whether one exists.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import THRESHOLDS from '../thresholds.js';
import {
  RUNNER_UP_DISCLOSURE_RATIO,
  describeMatch,
  matchVerdict,
  runnerUpDisclosure,
  shouldDiscloseRunnerUp,
} from '../matchVerdict.js';

describe('matchVerdict', () => {
  it('names a strong match', () => {
    expect(matchVerdict(0.95).label).toBe('Strong match');
    expect(matchVerdict(0.95).tone).toBe('high');
  });

  it('names a likely match', () => {
    expect(matchVerdict(0.75).label).toBe('Likely');
    expect(matchVerdict(0.75).tone).toBe('medium');
  });

  it('tells the operator to check when the match is weak', () => {
    expect(matchVerdict(0.62).label).toBe('Close — check the text');
    expect(matchVerdict(0.62).tone).toBe('low');
  });

  it('treats the shared suggestion floor as the bottom of the scale, not as 0', () => {
    // Nothing below THRESHOLDS.suggestion can reach a card, so the verdict's
    // lowest band starts at the floor rather than pretending to grade zero.
    expect(matchVerdict(THRESHOLDS.suggestion).label).toBe('Close — check the text');
    expect(matchVerdict(THRESHOLDS.suggestion - 0.01).label).toBe('Close — check the text');
  });

  it('never returns a percentage', () => {
    // THE point of Phase 4. If a "%" reappears in a label, the operator is
    // being invited to read a product of two factors as a probability.
    for (const score of [0, 0.3, 0.6, 0.7, 0.85, 1]) {
      expect(matchVerdict(score).label).not.toMatch(/%/);
    }
  });

  it('survives junk without throwing', () => {
    // This runs inside a render during a service.
    expect(matchVerdict(null).label).toBeTruthy();
    expect(matchVerdict(undefined).label).toBeTruthy();
    expect(matchVerdict(NaN).label).toBeTruthy();
  });
});

describe('runner-up disclosure', () => {
  it('discloses a close runner-up', () => {
    const line = runnerUpDisclosure({ reference: 'John 3:17', relative: 0.9 });
    expect(line).toBe('Also considered: John 3:17.');
  });

  it('stays quiet when the winner was clear', () => {
    // A disclosure that fires on every fourth suggestion trains people to stop
    // reading it, so it must be reserved for genuine indecision.
    expect(runnerUpDisclosure({ reference: 'John 3:17', relative: 0.4 })).toBeNull();
  });

  it('uses a stricter ratio than the scorer flags ambiguity at', () => {
    // The scorer marks ambiguity at 0.75; disclosure is at 0.85. Asserted so
    // the two numbers cannot drift into meaning the same thing by accident.
    expect(RUNNER_UP_DISCLOSURE_RATIO).toBeGreaterThan(0.75);
  });

  it('renders no score for the runner-up', () => {
    // Two percentages on one card invites picking the larger number instead of
    // reading the verse, which defeats the purpose of disclosing it at all.
    const line = runnerUpDisclosure({ reference: 'John 3:17', relative: 0.92 });
    expect(line).not.toMatch(/%/);
  });

  it('handles a missing runner-up', () => {
    expect(runnerUpDisclosure(null)).toBeNull();
    expect(runnerUpDisclosure(undefined)).toBeNull();
    expect(runnerUpDisclosure({})).toBeNull();
    expect(shouldDiscloseRunnerUp(null)).toBe(false);
  });

  it('ignores a runner-up with no reference', () => {
    expect(shouldDiscloseRunnerUp({ relative: 0.99 })).toBe(false);
  });
});

describe('describeMatch', () => {
  it('returns the verdict and the disclosure together', () => {
    const described = describeMatch({
      confidence: 0.9,
      runnerUp: { reference: 'John 3:17', relative: 0.88 },
    });
    expect(described.label).toBe('Strong match');
    expect(described.tone).toBe('high');
    expect(described.disclosure).toBe('Also considered: John 3:17.');
  });

  it('works with a plain spoken-reference match', () => {
    // A spoken reference has no runner-up and no ambiguity — the card should
    // say so by omission, not by printing "no runner-up".
    const described = describeMatch({ confidence: 0.95 });
    expect(described.label).toBe('Strong match');
    expect(described.disclosure).toBeNull();
  });

  it('survives a suggestion with nothing on it', () => {
    expect(() => describeMatch(null)).not.toThrow();
    expect(describeMatch(null).label).toBeTruthy();
  });
});

describe('the card renders words, not percentages', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const card = readFileSync(
    resolve(here, '../../components/Speech/VerseSuggestionCard.jsx'),
    'utf8'
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('no longer renders a percentage match', () => {
    // The literal that this phase exists to remove.
    expect(card).not.toMatch(/%\s*match/);
    expect(card).not.toMatch(/Math\.round\([^)]*\*\s*100\)/);
  });

  it('does not reach into the suggestion confidence to grade it', () => {
    expect(card).toContain('describeMatch');
  });
});