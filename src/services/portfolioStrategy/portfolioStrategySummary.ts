export interface PortfolioStrategySummary {
  strategy: string;
  concentration: number;
}

export const summarizePortfolioStrategy = (strategy: string, concentration: number): PortfolioStrategySummary => ({
  strategy,
  concentration: Number.isFinite(concentration) ? Math.max(0, Math.min(1, concentration)) : 0,
});
