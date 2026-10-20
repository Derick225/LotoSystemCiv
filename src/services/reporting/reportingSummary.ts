export interface ReportingSummary {
  report: string;
  ready: boolean;
}

export const summarizeReporting = (report: string, ready: boolean): ReportingSummary => ({
  report,
  ready: Boolean(ready),
});
