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

export async function broadcastMessageToChannel(io: Server, channelId: string, message: any, memberUserIds?: string[]) {
  // If we already know member IDs (passed from send handler), emit to user rooms INSTANTLY
  if (memberUserIds && memberUserIds.length > 0) {
    memberUserIds.forEach((uid) => {
      io.to(`user:${uid}`).emit('message:new', message);
    });
    // Also emit to channel room for anyone else joined
    io.to(`channel:${channelId}`).emit('message:new', message);
    return;
  }

  // Fallback: emit to channel room + fetch member user rooms asynchronously
  io.to(`channel:${channelId}`).emit('message:new', message);
  prisma.channelMember
    .findMany({ where: { channelId }, select: { userId: true } })
    .then((members) => {
      members.forEach((m) => {
        io.to(`user:${m.userId}`).emit('message:new', message);
      });
    })
    .catch(() => {});
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

      // ⚡ FAST PATH: Check in-memory cache first — skip DB query if warm!
      const cachedMembers = cacheGetMembers(channelId);

      let message: any;
      let memberUserIds: string[];

      if (cachedMembers) {
        // ✅ Cache HIT: Only 1 DB call (message save) — no members query needed!
        message = await messageService.sendMessage(userId, channelId, {
          content: content ? content.trim() : '',
          parentId,
          attachments,
          skipMembershipCheck: true,
        });
        memberUserIds = cachedMembers;
      } else {
        // ⚠️ Cache MISS (first message in channel): 2 parallel DB calls, then warm cache
        const [savedMessage, members] = await Promise.all([
          messageService.sendMessage(userId, channelId, {
            content: content ? content.trim() : '',
            parentId,
            attachments,
            skipMembershipCheck: true,
          }),
          prisma.channelMember.findMany({ where: { channelId }, select: { userId: true } }),
        ]);
        message = savedMessage;
        memberUserIds = members.map((m) => m.userId);
        // Warm the cache for all future messages in this channel
        cacheSetMembers(channelId, memberUserIds);
      }

      // ⚡ INSTANT BROADCAST: emit to channel room + ALL user rooms simultaneously
      io.to(`channel:${channelId}`).emit('message:new', message);
      memberUserIds.forEach((uid) => {
        io.to(`user:${uid}`).emit('message:new', message);
      });

      // Acknowledge success to sender instantly
      callback?.({ success: true, data: message });

      // If it's a thread reply, also emit to the thread room
      if (parentId) {
        io.to(`thread:${parentId}`).emit('thread:new_reply', message);
      }

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
                  parentId: isAIMentioned ? message.id : parentId,
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
