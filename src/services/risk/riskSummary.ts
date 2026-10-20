export interface RiskSummary {
  symbol: string;
  exposure: number;
}

export const summarizeRisk = (symbol: string, exposure: number): RiskSummary => ({
  symbol,
  exposure: Number.isFinite(exposure) ? Math.max(0, exposure) : 0,
});
