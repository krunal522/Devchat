import { Request, Response, NextFunction } from 'express';
import * as messageService from './message.service.js';
import { getIO } from '../../sockets/index.js';
import { prisma } from '../../config/database.js';
import { AI_BOT_ID, generateAIResponse } from '../ai/ai.service.js';
import { logger } from '../../utils/logger.js';

import { broadcastMessageToChannel, getChannelMemberUserIds } from '../../sockets/chatHandler.js';

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const channelId = req.params.channelId as string;
    const senderUserId = req.user!.userId;
    const content = req.body.content || '';

    const message = await messageService.sendMessage(senderUserId, channelId, req.body);
    res.status(201).json({ success: true, data: message });

    // Asynchronously handle Socket broadcast and AI bot auto-response
    try {
      const io = getIO();
      await broadcastMessageToChannel(io, channelId, message);

      if (senderUserId !== AI_BOT_ID) {
        setTimeout(async () => {
          try {
            const channel = await prisma.channel.findUnique({
              where: { id: channelId },
              include: { members: true },
            });

            const isDMWithAI = channel?.type === 'DIRECT' && channel.members.some((m) => m.userId === AI_BOT_ID);
            const isAIMentioned = content && /@ai\b|@devchat_ai\b|@DevChat AI/i.test(content);

            if (isDMWithAI || isAIMentioned) {
              const senderUser = await prisma.user.findUnique({ where: { id: senderUserId } });
              const senderName = senderUser?.displayName || senderUser?.username || 'Developer';
              const cleanPrompt = content.replace(/@ai\b|@devchat_ai\b|@DevChat AI/gi, '').trim() || (req.body.attachments && req.body.attachments.length > 0 ? 'Describe and analyze this image in detail.' : 'Hello AI');

              const members = await prisma.channelMember.findMany({
                where: { channelId },
                select: { userId: true },
              });

              io.to(`channel:${channelId}`).emit('ai:typing:start', { channelId });
              members.forEach((m) => {
                io.to(`user:${m.userId}`).emit('ai:typing:start', { channelId });
              });

              try {
                const aiResult = await generateAIResponse(cleanPrompt, senderName, [], req.body.attachments);
                const aiReplyText = typeof aiResult === 'string' ? aiResult : aiResult.text;
                const aiAttachments = typeof aiResult === 'string' ? [] : (aiResult.attachments || []);

                const aiMessage = await messageService.sendMessage(AI_BOT_ID, channelId, {
                  content: aiReplyText,
                  parentId: isAIMentioned ? message.id : req.body.parentId,
                  attachments: aiAttachments,
                });

                await broadcastMessageToChannel(io, channelId, aiMessage);
              } finally {
                io.to(`channel:${channelId}`).emit('ai:typing:stop', { channelId });
                members.forEach((m) => {
                  io.to(`user:${m.userId}`).emit('ai:typing:stop', { channelId });
                });
              }
            }
          } catch (aiErr) {
            logger.error(`Error in REST AI Bot response: ${aiErr}`);
          }
        }, 0);
      }
    } catch {
      // Ignore socket emit errors if socket not initialized
    }
  } catch (error) {
    next(error);
  }
}

export async function getMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await messageService.getMessages(
      req.params.channelId as string,
      req.user!.userId,
      cursor,
      Math.min(limit, 100)
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getThreadMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await messageService.getThreadMessages(
      req.params.messageId as string,
      req.user!.userId
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const message = await messageService.updateMessage(
      req.user!.userId,
      req.params.messageId as string,
      req.body
    );
    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await messageService.deleteMessage(
      req.user!.userId,
      req.params.messageId as string
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function clearChannelMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const channelId = req.params.channelId as string;
    const userId = req.user!.userId;
    const result = await messageService.clearChannelMessages(userId, channelId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function toggleReaction(req: Request, res: Response, next: NextFunction) {
  try {
    const { emoji } = req.body;
    const message = await messageService.toggleReaction(
      req.user!.userId,
      req.params.messageId as string,
      emoji
    );

    if (message) {
      try {
        const io = getIO();
        const memberUserIds = await getChannelMemberUserIds(message.channelId);
        const rooms = [`channel:${message.channelId}`, ...memberUserIds.map((uid) => `user:${uid}`)];
        io.to(rooms).emit('message:edited', message);
        io.to(rooms).emit('message:reaction_updated', {
          messageId: message.id,
          reactions: message.reactions,
          channelId: message.channelId,
        });
      } catch {}
    }

    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
}

export async function searchMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const query = (req.query.q as string) || '';
    const results = await messageService.searchMessages(req.user!.userId, query);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
}
