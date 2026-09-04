/**
 * useSocket.ts
 *
 * Only exposes stable action emitters (sendMessage, editMessage, etc.)
 * All socket EVENT LISTENERS live in socketManager.ts — outside React.
 * No useEffect, no re-render risk.
 */

import { useCallback } from 'react';
import { getSocket } from '../services/socketManager';
import { messageApi } from '../services/messageApi';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import type { Message } from '../types/message';

export function useSocketActions() {
  const sendMessage = useCallback(
    async (
      channelId: string,
      content: string,
      parentId?: string,
      attachments?: Array<{
        fileName: string;
        fileUrl: string;
        fileType: string;
        fileSize: number;
        mimeType: string;
      }>
    ) => {
      const currentUser = useAuthStore.getState().user;
      const dmChannels = useChatStore.getState().dmChannels;
      const activeChannel = useChatStore.getState().activeChannel;

      const dmInfo = dmChannels.find((d) => d.id === channelId);
      const channelNameLower = typeof activeChannel?.name === 'string' ? activeChannel.name.toLowerCase() : '';
      const isAIChat =
        activeChannel?.type === 'DIRECT' &&
        (channelNameLower.includes('devchat ai') ||
          dmInfo?.otherUser?.username === 'devchat_ai' ||
          (activeChannel?.createdBy as any)?.username === 'devchat_ai');
      const isAIMentioned = Boolean(content && typeof content === 'string' && /@ai\b|@devchat_ai\b|@DevChat AI/i.test(content));

      if (isAIChat || isAIMentioned) {
        useUIStore.getState().setAITypingChannelId(channelId);
      }

      // Optimistic UI Update — render message instantly (0ms latency)
      if (currentUser) {
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const optimisticMsg: Message = {
          id: tempId,
          content,
          channelId,
          parentId: parentId || null,
          user: {
            id: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName,
            avatarUrl: currentUser.avatarUrl,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isEdited: false,
          reactions: [],
          attachments: (attachments as any) || [],
          _count: { replies: 0 },
        };
        useChatStore.getState().addMessage(optimisticMsg);

        if (useChatStore.getState().activeSessionId === 'new') {
          useChatStore.getState().setActiveSessionId(null);
        }
      }

      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('message:send', { channelId, content, parentId, attachments }, (res: any) => {
          if (res?.error) {
            console.error('[Socket] message:send error:', res.error);
          }
        });
      } else {
        try {
          const msg = await messageApi.sendMessage(channelId, content, parentId, attachments as any);
          useChatStore.getState().addMessage(msg);
        } catch (err) {
          console.error('Failed to send message via REST fallback:', err);
        }
      }
    },
    []
  );

  const editMessage = useCallback((messageId: string, content: string) => {
    getSocket()?.emit('message:edit', { messageId, content });
  }, []);

  const deleteMessage = useCallback((messageId: string) => {
    getSocket()?.emit('message:delete', { messageId });
  }, []);

  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    getSocket()?.emit('message:reaction', { messageId, emoji });
  }, []);

  const joinChannelRoom = useCallback((channelId: string) => {
    getSocket()?.emit('channel:join', channelId);
  }, []);

  const startTyping = useCallback((channelId: string) => {
    getSocket()?.emit('typing:start', channelId);
  }, []);

  const stopTyping = useCallback((channelId: string) => {
    getSocket()?.emit('typing:stop', channelId);
  }, []);

  return { sendMessage, editMessage, deleteMessage, toggleReaction, joinChannelRoom, startTyping, stopTyping };
}

// Alias for backwards compat
export const useSocket = useSocketActions;
export const useSocketEvents = () => {}; // no-op — listeners are in socketManager
