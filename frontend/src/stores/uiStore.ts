import { create } from 'zustand';

interface UIState {
  isSidebarOpen: boolean;
  isMemberPanelOpen: boolean;
  isCreateChannelModalOpen: boolean;
  isStartDMModalOpen: boolean;
  mobileView: 'list' | 'chat' | 'details';
  setMobileView: (view: 'list' | 'chat' | 'details') => void;

  aiTypingChannelId: string | null;
  setAITypingChannelId: (channelId: string | null) => void;

  toggleSidebar: () => void;
  toggleMemberPanel: () => void;
  openCreateChannelModal: () => void;
  closeCreateChannelModal: () => void;
  openStartDMModal: () => void;
  closeStartDMModal: () => void;
  setActiveModal: (modal: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  isMemberPanelOpen: false,
  isCreateChannelModalOpen: false,
  isStartDMModalOpen: false,
  activeModal: null,
  mobileView: 'list',
  aiTypingChannelId: null,

  setMobileView: (view) => set({ mobileView: view }),
  setAITypingChannelId: (channelId) => set({ aiTypingChannelId: channelId }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleMemberPanel: () => set((s) => ({ isMemberPanelOpen: !s.isMemberPanelOpen })),
  openCreateChannelModal: () => set({ isCreateChannelModalOpen: true }),
  closeCreateChannelModal: () => set({ isCreateChannelModalOpen: false }),
  openStartDMModal: () => set({ isStartDMModalOpen: true }),
  closeStartDMModal: () => set({ isStartDMModalOpen: false }),
  setActiveModal: (modal) => set({ activeModal: modal }),
}));
