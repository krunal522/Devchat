import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { markChannelAsRead } from '../channels/channel.service.js';
import type { SendMessageInput, UpdateMessageInput } from './message.schema.js';

const MESSAGE_SELECT = {
  id: true,
  content: true,
  isEdited: true,
  parentId: true,
  channelId: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  reactions: {
    select: {
      id: true,
      emoji: true,
      userId: true,
    },
  },
  attachments: {
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      fileType: true,
      fileSize: true,
      mimeType: true,
    },
  },
  parent: {
    select: {
      id: true,
      content: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  },
  _count: {
    select: { replies: true },
  },
} as const;

// Lean select for message CREATE — skips _count and parent lookup
// A new message always has 0 replies, so we hard-code it after creation.
// This eliminates the expensive COUNT(*) GROUP BY subquery (~300-350ms penalty).
const MESSAGE_SELECT_CREATE = {
  id: true,
  content: true,
  isEdited: true,
  parentId: true,
  channelId: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  reactions: {
    select: { id: true, emoji: true, userId: true },
  },
  attachments: {
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      fileType: true,
      fileSize: true,
      mimeType: true,
    },
  },
} as const;

export async function sendMessage(userId: string, channelId: string, input: SendMessageInput) {
  // Ensure AI Bot is automatically a member of any channel it posts to
  if (userId === 'devchat-ai-bot-id') {
    await prisma.channelMember.upsert({
      where: { userId_channelId: { userId: 'devchat-ai-bot-id', channelId } },
      create: { userId: 'devchat-ai-bot-id', channelId, role: 'MEMBER' },
      update: {},
    });
  } else if (!input.skipMembershipCheck) {
    // Verify user is a member of the channel (skip when socket handler pre-validates via findMany)
    const membership = await prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });
    if (!membership) {
      throw ApiError.forbidden('You are not a member of this channel');
    }
  }

  // Verify parent message exists if replying
  if (input.parentId) {
    const parent = await prisma.message.findUnique({
      where: { id: input.parentId, channelId },
    });
    if (!parent) {
      throw ApiError.notFound('Parent message not found in this channel');
    }
  }

  const rawMessage = await prisma.message.create({
    data: {
      content: input.content,
      userId,
      channelId,
      parentId: input.parentId || null,
      ...(input.attachments && input.attachments.length > 0
        ? {
            attachments: {
              create: input.attachments.map((att) => ({
                fileName: att.fileName,
                fileUrl: att.fileUrl,
                fileType: att.fileType,
                fileSize: att.fileSize,
                mimeType: att.mimeType,
              })),
            },
          }
        : {}),
    },
    select: MESSAGE_SELECT_CREATE,
  });

  // Compose final message — new messages always have 0 replies and no parent snapshot needed
  const message = {
    ...rawMessage,
    parent: null,
    _count: { replies: 0 },
  };

  // Update channel's updatedAt for sorting asynchronously
  prisma.channel
    .update({
      where: { id: channelId },
      data: { updatedAt: new Date() },
    })
    .catch(() => {});

  // Sender has read all messages up to this point
  markChannelAsRead(userId, channelId).catch(() => {});

  return message;
}

export async function getMessages(
  channelId: string,
  userId: string,
  cursor?: string,
  limit: number = 50
) {
  // Verify access
  const membership = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });

  if (!membership) {
    throw ApiError.forbidden('You are not a member of this channel');
  }

  // Check if this channel is a DIRECT channel to aggregate all messages between contact
  const targetChannel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { type: true, members: { select: { userId: true } } },
  });

  let matchingChannelIds = [channelId];

  if (targetChannel?.type === 'DIRECT' && targetChannel.members.length === 2) {
    const u1 = targetChannel.members[0].userId;
    const u2 = targetChannel.members[1].userId;
    const allDMs = await prisma.channel.findMany({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId: u1 } } },
          { members: { some: { userId: u2 } } },
        ],
      },
      select: { id: true },
    });
    matchingChannelIds = allDMs.map((d) => d.id);
  }

  // User opened channel/DM — mark as read for all matched IDs
  matchingChannelIds.forEach((cId) => {
    markChannelAsRead(userId, cId).catch(() => {});
  });

  const messages = await prisma.message.findMany({
    where: {
      channelId: { in: matchingChannelIds },
      parentId: null, // Only top-level messages
      ...(cursor ? { createdAt: { lt: (await prisma.message.findUnique({ where: { id: cursor } }))?.createdAt } } : {}),
    },
    select: MESSAGE_SELECT,
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // Fetch one extra to determine if there's more
  });

  const hasMore = messages.length > limit;
  const result = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? result[result.length - 1].id : null;

  return {
    messages: result.reverse(), // Return in chronological order
    nextCursor,
    hasMore,
  };
}

export async function getThreadMessages(parentId: string, userId: string) {
  const parent = await prisma.message.findUnique({
    where: { id: parentId },
    select: { channelId: true },
  });

  if (!parent) {
    throw ApiError.notFound('Message not found');
  }

  // Verify access
  const membership = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId: parent.channelId } },
  });

  if (!membership) {
    throw ApiError.forbidden('You do not have access to this thread');
  }

  // Get parent + replies
  const [parentMessage, replies] = await Promise.all([
    prisma.message.findUnique({
      where: { id: parentId },
      select: MESSAGE_SELECT,
    }),
    prisma.message.findMany({
      where: { parentId },
      select: MESSAGE_SELECT,
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return { parent: parentMessage, replies };
}

const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 Minutes Privacy Window

export async function updateMessage(userId: string, messageId: string, input: UpdateMessageInput) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { userId: true, createdAt: true },
  });

  if (!message) {
    throw ApiError.notFound('Message not found');
  }

  if (message.userId !== userId) {
    throw ApiError.forbidden('You can only edit your own messages');
  }

  return prisma.message.update({
    where: { id: messageId },
    data: {
      content: input.content,
      isEdited: true,
    },
    select: MESSAGE_SELECT,
  });
}

export async function deleteMessage(userId: string, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { userId: true, channelId: true, createdAt: true },
  });

  if (!message) {
    throw ApiError.notFound('Message not found');
  }

  const isOwner = message.userId === userId;

  if (!isOwner) {
    const membership = await prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId: message.channelId } },
    });

    if (membership?.role !== 'ADMIN') {
      throw ApiError.forbidden('You do not have permission to delete this message');
    }
  }

  await prisma.message.delete({ where: { id: messageId } });

  return { deleted: true, channelId: message.channelId };
}

export async function clearChannelMessages(userId: string, channelId: string) {
  // 1. Find channel by ID or slug
  const channel = await prisma.channel.findFirst({
    where: {
      OR: [
        { id: channelId },
        { slug: channelId },
      ],
    },
    include: { members: true },
  });

  if (!channel) {
    // If channel doesn't exist in DB yet, delete any messages matching channelId directly
    await prisma.message.deleteMany({ where: { channelId } });
    return { success: true, channelId };
  }

  const isMember = channel.members.some((m) => m.userId === userId) || channel.createdById === userId;
  if (!isMember) {
    throw ApiError.forbidden('You are not a member of this channel');
  }

  // Delete messages by channel ID AND slug matching channels (handles legacy duplicate DM channels)
  const matchingChannels = await prisma.channel.findMany({
    where: { slug: channel.slug },
    select: { id: true },
  });
  const channelIds = matchingChannels.map((c) => c.id);
  if (!channelIds.includes(channelId)) channelIds.push(channelId);

  await prisma.message.deleteMany({
    where: { channelId: { in: channelIds } },
  });

  return { success: true, channelId };
}

export async function toggleReaction(userId: string, messageId: string, emoji: string) {
  // 1. Check if user already reacted with THIS EXACT emoji
  const existingSameEmoji = await prisma.reaction.findUnique({
    where: {
      userId_messageId_emoji: { userId, messageId, emoji },
    },
  });

  if (existingSameEmoji) {
    // User clicked the same emoji again -> remove/toggle off
    await prisma.reaction.delete({ where: { id: existingSameEmoji.id } });
  } else {
    // User clicked a new/different emoji -> remove any previous reactions by this user on this message (WhatsApp style replace)
    await prisma.reaction.deleteMany({
      where: { userId, messageId },
    });

    // Add the new reaction
    await prisma.reaction.create({
      data: { userId, messageId, emoji },
    });
  }

  // Return updated message with reactions
  return prisma.message.findUnique({
    where: { id: messageId },
    select: MESSAGE_SELECT,
  });
}

export async function searchMessages(userId: string, query: string) {
  if (!query.trim()) return [];

  // Find channels user is a member of
  const memberships = await prisma.channelMember.findMany({
    where: { userId },
    select: { channelId: true },
  });

  const channelIds = memberships.map((m: { channelId: string }) => m.channelId);

  return prisma.message.findMany({
    where: {
      channelId: { in: channelIds },
      content: { contains: query },
    },
    select: {
      ...MESSAGE_SELECT,
      channel: { select: { id: true, name: true, type: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
}
