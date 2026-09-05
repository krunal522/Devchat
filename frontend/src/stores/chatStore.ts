/**
 * chatStore.ts
 *
 * Central Zustand Store for Channels, Messages, Threads, and Direct Messages.
 * 
 * Key Design Features:
 * 1. Optimistic Message Pipeline: Local messages render instantly with 0ms UI lag
 *    and deduplicate when server acknowledgments arrive.
 * 2. Instant Channel & DM Switching: Switching channels or starting new DMs sets
 *    active state in 0ms with skeleton loaders while fetching full message history.
 * 3. Real-Time Syncing: Works hand-in-hand with socketManager.ts to process
 *    incoming messages, thread replies, and presence updates reactively.
 */

import { create } from 'zustand';
import type { Channel, DMChannel } from '../types/channel';
import type { Message } from '../types/message';
import { channelApi } from '../services/channelApi';
import { messageApi } from '../services/messageApi';
import { getSocket } from '../services/socketManager';
import { useAuthStore } from './authStore';
import { useUIStore } from './uiStore';

interface ChatState {
  // Channels
  channels: Channel[];
  dmChannels: DMChannel[];
  activeChannelId: string | null;
  activeChannel: Channel | null;

  // Messages
  messages: Record<string, Message[]>; // channelId → messages
  isChannelLoaded: Record<string, boolean>; // channelId → has full history been loaded from server
  hasMore: Record<string, boolean>;
  cursors: Record<string, string | null>;
  isLoadingMessages: boolean;
  isLoadingMore: Record<string, boolean>;

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
  mergeServerMessages: (channelId: string, messages: Message[]) => void;
  updateMessage: (message: Message) => void;
  updateMessageId: (channelId: string, oldId: string, newId: string) => void;
  updateUserInMessages: (userId: string, updatedFields: Partial<{ displayName: string; avatarUrl: string | null }>) => void;
  removeMessage: (messageId: string, channelId: string) => void;
  addChannel: (channel: Channel) => void;
  createChannel: (data: { name: string; description?: string; type?: 'PUBLIC' | 'PRIVATE' }) => Promise<Channel>;
  joinChannel: (channelId: string) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;
  openDM: (targetUserId: string, targetUser?: any) => Promise<void>;
  updateUserLastSeen: (userId: string, lastSeenAt: string) => void;
  updateUserOnline: (userId: string, isOnline: boolean, lastSeenAt?: string) => void;
  clearChannelMessages: (channelId: string) => void;
  bumpDMChannel: (channelId: string) => void;
  syncServerUnreads: () => Promise<void>;
  updateMessageReactions: (messageId: string, reactions: any[]) => void;
}

function getStoredUnreads(): Record<string, number> {
  try {
    const raw = localStorage.getItem('devchat_unread_counts');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const cleaned: Record<string, number> = {};
    let hasUserKey = false;
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('user:')) {
        hasUserKey = true;
      } else if (typeof v === 'number') {
        cleaned[k] = v;
      }
    }
    if (hasUserKey) {
      localStorage.setItem('devchat_unread_counts', JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return {};
  }
}

function persistUnreads(unreads: Record<string, number>) {
  try {
    localStorage.setItem('devchat_unread_counts', JSON.stringify(unreads));
  } catch {}
}

export const useChatStore = create<ChatState>((set, get) => ({
  channels: [],
  dmChannels: [],
  activeChannelId: null,
  activeChannel: null,

  messages: {},
  isChannelLoaded: {},
  hasMore: {},
  cursors: {},
  isLoadingMessages: false,
  isLoadingMore: {},

  unreadCounts: getStoredUnreads(),

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
    // Deduplicate replies by ID to guarantee unique list
    const seen = new Set<string>();
    const unique = (replies || []).filter((r) => {
      if (!r?.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    set((state) => {
      const activeParent = state.activeThreadMessage;
      const parentId = activeParent?.id;
      const realCount = unique.length;

      const updatedActiveThread = activeParent
        ? {
            ...activeParent,
            _count: {
              ...activeParent._count,
              replies: realCount,
            },
          }
        : null;

      // Also sync the message in the channel messages list
      const channelId = activeParent?.channelId;
      let updatedMessages = state.messages;
      if (channelId && state.messages[channelId] && parentId) {
        updatedMessages = {
          ...state.messages,
          [channelId]: state.messages[channelId].map((m) =>
            m.id === parentId
              ? {
                  ...m,
                  _count: {
                    ...m._count,
                    replies: realCount,
                  },
                }
              : m
          ),
        };
      }

      return {
        activeThreadReplies: unique,
        activeThreadMessage: updatedActiveThread,
        messages: updatedMessages,
      };
    });
  },

  setReplyingToMessage: (message: Message | null) => {
    set({ replyingToMessage: message });
  },

  clearUnread: (channelId: string) => {
    set((state) => {
      const dm = state.dmChannels.find((d) => d.id === channelId);
      const otherUserId = dm?.otherUser?.id;
      const nextUnreads = {
        ...state.unreadCounts,
        [channelId]: 0,
      };
      if (otherUserId) {
        state.dmChannels
          .filter((d) => d.otherUser?.id === otherUserId)
          .forEach((d) => {
            nextUnreads[d.id] = 0;
          });
      }
      persistUnreads(nextUnreads);
      return {
        unreadCounts: nextUnreads,
      };
    });

    // Mark as read in server database
    channelApi.markAsRead(channelId);
  },

  syncServerUnreads: async () => {
    try {
      const serverMap = await channelApi.getUnreadCounts();
      if (!serverMap || typeof serverMap !== 'object') return;
      const activeId = get().activeChannelId;

      set((state) => {
        const next = { ...state.unreadCounts };
        for (const [chId, count] of Object.entries(serverMap)) {
          if (chId === activeId) {
            next[chId] = 0;
          } else {
            next[chId] = Number(count) || 0;
          }
        }
        persistUnreads(next);
        return { unreadCounts: next };
      });
    } catch (err) {
      console.error('Failed to sync server unreads:', err);
    }
  },

  bumpDMChannel: (channelId: string) => {
    set((state) => {
      const idx = state.dmChannels.findIndex((d) => d.id === channelId);
      if (idx <= 0) return state; // already at top or not found
      const updated = [...state.dmChannels];
      const [dm] = updated.splice(idx, 1);
      updated.unshift(dm);
      return { dmChannels: updated };
    });
  },

  loadChannels: async () => {
    try {
      const channels = await channelApi.getChannels();
      set({ channels });
      get().syncServerUnreads().catch(() => {});
    } catch (error) {
      console.error('Failed to load channels:', error);
    }
  },

  loadDMChannels: async () => {
    try {
      const dmChannels = await channelApi.getDMChannels();
      set({ dmChannels });
      get().syncServerUnreads().catch(() => {});

      // If current active channel is a DM, update activeChannel object to ensure latest user details
      const activeId = get().activeChannelId;
      const currentActiveChannel = get().activeChannel;
      const currentUserId = useAuthStore.getState().user?.id;
      if (activeId && currentActiveChannel?.type === 'DIRECT') {
        const dm = dmChannels.find((d) => d.id === activeId);
        if (dm && dm.otherUser && dm.otherUser.id !== currentUserId) {
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
              otherUser: dm.otherUser,
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
    const { channels, dmChannels, loadMessages, joinChannel } = get();
    let channel = channels.find((c) => c.id === channelId) || null;

    if (!channel) {
      const currentUserId = useAuthStore.getState().user?.id;
      const dm = dmChannels.find((d) => d.id === channelId);
      if (dm && dm.otherUser && dm.otherUser.id !== currentUserId) {
        channel = {
          id: dm.id,
          name: dm.otherUser.displayName || dm.otherUser.username,
          slug: dm.id,
          description: `@${dm.otherUser.username}`,
          type: 'DIRECT',
          createdById: '',
          createdAt: dm.updatedAt,
          updatedAt: dm.updatedAt,
          otherUser: dm.otherUser,
          createdBy: {
            id: dm.otherUser.id,
            username: dm.otherUser.username,
            displayName: dm.otherUser.displayName,
            avatarUrl: dm.otherUser.avatarUrl,
          },
          _count: { members: 2, messages: 0 },
          isMember: true,
        } as any;
      } else {
        try {
          const rawChannel: any = await channelApi.getChannel(channelId);
          if (rawChannel && rawChannel.type === 'DIRECT') {
            const rawMembers = await channelApi.getMembers(channelId);
            const members = Array.isArray(rawMembers) ? rawMembers : [];
            const otherMember = members.find((m: any) => (m.id || m.userId) !== currentUserId);
            channel = {
              ...rawChannel,
              name: otherMember?.displayName || otherMember?.username || rawChannel.name,
              description: `@${otherMember?.username || ''}`,
              otherUser: otherMember || undefined,
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

    try {
      localStorage.setItem('devchat_last_active_channel', channelId);
    } catch {}

    const dm = channel?.type === 'DIRECT' ? channel : dmChannels.find((d) => d.id === channelId);
    const otherUserId = (dm as any)?.otherUser?.id;

    const nextUnreads = {
      ...get().unreadCounts,
      [channelId]: 0,
    };
    if (otherUserId) {
      dmChannels
        .filter((d) => d.otherUser?.id === otherUserId)
        .forEach((d) => {
          nextUnreads[d.id] = 0;
        });
    }
    persistUnreads(nextUnreads);
    channelApi.markAsRead(channelId);

    set((state) => ({
      activeChannelId: channelId,
      activeChannel: channel,
      activeSessionId: null,
      isLoadingMessages: !state.isChannelLoaded[channelId],
      unreadCounts: nextUnreads,
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

    // Always load full message history from server when activating channel
    await loadMessages(channelId);
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

  openDM: async (targetUserId: string, targetUser?: any) => {
    try {
      // ⚡ FAST PATH 1: Check existing DM channel in store
      const existingDM = get().dmChannels.find(
        (d) => d.id === targetUserId || d.otherUser?.id === targetUserId
      );
      const resolvedUser = targetUser || existingDM?.otherUser;

      // ⚡ FAST PATH 2: If we have resolvedUser or existingDM, switch UI INSTANTLY (0ms)
      if (existingDM || resolvedUser) {
        const channelId = existingDM?.id || `dm-${targetUserId}`;
        set((state) => ({
          activeChannelId: channelId,
          activeChannel: {
            id: channelId,
            name: resolvedUser?.displayName || resolvedUser?.username || 'Direct Message',
            slug: channelId,
            description: resolvedUser ? `@${resolvedUser.username}` : '',
            type: 'DIRECT',
            createdById: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            otherUser: resolvedUser || undefined,
            createdBy: resolvedUser ? {
              id: resolvedUser.id,
              username: resolvedUser.username,
              displayName: resolvedUser.displayName,
              avatarUrl: resolvedUser.avatarUrl ?? null,
            } : { id: '', username: '', displayName: '', avatarUrl: null },
            _count: { members: 2, messages: 0 },
            isMember: true,
          } as any,
          isLoadingMessages: !state.isChannelLoaded[channelId],
          unreadCounts: (() => {
            const next = {
              ...state.unreadCounts,
              [channelId]: 0,
            };
            if (targetUserId) {
              state.dmChannels
                .filter((d) => d.otherUser?.id === targetUserId)
                .forEach((d) => {
                  next[d.id] = 0;
                });
            }
            persistUnreads(next);
            return next;
          })(),
        }));
      }

      const dmChannel = await channelApi.getOrCreateDM(targetUserId);
      try {
        localStorage.setItem('devchat_last_active_channel', dmChannel.id);
      } catch {}

      let otherUser = resolvedUser || get().dmChannels.find((d) => d.id === dmChannel.id)?.otherUser;

      if (!otherUser) {
        const currentUserId = useAuthStore.getState().user?.id;
        try {
          const rawMembers = await channelApi.getMembers(dmChannel.id);
          const members = Array.isArray(rawMembers) ? rawMembers : [];
          const found = members.find((m: any) => m.id !== currentUserId) || members[0];
          if (found) {
            otherUser = {
              id: found.id,
              username: found.username,
              displayName: found.displayName,
              avatarUrl: found.avatarUrl ?? null,
              isOnline: false,
              lastSeenAt: found.lastSeenAt || new Date().toISOString(),
            };
          }
        } catch {}
      }

      const finalUnreads = {
        ...get().unreadCounts,
        [dmChannel.id]: 0,
      };
      if (otherUser?.id) {
        get().dmChannels
          .filter((d) => d.otherUser?.id === otherUser.id)
          .forEach((d) => {
            finalUnreads[d.id] = 0;
          });
      }
      persistUnreads(finalUnreads);
      channelApi.markAsRead(dmChannel.id);

      // INSTANTLY finalize active channel with actual backend channel ID
      set((state) => ({
        activeChannelId: dmChannel.id,
        activeChannel: {
          id: dmChannel.id,
          name: otherUser?.displayName || otherUser?.username || 'Direct Message',
          slug: dmChannel.id,
          description: otherUser ? `@${otherUser.username}` : '',
          type: 'DIRECT',
          createdById: '',
          createdAt: dmChannel.createdAt || new Date().toISOString(),
          updatedAt: dmChannel.updatedAt || new Date().toISOString(),
          otherUser: otherUser || undefined,
          createdBy: otherUser ? {
            id: otherUser.id,
            username: otherUser.username,
            displayName: otherUser.displayName,
            avatarUrl: otherUser.avatarUrl ?? null,
          } : { id: '', username: '', displayName: '', avatarUrl: null },
          _count: { members: 2, messages: 0 },
          isMember: true,
        } as any,
        isLoadingMessages: !state.isChannelLoaded[dmChannel.id],
        unreadCounts: finalUnreads,
      }));

      // Load messages and join socket room
      getSocket()?.emit('channel:join', dmChannel.id);
      await get().loadMessages(dmChannel.id);

      // Refresh sidebar DM list in background (non-blocking)
      get().loadDMChannels().catch(() => {});
    } catch (error) {
      console.error('Failed to open DM:', error);
    }
  },

  loadMessages: async (channelId: string) => {
    set({ isLoadingMessages: true });
    try {
      const data = await messageApi.getMessages(channelId);
      set((state) => {
        const currentMsgs = state.messages[channelId] || [];
        const pendingTemp = currentMsgs.filter((m) => m.id.startsWith('temp-'));
        const serverMsgs = Array.isArray(data?.messages) ? data.messages : [];

        // Deduplicate messages preserving optimistic ones
        const msgMap = new Map<string, Message>();
        serverMsgs.forEach((m) => msgMap.set(m.id, m));
        pendingTemp.forEach((temp) => {
          const normTemp = (temp.content || '').trim();
          const hasServerMatch = serverMsgs.some(
            (sm) => sm.user?.id === temp.user?.id && (sm.content || '').trim() === normTemp
          );
          if (!hasServerMatch) {
            msgMap.set(temp.id, temp);
          }
        });

        const merged = Array.from(msgMap.values()).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        return {
          messages: { ...state.messages, [channelId]: merged },
          isChannelLoaded: { ...state.isChannelLoaded, [channelId]: true },
          hasMore: { ...state.hasMore, [channelId]: Boolean(data?.hasMore) },
          cursors: { ...state.cursors, [channelId]: data?.nextCursor || null },
          isLoadingMessages: state.activeChannelId === channelId ? false : state.isLoadingMessages,
        };
      });
    } catch (error) {
      console.error('Failed to load messages:', error);
      if (get().activeChannelId === channelId) {
        set({ isLoadingMessages: false });
      }
    }
  },

  loadMoreMessages: async (channelId: string) => {
    const { cursors, hasMore, isLoadingMore } = get();
    if (!hasMore[channelId] || !cursors[channelId] || isLoadingMore[channelId]) return;

    set((state) => ({
      isLoadingMore: { ...state.isLoadingMore, [channelId]: true },
    }));

    try {
      const data = await messageApi.getMessages(channelId, cursors[channelId]!);
      const serverMsgs = Array.isArray(data?.messages) ? data.messages : [];
      set((state) => {
        const currentMsgs = state.messages[channelId] || [];
        const existingIds = new Set(currentMsgs.map((m) => m.id));
        const newUniqueMsgs = serverMsgs.filter((m) => !existingIds.has(m.id));

        return {
          messages: {
            ...state.messages,
            [channelId]: [...newUniqueMsgs, ...currentMsgs],
          },
          hasMore: { ...state.hasMore, [channelId]: Boolean(data?.hasMore) },
          cursors: { ...state.cursors, [channelId]: data?.nextCursor || null },
          isLoadingMore: { ...state.isLoadingMore, [channelId]: false },
        };
      });
    } catch (error) {
      console.error('Failed to load more messages:', error);
      set((state) => ({
        isLoadingMore: { ...state.isLoadingMore, [channelId]: false },
      }));
    }
  },

  addMessage: (message: Message) => {
    set((state) => {
      const currentUserId = useAuthStore.getState().user?.id;
      const currentActiveId = state.activeChannelId;
      const activeChannel = state.activeChannel;

      const targetChannelId = message.channelId;

      const isCurrentlyActive = currentActiveId === targetChannelId;
      let existing = state.messages[targetChannelId] || [];
      if (existing.some((m) => m.id === message.id)) {
        return state;
      }

      // If adding real server message, deduplicate/replace matching optimistic message
      const incomingTempId = (message as any).tempId;
      if (!message.id.startsWith('temp-')) {
        const normContent = (message.content || '').trim();
        existing = existing.filter(
          (m) => !(m.id.startsWith('temp-') && m.user?.id === message.user?.id && ((incomingTempId && m.id === incomingTempId) || (normContent && (m.content || '').trim() === normContent)))
        );
      }

      if (message.user?.username === 'devchat_ai' || message.user?.displayName?.includes('DevChat AI')) {
        useUIStore.getState().setAITypingChannelId(null);
      }

      const isOwnMessage = Boolean(currentUserId && message.user?.id === currentUserId);

      const newUnreads = { ...state.unreadCounts };
      if (!isCurrentlyActive && !isOwnMessage) {
        newUnreads[targetChannelId] = (newUnreads[targetChannelId] || 0) + 1;
        persistUnreads(newUnreads);
      }

      const nextSessionId = state.activeSessionId === 'new' ? null : state.activeSessionId;

      // Update DM channels list (WhatsApp style: bump / add DM channel to top instantly)
      let newDmChannels = state.dmChannels;
      const isDMMessage =
        activeChannel?.type === 'DIRECT' ||
        state.dmChannels.some((d) => d.id === targetChannelId) ||
        (!state.channels.some((c) => c.id === targetChannelId) && targetChannelId !== 'devchat-ai-channel');

      if (isDMMessage) {
        const existingDMIdx = state.dmChannels.findIndex(
          (d) => d.id === targetChannelId || (d.otherUser?.id && message.user?.id && d.otherUser.id === message.user.id)
        );

        const lastMsgObj = {
          content: message.content || '',
          createdAt: message.createdAt || new Date().toISOString(),
          user: { username: message.user?.username || '' },
        };

        if (existingDMIdx >= 0) {
          const updatedDMs = [...state.dmChannels];
          const [targetDM] = updatedDMs.splice(existingDMIdx, 1);
          const updatedTargetDM = {
            ...targetDM,
            id: targetChannelId,
            lastMessage: lastMsgObj,
            updatedAt: message.createdAt || new Date().toISOString(),
          };
          updatedDMs.unshift(updatedTargetDM);
          newDmChannels = updatedDMs;
        } else if (!isOwnMessage && message.user?.id && message.user.id !== currentUserId) {
          const newDMItem: DMChannel = {
            id: targetChannelId,
            otherUser: {
              id: message.user.id,
              username: message.user.username,
              displayName: message.user.displayName,
              avatarUrl: message.user.avatarUrl ?? null,
              isOnline: true,
              lastSeenAt: new Date().toISOString(),
            },
            lastMessage: lastMsgObj,
            updatedAt: message.createdAt || new Date().toISOString(),
          };
          newDmChannels = [newDMItem, ...state.dmChannels];
        }
      }

      const updatedMsg = { ...message, channelId: targetChannelId };

      if (updatedMsg.parentId) {
        const activeThread = state.activeThreadMessage;
        const currentReplies = state.activeThreadReplies || [];
        const isCurrentThread = Boolean(activeThread && activeThread.id === updatedMsg.parentId);

        const isServerMsg = !updatedMsg.id.startsWith('temp-');
        const normContent = (updatedMsg.content || '').trim();

        // Check if there was already an optimistic reply from the same user with the same content
        const hadMatchingTempReply =
          isServerMsg &&
          currentReplies.some(
            (r) =>
              r.id.startsWith('temp-') &&
              r.user?.id === updatedMsg.user?.id &&
              (r.content || '').trim() === normContent
          );

        // Deduplicate thread replies list
        let filteredReplies = currentReplies.filter((r) => r.id !== updatedMsg.id);
        if (isServerMsg) {
          filteredReplies = filteredReplies.filter(
            (r) =>
              !(
                r.id.startsWith('temp-') &&
                r.user?.id === updatedMsg.user?.id &&
                (r.content || '').trim() === normContent
              )
          );
        }

        const updatedReplies = isCurrentThread
          ? [...filteredReplies, updatedMsg]
          : currentReplies;

        // If this server message replaces an optimistic reply that already incremented the count, do NOT increment again!
        const shouldIncrementCount = !hadMatchingTempReply;

        const updatedExisting = existing.map((m) => {
          if (m.id === updatedMsg.parentId) {
            const nextRepliesCount = isCurrentThread
              ? updatedReplies.length
              : shouldIncrementCount
                ? (m._count?.replies || 0) + 1
                : (m._count?.replies || 0);

            return {
              ...m,
              _count: {
                ...m._count,
                replies: nextRepliesCount,
              },
            };
          }
          return m;
        });

        const updatedActiveThread =
          activeThread && activeThread.id === updatedMsg.parentId
            ? {
                ...activeThread,
                _count: {
                  ...activeThread._count,
                  replies: isCurrentThread
                    ? updatedReplies.length
                    : shouldIncrementCount
                      ? (activeThread._count?.replies || 0) + 1
                      : (activeThread._count?.replies || 0),
                },
              }
            : activeThread;

        return {
          unreadCounts: newUnreads,
          dmChannels: newDmChannels,
          activeThreadMessage: updatedActiveThread,
          activeThreadReplies: updatedReplies,
          messages: {
            ...state.messages,
            [targetChannelId]: updatedExisting,
          },
        };
      }

      return {
        unreadCounts: newUnreads,
        dmChannels: newDmChannels,
        activeSessionId: nextSessionId,
        messages: {
          ...state.messages,
          [targetChannelId]: [...existing, updatedMsg],
        },
      };
    });
  },

  mergeServerMessages: (channelId: string, serverMsgs: Message[]) => {
    set((state) => {
      const existing = state.messages[channelId] || [];

      // Filter out any temp message whose content matches a server message from the same user
      const pendingTemp = existing.filter((m) => {
        if (!m.id.startsWith('temp-')) return false;
        const tempContent = (m.content || '').trim();
        const hasServerMatch = serverMsgs.some(
          (sm) => sm.user?.id === m.user?.id && (sm.content || '').trim() === tempContent
        );
        return !hasServerMatch;
      });

      const existingIds = new Set(existing.map((m) => m.id));
      const hasNew = serverMsgs.some((m) => !existingIds.has(m.id));
      const existingTempCount = existing.filter((m) => m.id.startsWith('temp-')).length;

      if (!hasNew && pendingTemp.length === existingTempCount) {
        return state;
      }

      const merged = [...serverMsgs, ...pendingTemp];

      return {
        messages: {
          ...state.messages,
          [channelId]: merged,
        },
      };
    });
  },

  updateMessage: (message: Message) => {
    set((state) => {
      const newMessages = { ...state.messages };
      let updatedAny = false;

      for (const [chId, msgs] of Object.entries(newMessages)) {
        if (msgs.some((m) => m.id === message.id)) {
          newMessages[chId] = msgs.map((m) => (m.id === message.id ? { ...m, ...message } : m));
          updatedAny = true;
        }
      }

      if (!updatedAny && message.channelId) {
        newMessages[message.channelId] = (newMessages[message.channelId] || []).map((m) =>
          m.id === message.id ? { ...m, ...message } : m
        );
      }

      const updatedThreadMessage =
        state.activeThreadMessage?.id === message.id ? { ...state.activeThreadMessage, ...message } : state.activeThreadMessage;

      const updatedThreadReplies = (state.activeThreadReplies || []).map((m) =>
        m.id === message.id ? { ...m, ...message } : m
      );

      return {
        messages: newMessages,
        activeThreadMessage: updatedThreadMessage,
        activeThreadReplies: updatedThreadReplies,
      };
    });
  },

  updateMessageReactions: (messageId: string, reactions: any[]) => {
    set((state) => {
      const newMessages = { ...state.messages };
      for (const [chId, msgs] of Object.entries(newMessages)) {
        if (msgs.some((m) => m.id === messageId)) {
          newMessages[chId] = msgs.map((m) =>
            m.id === messageId ? { ...m, reactions } : m
          );
        }
      }

      const updatedThreadMessage =
        state.activeThreadMessage?.id === messageId
          ? { ...state.activeThreadMessage, reactions }
          : state.activeThreadMessage;

      const updatedThreadReplies = (state.activeThreadReplies || []).map((m) =>
        m.id === messageId ? { ...m, reactions } : m
      );

      return {
        messages: newMessages,
        activeThreadMessage: updatedThreadMessage,
        activeThreadReplies: updatedThreadReplies,
      };
    });
  },

  updateMessageId: (channelId: string, oldId: string, newId: string) => {
    set((state) => {
      const channelMsgs = state.messages[channelId] || [];
      const updated = channelMsgs.map((m) => (m.id === oldId ? { ...m, id: newId } : m));
      const updatedThreadReplies = (state.activeThreadReplies || []).map((m) =>
        m.id === oldId ? { ...m, id: newId } : m
      );
      return {
        messages: {
          ...state.messages,
          [channelId]: updated,
        },
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

  updateUserInMessages: (userId: string, updatedFields: Partial<{ displayName: string; avatarUrl: string | null }>) => {
    set((state) => {
      const newMessages: Record<string, Message[]> = {};
      for (const [channelId, msgs] of Object.entries(state.messages)) {
        newMessages[channelId] = msgs.map((m) => {
          if (m.user?.id === userId) {
            return {
              ...m,
              user: {
                ...m.user,
                ...updatedFields,
              },
            };
          }
          return m;
        });
      }

      const newDmChannels = state.dmChannels.map((d) => {
        if (d.otherUser?.id === userId) {
          return {
            ...d,
            otherUser: {
              ...d.otherUser,
              ...updatedFields,
            },
          };
        }
        return d;
      });

      let newActiveChannel = state.activeChannel;
      if (state.activeChannel?.type === 'DIRECT' && (state.activeChannel as any)?.otherUser?.id === userId) {
        newActiveChannel = {
          ...state.activeChannel,
          otherUser: {
            ...(state.activeChannel as any).otherUser,
            ...updatedFields,
          },
          ...(updatedFields.displayName ? { name: updatedFields.displayName } : {}),
        } as any;
      }

      return {
        messages: newMessages,
        dmChannels: newDmChannels,
        activeChannel: newActiveChannel,
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
    set((state) => {
      const isOtherInActive = state.activeChannel?.otherUser?.id === userId;
      const isCreatedByInActive = state.activeChannel?.createdBy?.id === userId;

      let updatedActiveChannel = state.activeChannel;
      if (isOtherInActive || isCreatedByInActive) {
        updatedActiveChannel = {
          ...state.activeChannel,
          ...(isOtherInActive && state.activeChannel?.otherUser
            ? { otherUser: { ...state.activeChannel.otherUser, isOnline: false, lastSeenAt } }
            : {}),
          ...(isCreatedByInActive && state.activeChannel?.createdBy
            ? { createdBy: { ...state.activeChannel.createdBy, isOnline: false, lastSeenAt } as any }
            : {}),
        } as any;
      }

      return {
        dmChannels: state.dmChannels.map((d) =>
          d.otherUser?.id === userId
            ? { ...d, otherUser: { ...d.otherUser, isOnline: false, lastSeenAt } }
            : d
        ),
        activeChannel: updatedActiveChannel,
      };
    });
  },

  updateUserOnline: (userId: string, isOnline: boolean, lastSeenAt?: string) => {
    set((state) => {
      const isOtherInActive = state.activeChannel?.otherUser?.id === userId;
      const isCreatedByInActive = state.activeChannel?.createdBy?.id === userId;

      let updatedActiveChannel = state.activeChannel;
      if (isOtherInActive || isCreatedByInActive) {
        updatedActiveChannel = {
          ...state.activeChannel,
          ...(isOtherInActive && state.activeChannel?.otherUser
            ? {
                otherUser: {
                  ...state.activeChannel.otherUser,
                  isOnline,
                  ...(lastSeenAt ? { lastSeenAt } : {}),
                },
              }
            : {}),
          ...(isCreatedByInActive && state.activeChannel?.createdBy
            ? {
                createdBy: {
                  ...state.activeChannel.createdBy,
                  isOnline,
                  ...(lastSeenAt ? { lastSeenAt } : {}),
                } as any,
              }
            : {}),
        } as any;
      }

      return {
        dmChannels: state.dmChannels.map((d) =>
          d.otherUser?.id === userId
            ? {
                ...d,
                otherUser: {
                  ...d.otherUser,
                  isOnline,
                  ...(lastSeenAt ? { lastSeenAt } : {}),
                },
              }
            : d
        ),
        activeChannel: updatedActiveChannel,
      };
    });
  },

  clearChannelMessages: async (channelId: string) => {
    set((state) => ({
      messages: { ...state.messages, [channelId]: [] },
      hasMore: { ...state.hasMore, [channelId]: false },
      cursors: { ...state.cursors, [channelId]: null },
    }));

    try {
      await messageApi.clearChannelMessages(channelId);
    } catch (err) {
      console.error('Failed to delete channel messages on server:', err);
    }
  },
}));
