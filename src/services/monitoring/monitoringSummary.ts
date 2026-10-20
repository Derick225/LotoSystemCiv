export interface MonitoringSummary {
  signal: string;
  status: 'healthy' | 'warning' | 'critical';
}

export const summarizeMonitoring = (signal: string, status: 'healthy' | 'warning' | 'critical'): MonitoringSummary => ({
  signal,
  status,
});
