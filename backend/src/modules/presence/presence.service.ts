import { prisma } from '../../config/database.js';
import { redis, RedisKeys } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';

// In-Memory fallback to track active sockets per user when Redis is not running
const memorySockets = new Map<string, Set<string>>();

/**
 * Mark a user as online — supports multiple socket connections (tabs)
 */
export async function setOnline(userId: string, socketId: string): Promise<void> {
  // Always update in-memory map
  if (!memorySockets.has(userId)) {
    memorySockets.set(userId, new Set());
  }
  memorySockets.get(userId)!.add(socketId);

  try {
    if (redis.status === 'ready') {
      await redis.sadd(RedisKeys.userSockets(userId), socketId);
      await redis.sadd(RedisKeys.onlineUsers, userId);
    }
  } catch (err) {
    // Bypass redis presence if offline
  }

  // Update database — also update lastSeenAt to now so stale old dates are cleared
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline: true, lastSeenAt: new Date() },
    });
  } catch (err) {}

  logger.debug(`User ${userId} connected (socket: ${socketId})`);
}

export async function removeSocket(userId: string, socketId: string): Promise<boolean> {
  let remainingSockets = 0;

  // Always remove from in-memory map
  if (memorySockets.has(userId)) {
    const userSet = memorySockets.get(userId)!;
    userSet.delete(socketId);
    remainingSockets = userSet.size;
    if (remainingSockets === 0) {
      memorySockets.delete(userId);
    }
  }

  try {
    if (redis.status === 'ready') {
      await redis.srem(RedisKeys.userSockets(userId), socketId);
      const redisCount = await redis.scard(RedisKeys.userSockets(userId));
      remainingSockets = Math.max(remainingSockets, redisCount);
    }
  } catch (err) {
    // Bypass redis presence if offline
  }

  if (remainingSockets === 0) {
    // No more active socket connections — user is TRULY offline
    try {
      if (redis.status === 'ready') {
        await redis.srem(RedisKeys.onlineUsers, userId);
      }
    } catch (err) {}

    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          isOnline: false,
          lastSeenAt: new Date(),
        },
      });
    } catch (err) {}

    logger.debug(`User ${userId} went offline`);
    return true; // User went offline
  }

  logger.debug(`User ${userId} disconnected socket ${socketId}, ${remainingSockets} remaining`);
  return false; // User still has active connections
}

/**
 * Get all currently online users
 */
export async function getOnlineUsers(): Promise<string[]> {
  // Primary: use in-memory socket map (most accurate — reflects active WS connections)
  const memoryUserIds = Array.from(memorySockets.keys());
  if (memoryUserIds.length > 0) return memoryUserIds;

  // Secondary: try Redis
  try {
    if (redis.status === 'ready') {
      const redisUsers = await redis.smembers(RedisKeys.onlineUsers);
      if (redisUsers && redisUsers.length > 0) return redisUsers;
    }
  } catch (err) {}

  // Tertiary: DB fallback (only return users that connected in last 5 minutes)
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const dbOnlineUsers = await prisma.user.findMany({
      where: {
        isOnline: true,
        lastSeenAt: { gte: fiveMinutesAgo },
      },
      select: { id: true },
    });
    return dbOnlineUsers.map((u) => u.id);
  } catch {
    return [];
  }
}

/**
 * Check if specific users are online
 */
export async function checkOnlineStatus(userIds: string[]): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {};

  try {
    if (redis.status === 'ready') {
      const pipeline = redis.pipeline();
      userIds.forEach((id) => pipeline.sismember(RedisKeys.onlineUsers, id));
      const results = await pipeline.exec();

      userIds.forEach((id, index) => {
        status[id] = Boolean(results?.[index]?.[1]);
      });
      return status;
    }
  } catch (err) {}

  // Fallback to in-memory socket map
  userIds.forEach((id) => {
    status[id] = memorySockets.has(id) && (memorySockets.get(id)?.size || 0) > 0;
  });
  return status;
}

/**
 * Get count of online users
 */
export async function getOnlineCount(): Promise<number> {
  try {
    if (redis.status === 'ready') {
      return await redis.scard(RedisKeys.onlineUsers);
    }
  } catch (err) {}

  return memorySockets.size;
}
