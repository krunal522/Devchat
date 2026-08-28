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

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://devchat-war7.onrender.com';

let socket: Socket | null = null;
let listenersAttached = false;

// ─── Public API ─────────────────────────────────────────────────────────────

/** Call once after login / checkAuth succeeds. */
export function initSocket(token: string): Socket {
  if (socket !== null) return socket; // already initialised

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
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
    // Join all channel rooms once connected
    sock.emit('channel:join_all', (res: { success: boolean; channelIds?: string[] }) => {
      if (res?.success) {
        console.log(`[Socket] Joined ${res.channelIds?.length ?? 0} rooms`);
      }
    });
  });

  sock.on('disconnect', (reason) => {
    console.warn('[Socket] Disconnected:', reason);
  });

  sock.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
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

const processedMessageIds = new Set<string>();

  // ── Messages ──────────────────────────────────────────────────────────────
  sock.on('message:new', async (message: Message) => {
    if (processedMessageIds.has(message.id)) {
      return;
    }
    processedMessageIds.add(message.id);
    if (processedMessageIds.size > 200) {
      const first = processedMessageIds.values().next().value;
      if (first) processedMessageIds.delete(first);
    }

    const chatStore = useChatStore.getState();
    chatStore.addMessage(message);

    // If this is a DM channel and not currently loaded in dmChannels state, refresh DM channels list
    const isDMInStore = chatStore.dmChannels.some((d) => d.id === message.channelId);
    if (!isDMInStore) {
      await chatStore.loadDMChannels();
    }

    const currentUserId = useAuthStore.getState().user?.id;
    const currentUsername = useAuthStore.getState().user?.username;

    if (currentUserId && message.user?.id !== currentUserId) {
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



  // ── Typing ────────────────────────────────────────────────────────────────
  sock.on(
    'typing:update',
    (data: { userId: string; username: string; channelId: string; isTyping: boolean }) => {
      usePresenceStore.getState().setTyping(data.channelId, data.userId, data.username, data.isTyping);
    }
  );
}
