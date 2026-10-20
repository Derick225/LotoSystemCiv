export interface ValidationSummary {
  check: string;
  passed: boolean;
  score: number;
}

export const summarizeValidation = (check: string, passed: boolean, score: number): ValidationSummary => ({
  check,
  passed: Boolean(passed),
  score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
});
