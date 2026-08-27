import { create } from 'zustand';
import type { Channel, DMChannel } from '../types/channel';
import type { Message } from '../types/message';
import { channelApi } from '../services/channelApi';
import { messageApi } from '../services/messageApi';
import { getSocket } from '../services/socketManager';
import { useAuthStore } from './authStore';

interface ChatState {
  // Channels
  channels: Channel[];
  dmChannels: DMChannel[];
  activeChannelId: string | null;
  activeChannel: Channel | null;

  // Messages
  messages: Record<string, Message[]>; // channelId → messages
  hasMore: Record<string, boolean>;
  cursors: Record<string, string | null>;
  isLoadingMessages: boolean;

  // Unread message counters
  unreadCounts: Record<string, number>;
  clearUnread: (channelId: string) => void;

  // Thread Drawer
  activeThreadMessage: Message | null;
  activeThreadReplies: Message[];
  openThread: (message: Message) => void;
  closeThread: () => void;
  setThreadReplies: (replies: Message[]) => void;

  // Quoted Reply
  replyingToMessage: Message | null;
  setReplyingToMessage: (message: Message | null) => void;

  // Active AI Session Filtering (ChatGPT Style)
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;

  // Actions
  loadChannels: () => Promise<void>;
  loadDMChannels: () => Promise<void>;
  setActiveChannel: (channelId: string) => Promise<void>;
  loadMessages: (channelId: string) => Promise<void>;
  loadMoreMessages: (channelId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string, channelId: string) => void;
  addChannel: (channel: Channel) => void;
  createChannel: (data: { name: string; description?: string; type?: 'PUBLIC' | 'PRIVATE' }) => Promise<Channel>;
  joinChannel: (channelId: string) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;
  openDM: (targetUserId: string) => Promise<void>;
  updateUserLastSeen: (userId: string, lastSeenAt: string) => void;
  clearChannelMessages: (channelId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  channels: [],
  dmChannels: [],
  activeChannelId: null,
  activeChannel: null,

  messages: {},
  hasMore: {},
  cursors: {},
  isLoadingMessages: false,

  unreadCounts: {},

  activeThreadMessage: null,
  activeThreadReplies: [],
  replyingToMessage: null,
  activeSessionId: null,

  setActiveSessionId: (sessionId: string | null) => {
    set({ activeSessionId: sessionId });
  },

  openThread: (message: Message) => {
    set({ activeThreadMessage: message, activeThreadReplies: [] });
  },

  closeThread: () => {
    set({ activeThreadMessage: null, activeThreadReplies: [] });
  },

  setThreadReplies: (replies: Message[]) => {
    set({ activeThreadReplies: replies });
  },

  setReplyingToMessage: (message: Message | null) => {
    set({ replyingToMessage: message });
  },

  clearUnread: (channelId: string) => {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [channelId]: 0,
      },
    }));
  },

  loadChannels: async () => {
    try {
      const channels = await channelApi.getChannels();
      set({ channels });
      const currentActive = get().activeChannelId;
      if (!currentActive && channels && channels.length > 0) {
        await get().setActiveChannel(channels[0].id);
      }
    } catch (error) {
      console.error('Failed to load channels:', error);
    }
  },

  loadDMChannels: async () => {
    try {
      const dmChannels = await channelApi.getDMChannels();
      set({ dmChannels });

      // If current active channel is a DM, update activeChannel object to ensure latest user details
      const activeId = get().activeChannelId;
      const currentActiveChannel = get().activeChannel;
      if (activeId && currentActiveChannel?.type === 'DIRECT') {
        const dm = dmChannels.find((d) => d.id === activeId);
        if (dm && dm.otherUser) {
          set({
            activeChannel: {
              id: dm.id,
              name: dm.otherUser.displayName || dm.otherUser.username,
              slug: dm.id,
              description: `@${dm.otherUser.username}`,
              type: 'DIRECT',
              createdById: '',
              createdAt: dm.updatedAt,
              updatedAt: dm.updatedAt,
              createdBy: {
                id: dm.otherUser.id,
                username: dm.otherUser.username,
                displayName: dm.otherUser.displayName,
                avatarUrl: dm.otherUser.avatarUrl,
              },
              _count: { members: 2, messages: 0 },
            },
          });
        }
      }
    } catch (error) {
      console.error('Failed to load DM channels:', error);
    }
  },

  setActiveChannel: async (channelId: string) => {
    const { channels, dmChannels, messages, loadMessages, joinChannel } = get();
    let channel = channels.find((c) => c.id === channelId) || null;

    if (!channel) {
      const dm = dmChannels.find((d) => d.id === channelId);
      if (dm && dm.otherUser) {
        channel = {
          id: dm.id,
          name: dm.otherUser.displayName || dm.otherUser.username,
          slug: dm.id,
          description: `@${dm.otherUser.username}`,
          type: 'DIRECT',
          createdById: '',
          createdAt: dm.updatedAt,
          updatedAt: dm.updatedAt,
          createdBy: {
            id: dm.otherUser.id,
            username: dm.otherUser.username,
            displayName: dm.otherUser.displayName,
            avatarUrl: dm.otherUser.avatarUrl,
          },
          _count: { members: 2, messages: 0 },
          isMember: true,
        };
      } else {
        try {
          const rawChannel: any = await channelApi.getChannel(channelId);
          if (rawChannel && rawChannel.type === 'DIRECT') {
            const currentUserId = useAuthStore.getState().user?.id;
            const members = await channelApi.getMembers(channelId);
            const otherMember = members.find((m) => m.id !== currentUserId) || members[0];
            channel = {
              ...rawChannel,
              name: otherMember?.displayName || otherMember?.username || rawChannel.name,
              description: `@${otherMember?.username || ''}`,
              createdBy: {
                id: otherMember?.id || rawChannel.createdById,
                username: otherMember?.username || '',
                displayName: otherMember?.displayName || '',
                avatarUrl: otherMember?.avatarUrl,
              },
            };
          } else {
            channel = rawChannel;
          }
        } catch (fetchErr) {
          console.error('Failed to fetch channel fallback:', fetchErr);
        }
      }
    }

    set((state) => ({
      activeChannelId: channelId,
      activeChannel: channel,
      activeSessionId: null,
      unreadCounts: {
        ...state.unreadCounts,
        [channelId]: 0,
      },
    }));

    // Join room over WebSocket so real-time messages arrive instantly
    getSocket()?.emit('channel:join', channelId);

    // If channel exists but user is not a member yet (e.g. public channel), auto-join
    if (channel && channel.type !== 'DIRECT' && channel.isMember === false) {
      try {
        await joinChannel(channelId);
      } catch (err) {
        console.error('Failed to auto-join channel:', err);
      }
    }

    // Load messages if not cached
    if (!messages[channelId]) {
      await loadMessages(channelId);
    }
  },

  deleteChannel: async (channelId: string) => {
    try {
      await channelApi.deleteChannel(channelId);
      const remainingChannels = get().channels.filter((c) => c.id !== channelId);
      set({ channels: remainingChannels });
      if (get().activeChannelId === channelId) {
        if (remainingChannels.length > 0) {
          await get().setActiveChannel(remainingChannels[0].id);
        } else {
          set({ activeChannelId: null, activeChannel: null });
        }
      }
    } catch (error) {
      console.error('Failed to delete channel:', error);
      throw error;
    }
  },

  openDM: async (targetUserId: string) => {
    try {
      const dmChannel = await channelApi.getOrCreateDM(targetUserId);
      await get().loadDMChannels();

      const dm = get().dmChannels.find((d) => d.id === dmChannel.id);
      if (dm && dm.otherUser) {
        const otherUser = dm.otherUser;
        set((state) => ({
          activeChannelId: dm.id,
          activeChannel: {
            id: dm.id,
            name: otherUser.displayName || otherUser.username,
            slug: dm.id,
            description: `@${otherUser.username}`,
            type: 'DIRECT',
            createdById: '',
            createdAt: dm.updatedAt,
            updatedAt: dm.updatedAt,
            createdBy: {
              id: otherUser.id,
              username: otherUser.username,
              displayName: otherUser.displayName,
              avatarUrl: otherUser.avatarUrl,
            },
            _count: { members: 2, messages: 0 },
            isMember: true,
          },
          unreadCounts: {
            ...state.unreadCounts,
            [dm.id]: 0,
          },
        }));
        await get().loadMessages(dm.id);
      } else {
        await get().setActiveChannel(dmChannel.id);
      }
    } catch (error) {
      console.error('Failed to open DM:', error);
    }
  },

  loadMessages: async (channelId: string) => {
    set({ isLoadingMessages: true });
    try {
      const data = await messageApi.getMessages(channelId);
      set((state) => ({
        messages: { ...state.messages, [channelId]: data.messages },
        hasMore: { ...state.hasMore, [channelId]: data.hasMore },
        cursors: { ...state.cursors, [channelId]: data.nextCursor },
        isLoadingMessages: false,
      }));
    } catch (error) {
      console.error('Failed to load messages:', error);
      set({ isLoadingMessages: false });
    }
  },

  loadMoreMessages: async (channelId: string) => {
    const { cursors, hasMore } = get();
    if (!hasMore[channelId] || !cursors[channelId]) return;

    try {
      const data = await messageApi.getMessages(channelId, cursors[channelId]!);
      set((state) => ({
        messages: {
          ...state.messages,
          [channelId]: [...data.messages, ...(state.messages[channelId] || [])],
        },
        hasMore: { ...state.hasMore, [channelId]: data.hasMore },
        cursors: { ...state.cursors, [channelId]: data.nextCursor },
      }));
    } catch (error) {
      console.error('Failed to load more messages:', error);
    }
  },

  addMessage: (message: Message) => {
    const currentActiveId = get().activeChannelId;
    const isCurrentlyActive = currentActiveId === message.channelId;

    set((state) => {
      const existing = state.messages[message.channelId] || [];
      if (existing.some((m) => m.id === message.id)) {
        return state;
      }

      const newUnreads = { ...state.unreadCounts };
      if (!isCurrentlyActive) {
        newUnreads[message.channelId] = (newUnreads[message.channelId] || 0) + 1;
      }

      if (message.parentId) {
        const updatedExisting = existing.map((m) => {
          if (m.id === message.parentId) {
            return {
              ...m,
              _count: {
                ...m._count,
                replies: (m._count?.replies || 0) + 1,
              },
            };
          }
          return m;
        });

        const activeThread = state.activeThreadMessage;
        const updatedActiveThread =
          activeThread && activeThread.id === message.parentId
            ? {
                ...activeThread,
                _count: {
                  ...activeThread._count,
                  replies: (activeThread._count?.replies || 0) + 1,
                },
              }
            : activeThread;

        const currentReplies = state.activeThreadReplies || [];
        const isCurrentThread = activeThread && activeThread.id === message.parentId;
        const updatedReplies = isCurrentThread
          ? [...currentReplies.filter((r) => r.id !== message.id), message]
          : currentReplies;

        return {
          unreadCounts: newUnreads,
          activeThreadMessage: updatedActiveThread,
          activeThreadReplies: updatedReplies,
          messages: {
            ...state.messages,
            [message.channelId]: updatedExisting,
          },
        };
      }

      const nextSessionId = state.activeSessionId === 'new' ? null : state.activeSessionId;

      return {
        unreadCounts: newUnreads,
        activeSessionId: nextSessionId,
        messages: {
          ...state.messages,
          [message.channelId]: [...existing, message],
        },
      };
    });
  },

  updateMessage: (message: Message) => {
    set((state) => {
      const updatedChannelMessages = (state.messages[message.channelId] || []).map((m) =>
        m.id === message.id ? message : m
      );

      const updatedThreadMessage =
        state.activeThreadMessage?.id === message.id ? message : state.activeThreadMessage;

      const updatedThreadReplies = (state.activeThreadReplies || []).map((m) =>
        m.id === message.id ? message : m
      );

      return {
        messages: {
          ...state.messages,
          [message.channelId]: updatedChannelMessages,
        },
        activeThreadMessage: updatedThreadMessage,
        activeThreadReplies: updatedThreadReplies,
      };
    });
  },

  removeMessage: (messageId: string, channelId: string) => {
    set((state) => {
      const updatedChannelMessages = (state.messages[channelId] || []).map((m) =>
        m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m
      );

      const updatedThreadMessage =
        state.activeThreadMessage?.id === messageId
          ? { ...state.activeThreadMessage, isDeleted: true, content: 'This message was deleted' }
          : state.activeThreadMessage;

      const updatedThreadReplies = (state.activeThreadReplies || []).map((m) =>
        m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m
      );

      return {
        messages: {
          ...state.messages,
          [channelId]: updatedChannelMessages,
        },
        activeThreadMessage: updatedThreadMessage,
        activeThreadReplies: updatedThreadReplies,
      };
    });
  },

  addChannel: (channel: Channel) => {
    set((state) => {
      const exists = state.channels.some((c) => c.id === channel.id);
      if (exists) return state;
      return { channels: [...state.channels, channel].sort((a, b) => a.name.localeCompare(b.name)) };
    });
  },

  createChannel: async (data) => {
    const channel = await channelApi.createChannel(data);
    get().addChannel(channel);
    return channel;
  },

  joinChannel: async (channelId: string) => {
    try {
      await channelApi.joinChannel(channelId);
      set((state) => ({
        channels: state.channels.map((c) =>
          c.id === channelId ? { ...c, isMember: true } : c
        ),
      }));
    } catch (error) {
      console.error('Failed to join channel:', error);
      throw error;
    }
  },

  updateUserLastSeen: (userId: string, lastSeenAt: string) => {
    set((state) => ({
      dmChannels: state.dmChannels.map((d) =>
        d.otherUser?.id === userId
          ? { ...d, otherUser: { ...d.otherUser, lastSeenAt } }
          : d
      ),
      activeChannel:
        state.activeChannel?.createdBy?.id === userId
          ? {
              ...state.activeChannel,
              createdBy: { ...state.activeChannel.createdBy, lastSeenAt } as any,
            }
          : state.activeChannel,
    }));
  },

  clearChannelMessages: (channelId: string) => {
    set((state) => ({
      messages: { ...state.messages, [channelId]: [] },
      hasMore: { ...state.hasMore, [channelId]: false },
      cursors: { ...state.cursors, [channelId]: null },
    }));
  },
}));
