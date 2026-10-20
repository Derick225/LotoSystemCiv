export interface PortfolioSummary {
  name: string;
  allocation: number;
}

export const summarizePortfolio = (name: string, allocation: number): PortfolioSummary => ({
  name,
  allocation: Number.isFinite(allocation) ? Math.max(0, Math.min(1, allocation)) : 0,
});
