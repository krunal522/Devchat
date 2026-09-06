/**
 * useSocket.ts
 *
 * Only exposes stable action emitters (sendMessage, editMessage, etc.)
 * All socket EVENT LISTENERS live in socketManager.ts — outside React.
 * No useEffect, no re-render risk.
 */

import { useCallback } from 'react';
import { getSocket, queueOutboxMessage } from '../services/socketManager';
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
      }>,
      isForwarded?: boolean
    ) => {
      const currentUser = useAuthStore.getState().user;
      const dmChannels = useChatStore.getState().dmChannels;
      const activeChannel = useChatStore.getState().activeChannel;

      const dmInfo = dmChannels.find((d) => d.id === channelId);
      const channelNameLower = typeof activeChannel?.name === 'string' ? activeChannel.name.toLowerCase() : '';
      const isAIChat =
        activeChannel?.type === 'DIRECT' &&
        (channelNameLower.includes('devchat ai') ||
          channelNameLower.includes('devchat_ai') ||
          channelNameLower.includes('devchat') ||
          dmInfo?.otherUser?.username === 'devchat_ai' ||
          dmInfo?.otherUser?.id === 'devchat-ai-bot-id' ||
          (activeChannel as any)?.slug?.includes('devchat-ai-bot-id') ||
          (activeChannel as any)?.members?.some((m: any) => m.userId === 'devchat-ai-bot-id' || m.user?.username === 'devchat_ai') ||
          (activeChannel?.createdBy as any)?.username === 'devchat_ai');
      const isAIMentioned = Boolean(content && typeof content === 'string' && /@ai\b|@devchat_ai\b|@DevChat AI/i.test(content));

      if (isAIChat || isAIMentioned) {
        const isImageRequest = Boolean(
          content &&
            typeof content === 'string' &&
            (/\b(image|images|photo|photos|picture|pic|draw|paint|sketch|wallpaper|render|illustration|generate|artwork|logo|logos|icon|icons|tasveer|banao|chahiye|chiye)\b/i.test(content) ||
              content.trim().startsWith('/image'))
        );
        useUIStore.getState().setAITypingChannelId(channelId, isImageRequest ? 'image' : 'chat');
      }

      // Optimistic UI Update — render message instantly (0ms latency)
      let tempId: string | undefined;
      if (currentUser) {
        tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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
          isForwarded: Boolean(isForwarded),
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
        socket.emit('message:send', { channelId, content, parentId, attachments, isForwarded, tempId }, (res: any) => {
          if (res?.error) {
            console.error('[Socket] message:send error:', res.error);
          }
        });
      } else {
        // Socket is offline/reconnecting (e.g. Render restart/deploy):
        // Queue for instant delivery as soon as socket connects!
        queueOutboxMessage({ channelId, content, parentId, attachments: attachments as any, isForwarded, tempId });

        // Also attempt REST API in parallel
        messageApi
          .sendMessage(channelId, content, parentId, attachments as any, isForwarded)
          .then((msg) => {
            useChatStore.getState().addMessage(msg);
          })
          .catch((err) => {
            console.warn('[Socket] REST fallback waiting for server wake-up:', err?.message || err);
          });
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
