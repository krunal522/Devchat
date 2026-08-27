import { create } from 'zustand';
import {
  workspaceApi,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceInvitation,
} from '../services/workspaceApi';
import { useChatStore } from './chatStore';

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeWorkspace: Workspace | null;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  isLoading: boolean;
  isMembersLoading: boolean;
  isInvitationsLoading: boolean;

  loadWorkspaces: () => Promise<void>;
  setActiveWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (data: { name: string; logoUrl?: string; description?: string; settingsJson?: string }) => Promise<Workspace>;
  updateWorkspace: (id: string, data: { name?: string; logoUrl?: string | null; description?: string | null; settingsJson?: string | null }) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  leaveWorkspace: (id: string) => Promise<void>;
  joinWorkspace: (inviteCode: string) => Promise<Workspace>;

  loadMembers: (workspaceId: string, search?: string) => Promise<void>;
  updateMemberRole: (workspaceId: string, memberUserId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER') => Promise<void>;
  removeMember: (workspaceId: string, memberUserId: string) => Promise<void>;

  loadInvitations: (workspaceId: string) => Promise<void>;
  createInvitation: (workspaceId: string, data: { email: string; role?: 'ADMIN' | 'MEMBER' }) => Promise<WorkspaceInvitation>;
  cancelInvitation: (workspaceId: string, invitationId: string) => Promise<void>;
  acceptInvitation: (token: string) => Promise<Workspace>;
  rejectInvitation: (token: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  activeWorkspace: null,
  members: [],
  invitations: [],
  isLoading: false,
  isMembersLoading: false,
  isInvitationsLoading: false,

  loadWorkspaces: async () => {
    set({ isLoading: true });
    try {
      const list = await workspaceApi.getWorkspaces();
      const storedActiveId = localStorage.getItem('devchat_active_workspace_id');
      const currentActiveId = get().activeWorkspaceId || storedActiveId;
      const initialActive = list.find((w) => w.id === currentActiveId) || list[0] || null;

      if (initialActive) {
        localStorage.setItem('devchat_active_workspace_id', initialActive.id);
        get().loadMembers(initialActive.id);
      }

      set({
        workspaces: list,
        activeWorkspaceId: initialActive ? initialActive.id : null,
        activeWorkspace: initialActive,
        isLoading: false,
      });

      if (initialActive) {
        // Trigger channel reload scoped to active workspace
        useChatStore.getState().loadChannels();
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      set({ isLoading: false });
    }
  },

  setActiveWorkspace: async (workspaceId: string) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (ws) {
      localStorage.setItem('devchat_active_workspace_id', ws.id);
      set({ activeWorkspaceId: ws.id, activeWorkspace: ws });
      await get().loadMembers(ws.id);
      // Reload channels for selected workspace
      await useChatStore.getState().loadChannels();
      await useChatStore.getState().loadDMChannels();
    }
  },

  createWorkspace: async (data) => {
    set({ isLoading: true });
    try {
      const newWs = await workspaceApi.createWorkspace(data);
      const updatedList = [...get().workspaces, newWs];
      localStorage.setItem('devchat_active_workspace_id', newWs.id);
      set({
        workspaces: updatedList,
        activeWorkspaceId: newWs.id,
        activeWorkspace: newWs,
        isLoading: false,
      });
      await useChatStore.getState().loadChannels();
      return newWs;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  updateWorkspace: async (id, data) => {
    set({ isLoading: true });
    try {
      const updated = await workspaceApi.updateWorkspace(id, data);
      const updatedList = get().workspaces.map((w) => (w.id === id ? updated : w));
      set({
        workspaces: updatedList,
        activeWorkspace: get().activeWorkspaceId === id ? updated : get().activeWorkspace,
        isLoading: false,
      });
      return updated;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  deleteWorkspace: async (id) => {
    set({ isLoading: true });
    try {
      await workspaceApi.deleteWorkspace(id);
      const remaining = get().workspaces.filter((w) => w.id !== id);
      const nextActive = remaining[0] || null;
      if (nextActive) {
        localStorage.setItem('devchat_active_workspace_id', nextActive.id);
      } else {
        localStorage.removeItem('devchat_active_workspace_id');
      }
      set({
        workspaces: remaining,
        activeWorkspaceId: nextActive ? nextActive.id : null,
        activeWorkspace: nextActive,
        isLoading: false,
      });
      if (nextActive) {
        await useChatStore.getState().loadChannels();
      }
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  leaveWorkspace: async (id) => {
    set({ isLoading: true });
    try {
      await workspaceApi.leaveWorkspace(id);
      const remaining = get().workspaces.filter((w) => w.id !== id);
      const nextActive = remaining[0] || null;
      if (nextActive) {
        localStorage.setItem('devchat_active_workspace_id', nextActive.id);
      } else {
        localStorage.removeItem('devchat_active_workspace_id');
      }
      set({
        workspaces: remaining,
        activeWorkspaceId: nextActive ? nextActive.id : null,
        activeWorkspace: nextActive,
        isLoading: false,
      });
      if (nextActive) {
        await useChatStore.getState().loadChannels();
      }
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  joinWorkspace: async (inviteCode: string) => {
    set({ isLoading: true });
    try {
      const ws = await workspaceApi.joinWorkspace(inviteCode);
      const existingIndex = get().workspaces.findIndex((w) => w.id === ws.id);

      let updatedList: Workspace[];
      if (existingIndex >= 0) {
        updatedList = [...get().workspaces];
        updatedList[existingIndex] = ws;
      } else {
        updatedList = [...get().workspaces, ws];
      }

      localStorage.setItem('devchat_active_workspace_id', ws.id);
      set({
        workspaces: updatedList,
        activeWorkspaceId: ws.id,
        activeWorkspace: ws,
        isLoading: false,
      });
      await useChatStore.getState().loadChannels();
      return ws;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  loadMembers: async (workspaceId, search) => {
    set({ isMembersLoading: true });
    try {
      const members = await workspaceApi.getWorkspaceMembers(workspaceId, search);
      set({ members, isMembersLoading: false });
    } catch (err) {
      console.error('Failed to load workspace members:', err);
      set({ isMembersLoading: false });
    }
  },

  updateMemberRole: async (workspaceId, memberUserId, role) => {
    try {
      const updatedMembers = await workspaceApi.updateMemberRole(workspaceId, memberUserId, role);
      set({ members: updatedMembers });
      await get().loadWorkspaces();
    } catch (err) {
      console.error('Failed to update member role:', err);
      throw err;
    }
  },

  removeMember: async (workspaceId, memberUserId) => {
    try {
      await workspaceApi.removeMember(workspaceId, memberUserId);
      set((state) => ({
        members: state.members.filter((m) => m.id !== memberUserId),
      }));
    } catch (err) {
      console.error('Failed to remove member:', err);
      throw err;
    }
  },

  loadInvitations: async (workspaceId) => {
    set({ isInvitationsLoading: true });
    try {
      const invitations = await workspaceApi.getPendingInvitations(workspaceId);
      set({ invitations, isInvitationsLoading: false });
    } catch (err) {
      console.error('Failed to load pending invitations:', err);
      set({ isInvitationsLoading: false });
    }
  },

  createInvitation: async (workspaceId, data) => {
    try {
      const inv = await workspaceApi.createInvitation(workspaceId, data);
      set((state) => ({
        invitations: [inv, ...state.invitations],
      }));
      return inv;
    } catch (err) {
      console.error('Failed to create invitation:', err);
      throw err;
    }
  },

  cancelInvitation: async (workspaceId, invitationId) => {
    try {
      await workspaceApi.cancelInvitation(workspaceId, invitationId);
      set((state) => ({
        invitations: state.invitations.filter((i) => i.id !== invitationId),
      }));
    } catch (err) {
      console.error('Failed to cancel invitation:', err);
      throw err;
    }
  },

  acceptInvitation: async (token) => {
    set({ isLoading: true });
    try {
      const ws = await workspaceApi.acceptInvitation(token);
      await get().loadWorkspaces();
      await get().setActiveWorkspace(ws.id);
      set({ isLoading: false });
      return ws;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  rejectInvitation: async (token) => {
    try {
      await workspaceApi.rejectInvitation(token);
    } catch (err) {
      console.error('Failed to reject invitation:', err);
      throw err;
    }
  },
}));
