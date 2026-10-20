export interface NotificationSummary {
  channel: string;
  enabled: boolean;
}

export const summarizeNotification = (channel: string, enabled: boolean): NotificationSummary => ({
  channel,
  enabled: Boolean(enabled),
});
