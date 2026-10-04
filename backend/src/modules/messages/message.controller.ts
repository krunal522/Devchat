import { Request, Response, NextFunction } from 'express';
import * as messageService from './message.service.js';
import { getIO } from '../../sockets/index.js';
import { prisma } from '../../config/database.js';
import { AI_BOT_ID, generateAIResponse, isSummarizeRequest, isCodeReviewRequest } from '../ai/ai.service.js';
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
            const isSummarize = content && isSummarizeRequest(content);
            const isCodeReview = content && isCodeReviewRequest(content);

            if (isDMWithAI || isAIMentioned || isSummarize || isCodeReview) {
              const senderUser = await prisma.user.findUnique({ where: { id: senderUserId } });
              const senderName = senderUser?.displayName || senderUser?.username || 'Developer';
              io.to(`channel:${channelId}`).emit('ai:typing:start', { channelId });

              try {
                let aiReplyText = '';
                let aiAttachments: any[] = [];

                if (isSummarize) {
                  const recentMsgs = await prisma.message.findMany({
                    where: { channelId, userId: { not: AI_BOT_ID } },
                    orderBy: { createdAt: 'desc' },
                    take: 30,
                    include: { user: { select: { displayName: true, username: true } } },
                  });
                  const chName = channel?.name || 'channel';
                  if (recentMsgs.length < 2) {
                    aiReplyText = `Hey @${senderName}! 👋 Not enough recent messages in #${chName} to generate a summary yet. Chat with your team and run \`/summarize\` again! 💬`;
                  } else {
                    const transcript = recentMsgs.reverse().map((m) => `${m.user.displayName || m.user.username}: ${m.content}`).join('\n');
                    const summaryPrompt = `You are DevChat AI Executive Summarizer.\nAnalyze this developer conversation from #${chName} and provide a crisp executive summary:\n\n\`\`\`\n${transcript}\n\`\`\`\n\nStructure with:\n## 📋 Channel Summary: #${chName}\n\n### 📌 Quick Overview\n\n### 💬 Key Discussion Points\n\n### 🎯 Decisions & Technical Consensus\n\n### ⚡ Action Items & Next Steps`;
                    const aiResult = await generateAIResponse(summaryPrompt, senderName, []);
                    aiReplyText = typeof aiResult === 'string' ? aiResult : aiResult.text;
                  }
                } else if (isCodeReview) {
                  const rawCode = content.replace(/@ai\b|@devchat_ai\b|@DevChat AI/gi, '').replace(/^\/(?:review|audit|critique)\s*/i, '').trim();
                  const aiResult = await generateAIResponse(`/review ${rawCode}`, senderName, [], req.body.attachments);
                  aiReplyText = typeof aiResult === 'string' ? aiResult : aiResult.text;
                  aiAttachments = typeof aiResult === 'string' ? [] : (aiResult.attachments || []);
                } else {
                  const cleanPrompt = content.replace(/@ai\b|@devchat_ai\b|@DevChat AI/gi, '').trim() || (req.body.attachments && req.body.attachments.length > 0 ? 'Describe and analyze this image in detail.' : 'Hello AI');
                  const aiResult = await generateAIResponse(cleanPrompt, senderName, [], req.body.attachments);
                  aiReplyText = typeof aiResult === 'string' ? aiResult : aiResult.text;
                  aiAttachments = typeof aiResult === 'string' ? [] : (aiResult.attachments || []);
                }

                const aiMessage = await messageService.sendMessage(AI_BOT_ID, channelId, {
                  content: aiReplyText,
                  parentId: isAIMentioned ? message.id : req.body.parentId,
                  attachments: aiAttachments,
                });

                await broadcastMessageToChannel(io, channelId, aiMessage);
              } finally {
                io.to(`channel:${channelId}`).emit('ai:typing:stop', { channelId });
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
