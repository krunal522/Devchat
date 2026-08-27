import { prisma } from '../../config/database.js';
import { redis, RedisKeys } from '../../config/redis.js';
import { ApiError } from '../../utils/ApiError.js';
import type { UpdateProfileInput } from './user.schema.js';

const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  statusText: true,
  isOnline: true,
  lastSeenAt: true,
  createdAt: true,
} as const;

export async function getUsers() {
  return prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { displayName: 'asc' },
  });
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_SELECT,
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Check real-time online status from Redis (safely handle Redis offline)
  let isOnline = Boolean(user.isOnline);
  try {
    if (redis.status === 'ready') {
      isOnline = Boolean(await redis.sismember(RedisKeys.onlineUsers, userId));
    }
  } catch {
    // Redis offline — fallback to DB presence
  }

  return { ...user, isOnline };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: input,
    select: USER_SELECT,
  });

  return user;
}

export async function searchUsers(query: string, excludeUserId?: string) {
  return prisma.user.findMany({
    where: {
      AND: [
        excludeUserId ? { id: { not: excludeUserId } } : {},
        {
          OR: [
            { username: { contains: query } },
            { displayName: { contains: query } },
          ],
        },
      ],
    },
    select: USER_SELECT,
    take: 20,
  });
}
