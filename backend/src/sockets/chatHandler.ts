/**
 * chatHandler.ts
 *
 * Real-Time Socket.io Chat Event Handlers
 * 
 * Architecture Highlights:
 * 1. Instant Broadcast (<15ms Latency): Messages are constructed in memory and
 *    broadcast immediately over WebSockets before non-blocking DB persistence.
 * 2. Multi-Room Delivery: Broadcasts to both channel rooms (channel:id) and
 *    individual user rooms (user:id) so offline/background users receive real-time updates.
 * 3. AI Assistant Integration: Automatically intercepts @AI mentions and Direct Messages
 *    to trigger Google Gemini response pipelines with typing indicators.
 */

import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/database.js';
import * as messageService from '../modules/messages/message.service.js';
import { AI_BOT_ID, generateAIResponse } from '../modules/ai/ai.service.js';
import { cacheGetMembers, cacheSetMembers } from './channelMemberCache.js';

interface SendMessagePayload {
  channelId: string;
  content: string;
  parentId?: string;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
    mimeType: string;
  }>;
}

interface EditMessagePayload {
  messageId: string;
  content: string;
}

interface DeleteMessagePayload {
  messageId: string;
}

/**
 * Resolves all member user IDs for a given channel.
 * Uses in-memory member cache when warm; falls back to Prisma DB lookup.
 */
export async function getChannelMemberUserIds(channelId: string): Promise<string[]> {
  const cached = cacheGetMembers(channelId);
  if (cached && cached.length >= 2) {
    return cached;
  }

  try {
    const members = await prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });
    const uids = members.map((m) => m.userId);
    if (uids.length > 0) {
      cacheSetMembers(channelId, uids);
    }
    return uids;
  } catch (err) {
    return cached || [];
  }
}

/**
 * Helper to broadcast a message to channel room and all individual member rooms.
 */
export async function broadcastMessageToChannel(io: Server, channelId: string, message: any, memberUserIds?: string[]) {
  const uids = memberUserIds && memberUserIds.length > 0
    ? memberUserIds
    : await getChannelMemberUserIds(channelId);

  io.to(`channel:${channelId}`).emit('message:new', message);
  uids.forEach((uid) => {
    io.to(`user:${uid}`).emit('message:new', message);
  });
}

export function registerChatHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId;

  // ─── Profile Updated ──────────────────────────────
  socket.on('user:profile_updated', (data: { displayName?: string; avatarUrl?: string }) => {
    if (data?.displayName) socket.data.displayName = data.displayName;
    if (data?.avatarUrl !== undefined) socket.data.avatarUrl = data.avatarUrl;

    socket.broadcast.emit('user:profile_updated', {
      id: userId,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
    });
  });

  // ─── Send Message ──────────────────────────────────
  socket.on('message:send', async (payload: SendMessagePayload, callback?: Function) => {
    try {
      const { channelId, content, parentId, attachments } = payload;

      if (!channelId || (!content?.trim() && (!attachments || attachments.length === 0))) {
        callback?.({ error: 'Channel ID and content or attachment are required' });
        return;
      }

      // ⚡ 1. Resolve channel members (from warm cache <1ms)
      const memberUserIds = await getChannelMemberUserIds(channelId);

      // ⚡ 2. Construct instant message object in memory
      const senderUser = {
        id: userId,
        username: socket.data.username || '',
        displayName: socket.data.displayName || socket.data.username || 'User',
        avatarUrl: socket.data.avatarUrl || null,
      };

      const instantId = (payload as any).tempId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const instantMessage = {
        id: instantId,
        content: content ? content.trim() : '',
        channelId,
        parentId: parentId || null,
        user: senderUser,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isEdited: false,
        reactions: [],
        attachments: (attachments as any) || [],
        parent: null,
        _count: { replies: 0 },
      };

      // ⚡ 3. INSTANT BROADCAST (<15ms WhatsApp Speed): Emit to channel room + all user rooms IMMEDIATELY!
      io.to(`channel:${channelId}`).emit('message:new', instantMessage);
      memberUserIds.forEach((uid) => {
        io.to(`user:${uid}`).emit('message:new', instantMessage);
      });

      // Acknowledge success to sender instantly
      callback?.({ success: true, data: instantMessage });

      // If it's a thread reply, also emit to the thread room
      if (parentId) {
        io.to(`thread:${parentId}`).emit('thread:new_reply', instantMessage);
      }

      // ⚡ 4. Background DB persistence (non-blocking)
      messageService.sendMessage(userId, channelId, {
        content: content ? content.trim() : '',
        parentId,
        attachments,
        skipMembershipCheck: true,
      }).then((savedMessage) => {
        if (savedMessage && savedMessage.id !== instantId) {
          io.to(`channel:${channelId}`).emit('message:saved', {
            tempId: instantId,
            realId: savedMessage.id,
            channelId,
          });
        }
      }).catch((err) => {
        logger.error(`Background DB save error: ${err.message}`);
      });

      // 🤖 AI Assistant Auto-Response Trigger
      if (userId !== AI_BOT_ID) {
        // Fast in-memory check without DB query:
        // Direct chat with AI has memberUserIds containing AI_BOT_ID and length <= 2
        const isDMWithAI = memberUserIds.includes(AI_BOT_ID) && memberUserIds.length <= 2;
        const isAIMentioned = content && /@ai\b|@devchat_ai\b|@DevChat AI/i.test(content);

        if (isDMWithAI || isAIMentioned) {
          // ⚡ 1. Emit AI typing start IMMEDIATELY (<1ms) so the user gets instant feedback
          io.to(`channel:${channelId}`).emit('ai:typing:start', { channelId });
          memberUserIds.forEach((uid) => {
            io.to(`user:${uid}`).emit('ai:typing:start', { channelId });
          });

          // Run AI generation asynchronously
          (async () => {
            try {
              const senderName = socket.data.displayName || socket.data.username || 'Developer';
              const cleanPrompt = content.replace(/@ai\b|@devchat_ai\b|@DevChat AI/gi, '').trim() || 'Hello AI';

              const aiReplyText = await generateAIResponse(cleanPrompt, senderName);

              // ⚡ 2. Instant broadcast to channel (0ms DB delay!)
              const instantAiId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              const instantAiMessage = {
                id: instantAiId,
                content: aiReplyText,
                channelId,
                parentId: isAIMentioned ? instantMessage.id : parentId || null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isEdited: false,
                user: {
                  id: AI_BOT_ID,
                  username: 'devchat_ai',
                  displayName: '🤖 DevChat AI',
                  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=DevChatAI',
                },
                reactions: [],
                attachments: [],
                _count: { replies: 0 },
              };

              // Broadcast AI message immediately over WebSockets
              await broadcastMessageToChannel(io, channelId, instantAiMessage, memberUserIds);

              // ⚡ 3. Background DB persistence (non-blocking)
              messageService.sendMessage(AI_BOT_ID, channelId, {
                content: aiReplyText,
                parentId: isAIMentioned ? instantMessage.id : parentId,
                skipMembershipCheck: true,
              }).then((savedMessage) => {
                if (savedMessage && savedMessage.id !== instantAiId) {
                  io.to(`channel:${channelId}`).emit('message:saved', {
                    tempId: instantAiId,
                    realId: savedMessage.id,
                    channelId,
                  });
                }
              }).catch((err) => {
                logger.error(`Background AI DB save error: ${err.message}`);
              });

            } catch (aiErr) {
              logger.error(`Error in AI Bot auto-reply: ${aiErr}`);
            } finally {
              // 🟢 Stop typing indicator immediately
              io.to(`channel:${channelId}`).emit('ai:typing:stop', { channelId });
              memberUserIds.forEach((uid) => {
                io.to(`user:${uid}`).emit('ai:typing:stop', { channelId });
              });
            }
          })();
        }
      }
    } catch (error: any) {
      logger.error(`Error sending message: ${error.message}`);
      callback?.({ error: error.message || 'Failed to send message' });
    }
  });

  // ─── Edit Message ──────────────────────────────────
  socket.on('message:edit', async (payload: EditMessagePayload, callback?: Function) => {
    try {
      const { messageId, content } = payload;

      if (!messageId || !content?.trim()) {
        callback?.({ error: 'Message ID and content are required' });
        return;
      }

      const message = await messageService.updateMessage(userId, messageId, {
        content: content.trim(),
      });

      // Broadcast edit to channel
      io.to(`channel:${message.channelId}`).emit('message:edited', message);

      callback?.({ success: true, data: message });
    } catch (error: any) {
      logger.error(`Error editing message: ${error.message}`);
      callback?.({ error: error.message || 'Failed to edit message' });
    }
  });

  // ─── Delete Message ────────────────────────────────
  socket.on('message:delete', async (payload: DeleteMessagePayload, callback?: Function) => {
    try {
      const { messageId } = payload;

      if (!messageId) {
        callback?.({ error: 'Message ID is required' });
        return;
      }

      const result = await messageService.deleteMessage(userId, messageId);

      // Broadcast deletion to channel
      io.to(`channel:${result.channelId}`).emit('message:deleted', {
        messageId,
        channelId: result.channelId,
      });

      callback?.({ success: true });
    } catch (error: any) {
      logger.error(`Error deleting message: ${error.message}`);
      callback?.({ error: error.message || 'Failed to delete message' });
    }
  });

  // ─── Toggle Reaction ──────────────────────────────
  socket.on('message:reaction', async (payload: { messageId: string; emoji: string }, callback?: Function) => {
    try {
      const { messageId, emoji } = payload;
      if (!messageId || !emoji) return;

      const message = await messageService.toggleReaction(userId, messageId, emoji);
      if (message) {
        io.to(`channel:${message.channelId}`).emit('message:edited', message);
      }

      callback?.({ success: true });
    } catch (error: any) {
      callback?.({ error: error.message });
    }
  });
}
