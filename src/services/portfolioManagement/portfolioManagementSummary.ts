export interface PortfolioManagementSummary {
  strategy: string;
  risk: number;
}

export const summarizePortfolioManagement = (strategy: string, risk: number): PortfolioManagementSummary => ({
  strategy,
  risk: Number.isFinite(risk) ? Math.max(0, Math.min(1, risk)) : 0,
});
