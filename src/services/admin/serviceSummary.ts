export interface AdminServiceSummary {
  activeUsers: number;
  totalUsers: number;
  staleSessions: number;
}

export const summarizeAdminService = (
  activeUsers: number,
  totalUsers: number,
  staleSessions: number,
): AdminServiceSummary => ({
  activeUsers,
  totalUsers,
  staleSessions,
});
