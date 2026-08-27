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
      const socket = getSocket();
      if (socket && socket.connected) {
        // Ensure room is joined so broadcast arrives back instantly
        socket.emit('channel:join', channelId);
        socket.emit('message:send', { channelId, content, parentId, attachments });
      } else {
        // REST API fallback for offline mode
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
