export interface ExecutionSummary {
  action: string;
  successful: boolean;
  durationMs: number;
}

export const summarizeExecution = (action: string, successful: boolean, durationMs: number): ExecutionSummary => ({
  action,
  successful: Boolean(successful),
  durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
});
