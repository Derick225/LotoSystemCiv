export interface PreferenceSummary {
  id: string;
  saved: boolean;
}

export const summarizePreferences = (id: string, saved: boolean): PreferenceSummary => ({
  id,
  saved: Boolean(saved),
});
