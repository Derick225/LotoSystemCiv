export interface ControlsSummary {
  control: string;
  enabled: boolean;
}

export const summarizeControls = (control: string, enabled: boolean): ControlsSummary => ({
  control,
  enabled: Boolean(enabled),
});
