export interface AutomationSummary {
  batchId: string;
  queued: number;
}

export const summarizeAutomation = (batchId: string, queued: number): AutomationSummary => ({
  batchId,
  queued: Number.isFinite(queued) ? Math.max(0, queued) : 0,
});
