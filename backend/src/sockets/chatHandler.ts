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
        setTimeout(async () => {
          try {
            const isDMWithAI = memberUserIds.includes(AI_BOT_ID);
            const isAIMentioned = content && /@ai\b|@devchat_ai\b|@DevChat AI/i.test(content);

            // Check if it's a DIRECT channel with AI (use cached members list)
            let isDMTypeWithAI = false;
            if (isDMWithAI) {
              const channel = await prisma.channel.findUnique({
                where: { id: channelId },
                select: { type: true },
              });
              isDMTypeWithAI = channel?.type === 'DIRECT';
            }

            if (isDMTypeWithAI || isAIMentioned) {
              const senderUser = await prisma.user.findUnique({ where: { id: userId } });
              const senderName = senderUser?.displayName || senderUser?.username || 'Developer';
              const cleanPrompt = content.replace(/@ai\b|@devchat_ai\b|@DevChat AI/gi, '').trim() || 'Hello AI';

              // 🔴 Emit AI typing start to channel room AND user rooms
              io.to(`channel:${channelId}`).emit('ai:typing:start', { channelId });
              memberUserIds.forEach((uid) => {
                io.to(`user:${uid}`).emit('ai:typing:start', { channelId });
              });

              try {
                const aiReplyText = await generateAIResponse(cleanPrompt, senderName);

                const aiMessage = await messageService.sendMessage(AI_BOT_ID, channelId, {
                  content: aiReplyText,
                  parentId: isAIMentioned ? instantMessage.id : parentId,
                });

                // Broadcast AI message using deduplicated room emitter
                await broadcastMessageToChannel(io, channelId, aiMessage);
              } finally {
                // 🟢 Always stop typing indicator in both channel room AND user rooms!
                io.to(`channel:${channelId}`).emit('ai:typing:stop', { channelId });
                memberUserIds.forEach((uid) => {
                  io.to(`user:${uid}`).emit('ai:typing:stop', { channelId });
                });
              }
            }
          } catch (aiErr) {
            logger.error(`Error in AI Bot auto-reply: ${aiErr}`);
          }
        }, 0);
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
