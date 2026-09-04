/**
 * socketManager.ts
 *
 * A standalone singleton that:
 *  1. Owns the single Socket.io connection
 *  2. Registers ALL socket event handlers once, completely OUTSIDE React
 *  3. Writes received data directly into Zustand stores via .getState()
 *
 * React components never touch socket lifecycle — they only read from stores.
 * This eliminates every possible infinite-loop caused by hooks/effects.
 */

import { io, type Socket } from 'socket.io-client';
import { useChatStore } from '../stores/chatStore';
import { usePresenceStore } from '../stores/presenceStore';
import { useToastStore } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { notificationService } from './notificationService';
import type { Message } from '../types/message';

import { userApi } from './userApi';

// Always connect to local backend in development
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;
let listenersAttached = false;

// ─── Public API ─────────────────────────────────────────────────────────────

/** Call once after login / checkAuth succeeds. */
export function initSocket(token: string): Socket {
  if (socket !== null) {
    if (socket.connected) return socket;
    socket.disconnect();
    socket = null;
    listenersAttached = false;
  }

  console.log('[Socket] Connecting to:', SOCKET_URL);

  socket = io(SOCKET_URL, {
    auth: (cb) => {
      const activeToken = localStorage.getItem('accessToken') || token;
      cb({ token: activeToken });
    },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 200,
    reconnectionDelay: 100,
    reconnectionDelayMax: 500,
    timeout: 10000,
  });

  attachListeners(socket);
  return socket;
}

/** Call on logout. */
export function destroySocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    listenersAttached = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (socket) {
      socket.disconnect();
    }
  });
}

/** Returns the current socket (null if not connected). */
export function getSocket(): Socket | null {
  return socket;
}

// ─── Internal ────────────────────────────────────────────────────────────────

function attachListeners(sock: Socket): void {
  if (listenersAttached) return;
  listenersAttached = true;

  // ── Connection ────────────────────────────────────────────────────────────
  sock.on('connect', () => {
    console.log('[Socket] Connected:', sock.id);
    const currentUser = useAuthStore.getState().user;
    if (currentUser?.id) {
      usePresenceStore.getState().addOnlineUser(currentUser.id);
    }

    // Re-join ALL channel and DM rooms (important for Render cold-start reconnects)
    const rejoinAllRooms = () => {
      // Join all channel rooms
      sock.emit('channel:join_all', (res: { success: boolean; channelIds?: string[] }) => {
        if (res?.success) {
          console.log(`[Socket] Joined ${res.channelIds?.length ?? 0} channel rooms`);
        }
      });
      // Re-join active channel room explicitly
      const activeChannelId = useChatStore.getState().activeChannelId;
      if (activeChannelId) {
        sock.emit('channel:join', activeChannelId);
      }
    };

    rejoinAllRooms();

    // Fetch online users via REST immediately after connection
    userApi
      .getOnlineUsers()
      .then((userIds) => {
        if (userIds && Array.isArray(userIds) && userIds.length > 0) {
          usePresenceStore.getState().setOnlineUsers(userIds);
        }
      })
      .catch(() => {});
  });

  // Re-join all rooms on reconnect (Render spins down — rooms are lost on cold start)
  sock.on('reconnect', (attemptNumber: number) => {
    console.log('[Socket] Reconnected after', attemptNumber, 'attempts — re-joining rooms');
    sock.emit('channel:join_all');
    const activeChannelId = useChatStore.getState().activeChannelId;
    if (activeChannelId) sock.emit('channel:join', activeChannelId);
    // Reload DM list to catch any missed messages during disconnect
    useChatStore.getState().loadDMChannels();
  });

  sock.on('disconnect', (reason) => {
    console.warn('[Socket] Disconnected:', reason);
  });

  sock.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  // ── AI Typing Indicator ──────────────────────────────────────────────────
  sock.on('ai:typing:start', (data: { channelId: string }) => {
    if (data?.channelId) {
      useUIStore.getState().setAITypingChannelId(data.channelId);
    }
  });

  sock.on('ai:typing:stop', (data: { channelId: string }) => {
    if (data?.channelId) {
      const current = useUIStore.getState().aiTypingChannelId;
      if (current === data.channelId) {
        useUIStore.getState().setAITypingChannelId(null);
      }
    }
  });

  // ── Presence ──────────────────────────────────────────────────────────────
  sock.on('presence:online_users', (userIds: string[]) => {
    usePresenceStore.getState().setOnlineUsers(userIds);
  });

  sock.on('user:online', (data: { userId: string; username: string }) => {
    usePresenceStore.getState().addOnlineUser(data.userId);
    useToastStore.getState().addToast({
      type: 'info',
      title: 'User Online',
      message: `@${data.username} is now online`,
    });
  });

  sock.on('user:offline', (data: { userId: string; lastSeen?: string }) => {
    usePresenceStore.getState().removeOnlineUser(data.userId);
    const lastSeenTime = data.lastSeen || new Date().toISOString();
    useChatStore.getState().updateUserLastSeen(data.userId, lastSeenTime);
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  sock.on('message:new', (message: Message) => {
    const chatStore = useChatStore.getState();
    const currentUserId = useAuthStore.getState().user?.id;

    // ⚡ Add message to store INSTANTLY — zero blocking operations before this
    chatStore.addMessage(message);

    // Clear AI typing indicator if needed
    if (message.user?.id === 'devchat-ai-bot-id' || message.user?.username === 'devchat_ai') {
      useUIStore.getState().setAITypingChannelId(null);
    }

    // Join channel room if not already in it (non-blocking socket emit — no API call)
    // Only refresh DM list from server if this channel is completely unknown to us
    const isDMInStore = chatStore.dmChannels.some((d) => d.id === message.channelId);
    if (!isDMInStore) {
      sock.emit('channel:join', message.channelId);
      // Defer DM list sync to next tick so it NEVER blocks instant message rendering
      setTimeout(() => {
        useChatStore.getState().loadDMChannels().catch(() => {});
      }, 0);
    }

    // Notifications for messages from other users only
    if (currentUserId && message.user?.id !== currentUserId) {
      const currentUsername = useAuthStore.getState().user?.username;
      const isMentioned = currentUsername && message.content.includes(`@${currentUsername}`);
      const isCurrentChannel = chatStore.activeChannelId === message.channelId;

      if (isMentioned || !isCurrentChannel) {
        notificationService.playNotificationChime();
        notificationService.sendDesktopNotification(
          `Message from ${message.user?.displayName || message.user?.username || 'Team Member'}`,
          message.content || 'Sent an attachment'
        );
      }
    }
  });

  sock.on('message:saved', (data: { tempId: string; realId: string; channelId: string }) => {
    if (data?.tempId && data?.realId && data?.channelId) {
      useChatStore.getState().updateMessageId(data.channelId, data.tempId, data.realId);
    }
  });

  sock.on('message:edited', (message: Message) => {
    useChatStore.getState().updateMessage(message);
  });

  sock.on('message:deleted', (data: { messageId: string; channelId: string }) => {
    useChatStore.getState().removeMessage(data.messageId, data.channelId);
  });

  // ── AI Typing Indicator ─────────────────────────────────────────────────────
  sock.on('ai:typing:start', (data: { channelId: string }) => {
    useUIStore.getState().setAITypingChannelId(data.channelId);
  });

  sock.on('ai:typing:stop', (data: { channelId: string }) => {
    useUIStore.getState().setAITypingChannelId(null);
  });

  // ── Channels ──────────────────────────────────────────────────────────────
  sock.on('channel:new', () => {
    // Refresh channel list
    useChatStore.getState().loadChannels();
    // Show success toast
    useToastStore.getState().addToast({ title: 'Channel Created', message: 'A new channel was added.', type: 'success' });
    useChatStore.getState().loadChannels();
  });

  sock.on('channel:added', () => {
    // Refresh channel list after members added
    useChatStore.getState().loadChannels();
    // Notify user
    useToastStore.getState().addToast({ title: 'Member Added', message: 'You have been added to a channel.', type: 'info' });
    useChatStore.getState().loadChannels();
  });

  sock.on('channel:removed', () => {
    // Refresh channel list after removal
    useChatStore.getState().loadChannels();
    // Notify user
    useToastStore.getState().addToast({ title: 'Channel Removed', message: 'You have been removed from a channel.', type: 'warning' });
    useChatStore.getState().loadChannels();
  });

  // ─── DM Room Auto-Join ──────────────────────────────────────────────────────
  // Server emits this when a new DM channel is created, so this user's socket joins the room
  sock.on('dm:join_room', (data: { channelId: string }) => {
    if (data?.channelId) {
      sock.emit('channel:join', data.channelId);
      useChatStore.getState().loadDMChannels();
    }
  });



  // ── Typing ────────────────────────────────────────────────────────────────
  sock.on(
    'typing:update',
    (data: { userId: string; username: string; channelId: string; isTyping: boolean }) => {
      usePresenceStore.getState().setTyping(data.channelId, data.userId, data.username, data.isTyping);
    }
  );
}
