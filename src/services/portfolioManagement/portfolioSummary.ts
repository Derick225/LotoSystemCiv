export interface PortfolioManagementSummary {
  id: string;
  exposure: number;
}

export const summarizePortfolioManagement = (id: string, exposure: number): PortfolioManagementSummary => ({
  id,
  exposure: Number.isFinite(exposure) ? Math.max(0, exposure) : 0,
});
