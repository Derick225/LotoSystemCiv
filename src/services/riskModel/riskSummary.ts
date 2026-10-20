export interface RiskModelSummary {
  name: string;
  exposure: number;
}

export const summarizeRiskModel = (name: string, exposure: number): RiskModelSummary => ({
  name,
  exposure: Number.isFinite(exposure) ? Math.max(0, exposure) : 0,
});
