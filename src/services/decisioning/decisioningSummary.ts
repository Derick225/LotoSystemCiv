export interface DecisioningSummary {
  option: string;
  weight: number;
}

export const summarizeDecisioning = (option: string, weight: number): DecisioningSummary => ({
  option,
  weight: Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : 0,
});
