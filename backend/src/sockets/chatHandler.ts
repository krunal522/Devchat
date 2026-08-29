import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/database.js';
import * as messageService from '../modules/messages/message.service.js';
import { AI_BOT_ID, generateAIResponse } from '../modules/ai/ai.service.js';

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

      const message = await messageService.sendMessage(userId, channelId, {
        content: content ? content.trim() : '',
        parentId,
        attachments,
      });

      // Instantly deliver to all DM members via their personal user rooms
      // (every socket joins user:${userId} on connect — 100% reliable delivery)
      try {
        const members = await prisma.channelMember.findMany({
          where: { channelId },
          select: { userId: true },
        });
        members.forEach((m) => {
          io.to(`user:${m.userId}`).emit('message:new', message);
        });
      } catch (mErr) {
        // Fallback: broadcast to channel room if member lookup fails
        logger.error(`Error broadcasting to user rooms: ${mErr}`);
        io.to(`channel:${channelId}`).emit('message:new', message);
      }

      // If it's a thread reply, also emit to the thread room
      if (parentId) {
        io.to(`thread:${parentId}`).emit('thread:new_reply', message);
      }

      // Acknowledge success to sender
      callback?.({ success: true, data: message });

      logger.debug(`Message sent by ${userId} to channel ${channelId}`);

      // 🤖 AI Assistant Auto-Response Trigger
      if (userId !== AI_BOT_ID) {
        setTimeout(async () => {
          try {
            const channel = await prisma.channel.findUnique({
              where: { id: channelId },
              include: { members: true },
            });

            const isDMWithAI = channel?.type === 'DIRECT' && channel.members.some((m) => m.userId === AI_BOT_ID);
            const isAIMentioned = content && /@ai\b|@devchat_ai\b|@DevChat AI/i.test(content);

            if (isDMWithAI || isAIMentioned) {
              const senderUser = await prisma.user.findUnique({ where: { id: userId } });
              const senderName = senderUser?.displayName || senderUser?.username || 'Developer';
              const cleanPrompt = content.replace(/@ai\b|@devchat_ai\b|@DevChat AI/gi, '').trim() || 'Hello AI';

              const channelMembers = await prisma.channelMember.findMany({
                where: { channelId },
                select: { userId: true },
              });

              // 🔴 Emit AI typing start to channel room AND user rooms
              io.to(`channel:${channelId}`).emit('ai:typing:start', { channelId });
              channelMembers.forEach((m) => {
                io.to(`user:${m.userId}`).emit('ai:typing:start', { channelId });
              });

              try {
                const aiReplyText = await generateAIResponse(cleanPrompt, senderName);

                const aiMessage = await messageService.sendMessage(AI_BOT_ID, channelId, {
                  content: aiReplyText,
                  parentId: isAIMentioned ? message.id : parentId,
                });

                // Broadcast AI message to all clients, channel room, and member user rooms
                io.emit('message:new', aiMessage);
                io.to(`channel:${channelId}`).emit('message:new', aiMessage);
                channelMembers.forEach((m) => {
                  io.to(`user:${m.userId}`).emit('message:new', aiMessage);
                });
              } finally {
                // 🟢 Always stop typing indicator in both channel room AND user rooms!
                io.to(`channel:${channelId}`).emit('ai:typing:stop', { channelId });
                channelMembers.forEach((m) => {
                  io.to(`user:${m.userId}`).emit('ai:typing:stop', { channelId });
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
