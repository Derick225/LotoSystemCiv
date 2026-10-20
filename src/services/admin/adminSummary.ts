export interface AdminSummary {
  user: string;
  role: string;
  active: boolean;
}

export const summarizeAdmin = (user: string, role: string, active: boolean): AdminSummary => ({
  user,
  role,
  active: Boolean(active),
});
