import { create } from 'zustand';

interface UIState {
  isSidebarOpen: boolean;
  isMemberPanelOpen: boolean;
  isCreateChannelModalOpen: boolean;
  isStartDMModalOpen: boolean;
  isSearchModalOpen: boolean;
  activeModal: string | null;
  mobileView: 'list' | 'chat' | 'details';
  setMobileView: (view: 'list' | 'chat' | 'details') => void;

  aiTypingChannelId: string | null;
  aiTypingMode: 'chat' | 'image';
  setAITypingChannelId: (channelId: string | null, mode?: 'chat' | 'image') => void;

  toggleSidebar: () => void;
  toggleMemberPanel: () => void;
  openCreateChannelModal: () => void;
  closeCreateChannelModal: () => void;
  openStartDMModal: () => void;
  closeStartDMModal: () => void;
  openSearchModal: () => void;
  closeSearchModal: () => void;
  toggleSearchModal: () => void;
  setActiveModal: (modal: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  isMemberPanelOpen: false,
  isCreateChannelModalOpen: false,
  isStartDMModalOpen: false,
  isSearchModalOpen: false,
  activeModal: null,
  mobileView: 'list',
  aiTypingChannelId: null,
  aiTypingMode: 'chat',

  setMobileView: (view) => set({ mobileView: view }),
  setAITypingChannelId: (channelId, mode = 'chat') => set({ aiTypingChannelId: channelId, aiTypingMode: mode }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleMemberPanel: () => set((s) => ({ isMemberPanelOpen: !s.isMemberPanelOpen })),
  openCreateChannelModal: () => set({ isCreateChannelModalOpen: true }),
  closeCreateChannelModal: () => set({ isCreateChannelModalOpen: false }),
  openStartDMModal: () => set({ isStartDMModalOpen: true }),
  closeStartDMModal: () => set({ isStartDMModalOpen: false }),
  openSearchModal: () => set({ isSearchModalOpen: true }),
  closeSearchModal: () => set({ isSearchModalOpen: false }),
  toggleSearchModal: () => set((s) => ({ isSearchModalOpen: !s.isSearchModalOpen })),
  setActiveModal: (modal) => set({ activeModal: modal }),
}));
