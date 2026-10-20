export interface StrategySummary {
  objective: string;
  confidence: number;
  payoff: number;
}

export const summarizeStrategy = (objective: string, confidence: number, payoff: number): StrategySummary => ({
  objective,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  payoff: Number.isFinite(payoff) ? Math.max(0, Math.min(1, payoff)) : 0,
});
