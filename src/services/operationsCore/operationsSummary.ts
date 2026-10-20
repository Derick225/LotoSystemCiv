export interface OperationsSummary {
  label: string;
  running: boolean;
}

export const summarizeOperationsCore = (label: string, running: boolean): OperationsSummary => ({
  label,
  running: Boolean(running),
});
