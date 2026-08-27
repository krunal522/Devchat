import api from './api';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string | null;
  inviteCode: string;
  settingsJson?: string | null;
  myRole: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
  updatedAt: string;
  _count?: {
    members: number;
    channels: number;
  };
}

export interface WorkspaceMember {
  memberId: string;
  id: string;
  email?: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  statusText?: string | null;
  isOnline: boolean;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  token: string;
  role: 'ADMIN' | 'MEMBER';
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  createdBy?: {
    id: string;
    displayName: string;
    username: string;
  };
  workspace?: {
    id: string;
    name: string;
    logoUrl?: string | null;
    description?: string | null;
  };
}

export const workspaceApi = {
  getWorkspaces: async (): Promise<Workspace[]> => {
    const res = await api.get('/workspaces');
    return res.data.data;
  },

  createWorkspace: async (data: { name: string; logoUrl?: string; description?: string; settingsJson?: string }): Promise<Workspace> => {
    const res = await api.post('/workspaces', data);
    return res.data.data;
  },

  getWorkspace: async (id: string): Promise<Workspace> => {
    const res = await api.get(`/workspaces/${id}`);
    return res.data.data;
  },

  updateWorkspace: async (id: string, data: { name?: string; logoUrl?: string | null; description?: string | null; settingsJson?: string | null }): Promise<Workspace> => {
    const res = await api.patch(`/workspaces/${id}`, data);
    return res.data.data;
  },

  deleteWorkspace: async (id: string): Promise<void> => {
    await api.delete(`/workspaces/${id}`);
  },

  leaveWorkspace: async (id: string): Promise<void> => {
    await api.post(`/workspaces/${id}/leave`);
  },

  joinWorkspace: async (inviteCode: string): Promise<Workspace> => {
    const res = await api.post('/workspaces/join', { inviteCode });
    return res.data.data;
  },

  getWorkspaceMembers: async (workspaceId: string, search?: string): Promise<WorkspaceMember[]> => {
    const res = await api.get(`/workspaces/${workspaceId}/members`, {
      params: { search },
    });
    return res.data.data;
  },

  updateMemberRole: async (workspaceId: string, memberUserId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER'): Promise<WorkspaceMember[]> => {
    const res = await api.patch(`/workspaces/${workspaceId}/members/${memberUserId}/role`, { role });
    return res.data.data;
  },

  removeMember: async (workspaceId: string, memberUserId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/members/${memberUserId}`);
  },

  createInvitation: async (workspaceId: string, data: { email: string; role?: 'ADMIN' | 'MEMBER' }): Promise<WorkspaceInvitation> => {
    const res = await api.post(`/workspaces/${workspaceId}/invitations`, data);
    return res.data.data;
  },

  getPendingInvitations: async (workspaceId: string): Promise<WorkspaceInvitation[]> => {
    const res = await api.get(`/workspaces/${workspaceId}/invitations`);
    return res.data.data;
  },

  cancelInvitation: async (workspaceId: string, invitationId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/invitations/${invitationId}`);
  },

  getInvitationByToken: async (token: string): Promise<WorkspaceInvitation> => {
    const res = await api.get(`/workspaces/invitations/token/${token}`);
    return res.data.data;
  },

  acceptInvitation: async (token: string): Promise<Workspace> => {
    const res = await api.post(`/workspaces/invitations/token/${token}/accept`);
    return res.data.data;
  },

  rejectInvitation: async (token: string): Promise<void> => {
    await api.post(`/workspaces/invitations/token/${token}/reject`);
  },

  exportWorkspace: async (workspaceId: string, workspaceSlug: string): Promise<void> => {
    const res = await api.get(`/workspaces/${workspaceId}/export`, {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `devchat_backup_${workspaceSlug}_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
