export interface ControlSummary {
  rule: string;
  passed: boolean;
}

export const summarizeControls = (rule: string, passed: boolean): ControlSummary => ({
  rule,
  passed: Boolean(passed),
});
