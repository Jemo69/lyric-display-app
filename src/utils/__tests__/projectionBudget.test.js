import { describe, it, expect } from 'vitest';
import {
  BUDGET_WARN_WINDOW,
  DEFAULT_PROJECTION_BUDGET,
  computeLineBudgets,
  getLineBudgetStatus,
  summarizeBudgets,
} from '../projectionBudget';

describe('projectionBudget', () => {
  it('uses the 16:9 projection budget by default', () => {
    expect(DEFAULT_PROJECTION_BUDGET).toBe(45);
  });

  describe('getLineBudgetStatus', () => {
    it('marks short lines as fitting', () => {
      const status = getLineBudgetStatus('Amazing grace', 45);
      expect(status).toMatchObject({ length: 13, budget: 45, over: false, fits: true });
    });

    it('flags overlong lines before projection', () => {
      const status = getLineBudgetStatus('a'.repeat(46), 45);
      expect(status.over).toBe(true);
      expect(status.fits).toBe(false);
    });

    it('marks lines inside the warn window as near', () => {
      const status = getLineBudgetStatus('a'.repeat(DEFAULT_PROJECTION_BUDGET - BUDGET_WARN_WINDOW + 1));
      expect(status.over).toBe(false);
      expect(status.near).toBe(true);
    });

    it('counts unicode characters, not UTF-16 units', () => {
      const status = getLineBudgetStatus('🎵'.repeat(10), 45);
      expect(status.length).toBe(10);
    });
  });

  describe('computeLineBudgets + summarizeBudgets', () => {
    it('numbers lines from 1 and summarizes overlong lines', () => {
      const lines = ['short line', 'b'.repeat(50), 'c'.repeat(60)];
      const statuses = computeLineBudgets(lines, 45);
      expect(statuses.map((status) => status.lineNumber)).toEqual([1, 2, 3]);

      const summary = summarizeBudgets(statuses);
      expect(summary).toMatchObject({ total: 3, overCount: 2, overLines: [2, 3] });
    });

    it('returns an empty summary for empty input', () => {
      expect(summarizeBudgets(computeLineBudgets([], 45))).toMatchObject({
        total: 0,
        overCount: 0,
        overLines: [],
      });
    });
  });
});
