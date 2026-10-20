export interface AuxiliarySummary {
  label: string;
  active: boolean;
}

export const summarizeAuxiliary = (label: string, active: boolean): AuxiliarySummary => ({
  label,
  active: Boolean(active),
});
