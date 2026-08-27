import api from './api';

export interface AdminStats {
  totalUsers: number;
  onlineCount: number;
  totalChannels: number;
  totalMessages: number;
  totalFiles: number;
  totalStorageMB: number;
}

export interface AuditLogItem {
  id: string;
  action: string;
  details: string;
  ipAddress?: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export const adminApi = {
  getStats: async (): Promise<AdminStats> => {
    const res = await api.get('/admin/stats');
    return res.data.data;
  },

  getAuditLogs: async (page = 1, limit = 50): Promise<{ logs: AuditLogItem[]; pagination: any }> => {
    const res = await api.get(`/admin/audit-logs?page=${page}&limit=${limit}`);
    return {
      logs: res.data.data,
      pagination: res.data.pagination,
    };
  },
};
