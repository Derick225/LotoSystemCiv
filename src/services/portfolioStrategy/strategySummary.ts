export interface PortfolioStrategySummary {
  label: string;
  conviction: number;
}

export const summarizePortfolioStrategy = (label: string, conviction: number): PortfolioStrategySummary => ({
  label,
  conviction: Number.isFinite(conviction) ? Math.max(0, Math.min(1, conviction)) : 0,
});
