export const DEFAULT_PROJECTION_BUDGET = 45;

export const BUDGET_WARN_WINDOW = 5;

export const getLineBudgetStatus = (line, budget = DEFAULT_PROJECTION_BUDGET) => {
  const text = typeof line === 'string' ? line : '';
  const length = [...text].length;
  const effectiveBudget =
    typeof budget === 'number' && budget > 0 ? budget : DEFAULT_PROJECTION_BUDGET;
  const over = length > effectiveBudget;
  const near = !over && length > effectiveBudget - BUDGET_WARN_WINDOW;
  return { length, budget: effectiveBudget, over, near, fits: !over };
};

export const computeLineBudgets = (lines, budget = DEFAULT_PROJECTION_BUDGET) => {
  if (!Array.isArray(lines)) return [];
  return lines.map((line, index) => ({
    index,
    lineNumber: index + 1,
    ...getLineBudgetStatus(line, budget),
  }));
};

export const summarizeBudgets = (statuses) => {
  const list = Array.isArray(statuses) ? statuses : [];
  const overLines = list.filter((status) => status.over).map((status) => status.lineNumber);
  const nearCount = list.filter((status) => status.near).length;
  return {
    total: list.length,
    overCount: overLines.length,
    nearCount,
    overLines,
  };
};
