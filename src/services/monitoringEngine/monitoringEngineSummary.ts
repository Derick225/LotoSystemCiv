export interface MonitoringEngineSummary {
  engine: string;
  health: number;
}

export const summarizeMonitoringEngine = (engine: string, health: number): MonitoringEngineSummary => ({
  engine,
  health: Number.isFinite(health) ? Math.max(0, Math.min(1, health)) : 0,
});
