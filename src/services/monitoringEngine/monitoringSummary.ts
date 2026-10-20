export interface MonitoringEngineSummary {
  label: string;
  healthy: boolean;
}

export const summarizeMonitoringEngine = (label: string, healthy: boolean): MonitoringEngineSummary => ({
  label,
  healthy: Boolean(healthy),
});
