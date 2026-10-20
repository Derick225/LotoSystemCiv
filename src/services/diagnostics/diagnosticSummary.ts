export interface DiagnosticSummary {
  anomaly: string;
  severity: number;
}

export const summarizeDiagnostics = (anomaly: string, severity: number): DiagnosticSummary => ({
  anomaly,
  severity: Number.isFinite(severity) ? Math.max(0, Math.min(1, severity)) : 0,
});
