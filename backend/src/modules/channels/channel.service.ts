import { prisma } from '../../config/database.js';
import { redis, RedisKeys } from '../../config/redis.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import { slugify } from '../../utils/helpers.js';
import type { CreateChannelInput, UpdateChannelInput } from './channel.schema.js';
import { getOnlineUsers as getPresenceOnlineUsers } from '../presence/presence.service.js';

const CHANNEL_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  type: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true, messages: true } },
  createdBy: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
} as const;

export async function createChannel(userId: string, input: CreateChannelInput, workspaceId?: string) {
  const baseSlug = slugify(input.name);
  const slug = workspaceId ? `${baseSlug}-${workspaceId.slice(0, 8)}` : baseSlug;

  // Check for duplicate slug
  const existing = await prisma.channel.findFirst({ where: { slug, workspaceId: workspaceId || null } });
  if (existing) {
    throw ApiError.conflict(`Channel "${input.name}" already exists in this workspace`);
  }

  // Create channel and add creator as ADMIN member in a transaction
  const channel = await prisma.$transaction(async (tx) => {
    const created = await tx.channel.create({
      data: {
        name: input.name,
        slug,
        description: input.description || null,
        type: input.type,
        createdById: userId,
        workspaceId: workspaceId || null,
      },
      select: CHANNEL_SELECT,
    });

    // Add creator as ADMIN
    await tx.channelMember.create({
      data: {
        userId,
        channelId: created.id,
        role: 'ADMIN',
      },
    });

    return created;
  });

  return channel;
}

export async function getChannels(userId: string, workspaceId?: string) {
  const whereCondition: any = {
    OR: [
      { type: 'PUBLIC' },
      { type: 'PRIVATE', members: { some: { userId } } },
    ],
    type: { not: 'DIRECT' },
  };

  if (workspaceId) {
    whereCondition.workspaceId = workspaceId;
  }

  const channels = await prisma.channel.findMany({
    where: whereCondition,
    select: {
      ...CHANNEL_SELECT,
      members: {
        where: { userId },
        select: { id: true, role: true },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  });

  return channels.map((channel) => ({
    ...channel,
    isMember: channel.members.length > 0,
    myRole: channel.members[0]?.role || null,
    members: undefined,
  }));
}

export async function getChannelById(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      ...CHANNEL_SELECT,
      members: {
        where: { userId },
        select: { id: true, role: true },
        take: 1,
      },
    },
  });

  if (!channel) {
    throw ApiError.notFound('Channel not found');
  }

  // Check access for private channels
  if (channel.type === 'PRIVATE' && channel.members.length === 0) {
    throw ApiError.forbidden('You do not have access to this channel');
  }

  return {
    ...channel,
    isMember: channel.members.length > 0,
    myRole: channel.members[0]?.role || null,
    members: undefined,
  };
}

export async function joinChannel(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw ApiError.notFound('Channel not found');
  }

  if (channel.type === 'PRIVATE') {
    throw ApiError.forbidden('Cannot join a private channel without an invitation');
  }

  // Check if already a member
  const existing = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });

  if (existing) {
    throw ApiError.conflict('Already a member of this channel');
  }

  await prisma.channelMember.create({
    data: { userId, channelId },
  });

  return { joined: true };
}

export async function leaveChannel(userId: string, channelId: string) {
  const membership = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });

  if (!membership) {
    throw ApiError.badRequest('You are not a member of this channel');
  }

  await prisma.channelMember.delete({
    where: { id: membership.id },
  });

  return { left: true };
}

export async function isChannelAdmin(userId: string, channelId: string): Promise<boolean> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { createdById: true },
  });
  if (!channel) return false;
  if (channel.createdById === userId) return true;

  const membership = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
    select: { role: true },
  });
  return membership?.role === 'ADMIN';
}

export async function addChannelMembers(requesterId: string, channelId: string, userIds: string[]) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw ApiError.notFound('Channel not found');
  }

  const isAdmin = await isChannelAdmin(requesterId, channelId);
  if (!isAdmin) {
    throw ApiError.forbidden('Only channel admins can add members');
  }

  for (const userId of userIds) {
    if (channel.workspaceId) {
      await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId, workspaceId: channel.workspaceId } },
        update: {},
        create: { userId, workspaceId: channel.workspaceId, role: 'MEMBER' },
      });
    }

    await prisma.channelMember.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: {},
      create: { userId, channelId, role: 'MEMBER' },
    });
  }

  return getChannelMembers(channelId);
}

export async function removeChannelMember(requesterId: string, channelId: string, targetUserId: string) {
  const isAdmin = await isChannelAdmin(requesterId, channelId);
  if (!isAdmin) {
    throw ApiError.forbidden('Only channel admins can remove members');
  }

  const membership = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId: targetUserId, channelId } },
  });

  if (!membership) {
    throw ApiError.notFound('User is not a member of this channel');
  }

  await prisma.channelMember.delete({
    where: { id: membership.id },
  });

  return getChannelMembers(channelId);
}

export async function deleteChannel(requesterId: string, channelId: string) {
  const isAdmin = await isChannelAdmin(requesterId, channelId);
  if (!isAdmin) {
    throw ApiError.forbidden('Only channel admins can delete this channel');
  }

  await prisma.$transaction([
    prisma.message.deleteMany({ where: { channelId } }),
    prisma.channelMember.deleteMany({ where: { channelId } }),
    prisma.channel.delete({ where: { id: channelId } }),
  ]);

  return { deleted: true };
}

export async function getChannelMembers(channelId: string) {
  const members = await prisma.channelMember.findMany({
    where: { channelId },
    select: {
      role: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          statusText: true,
          isOnline: true,
          lastSeenAt: true,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { user: { displayName: 'asc' } }],
  });

  const onlineUserIds = await getPresenceOnlineUsers();
  const onlineSet = new Set(onlineUserIds);

  return members.map((member) => ({
    ...member.user,
    role: member.role,
    joinedAt: member.joinedAt,
    isOnline: onlineSet.has(member.user.id),
  }));
}

export async function getOrCreateDMChannel(userId1: string, userId2: string) {
  const sortedIds = [userId1, userId2].sort();
  const canonicalSlug = `dm-${sortedIds[0]}-${sortedIds[1]}`;

  // Find all existing DM channels between these two users
  const allExisting = await prisma.channel.findMany({
    where: {
      type: 'DIRECT',
      AND: [
        { members: { some: { userId: userId1 } } },
        { members: { some: { userId: userId2 } } },
      ],
    },
    select: CHANNEL_SELECT,
    orderBy: { createdAt: 'asc' },
  });

  let canonical = allExisting.find((c) => c.slug === canonicalSlug) || allExisting[0];

  if (!canonical) {
    const user1 = await prisma.user.findUnique({ where: { id: userId1 }, select: { username: true } });
    const user2 = await prisma.user.findUnique({ where: { id: userId2 }, select: { username: true } });

    if (!user1 || !user2) {
      throw ApiError.notFound('User not found');
    }

    try {
      canonical = await prisma.$transaction(async (tx) => {
        const dmChannel = await tx.channel.create({
          data: {
            name: `${user1.username}-${user2.username}`,
            slug: canonicalSlug,
            type: 'DIRECT',
            createdById: userId1,
          },
          select: CHANNEL_SELECT,
        });

        await tx.channelMember.createMany({
          data: [
            { userId: userId1, channelId: dmChannel.id },
            { userId: userId2, channelId: dmChannel.id },
          ],
        });

        return dmChannel;
      });
    } catch (err) {
      const fallback = await prisma.channel.findFirst({
        where: { slug: canonicalSlug },
        select: CHANNEL_SELECT,
      });
      if (fallback) canonical = fallback;
      else throw err;
    }
  }

  // Cleanup legacy duplicate channels if any exist
  if (allExisting.length > 1) {
    const duplicateIds = allExisting.filter((c) => c.id !== canonical.id).map((c) => c.id);
    if (duplicateIds.length > 0) {
      try {
        await prisma.message.updateMany({
          where: { channelId: { in: duplicateIds } },
          data: { channelId: canonical.id },
        });
        await prisma.channelMember.deleteMany({ where: { channelId: { in: duplicateIds } } });
        await prisma.channel.deleteMany({ where: { id: { in: duplicateIds } } });
        logger.info(`Merged ${duplicateIds.length} duplicate DM channels into ${canonical.id}`);
      } catch (e) {
        logger.error('Error cleaning up duplicate DM channels:', e);
      }
    }
  }

  return canonical;
}

export async function getDMChannels(userId: string) {
  const channels = await prisma.channel.findMany({
    where: {
      type: 'DIRECT',
      members: {
        some: { userId },
      },
    },
    select: {
      ...CHANNEL_SELECT,
      members: {
        select: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isOnline: true,
              lastSeenAt: true,
            },
          },
        },
      },
      messages: {
        select: {
          content: true,
          createdAt: true,
          user: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const onlineUserIds = await getPresenceOnlineUsers();
  const onlineSet = new Set(onlineUserIds);

  const mapByRecipient = new Map<string, typeof channels[0]>();
  const duplicatesToPrimary = new Map<string, string[]>();

  for (const ch of channels) {
    const other = ch.members.find((m) => m.user.id !== userId)?.user;
    if (!other || other.id === userId) continue;

    if (!mapByRecipient.has(other.id)) {
      mapByRecipient.set(other.id, ch);
    } else {
      // Duplicate channel detected for same contact
      const primary = mapByRecipient.get(other.id)!;
      if (ch.id !== primary.id) {
        const dups = duplicatesToPrimary.get(primary.id) || [];
        dups.push(ch.id);
        duplicatesToPrimary.set(primary.id, dups);
      }
    }
  }

  // Merge and delete duplicate channels in background per primary channel
  if (duplicatesToPrimary.size > 0) {
    duplicatesToPrimary.forEach((dupIds, primaryId) => {
      prisma.message.updateMany({
        where: { channelId: { in: dupIds } },
        data: { channelId: primaryId },
      }).then(() => {
        return prisma.channelMember.deleteMany({ where: { channelId: { in: dupIds } } });
      }).then(() => {
        return prisma.channel.deleteMany({ where: { id: { in: dupIds } } });
      }).catch((err) => logger.error('Error cleaning up duplicate DMs in getDMChannels:', err));
    });
  }

  return Array.from(mapByRecipient.values()).map((channel) => {
    const otherUser = channel.members.find((m) => m.user.id !== userId)?.user;
    const isOnline = otherUser ? onlineSet.has(otherUser.id) : false;

    return {
      id: channel.id,
      otherUser: otherUser ? { ...otherUser, isOnline } : null,
      lastMessage: channel.messages[0] || null,
      updatedAt: channel.updatedAt,
    };
  });
}
