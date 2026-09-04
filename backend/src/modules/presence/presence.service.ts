import { prisma } from '../../config/database.js';
import { redis, RedisKeys } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';

// Timers to debounce user:offline during temporary Render network/proxy socket reconnects
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
const memorySockets = new Map<string, Set<string>>();

/**
 * Mark a user as online — supports multiple socket connections (tabs)
 */
export async function setOnline(userId: string, socketId: string): Promise<void> {
  // Cancel pending offline timer if user reconnected during grace period
  if (offlineTimers.has(userId)) {
    clearTimeout(offlineTimers.get(userId)!);
    offlineTimers.delete(userId);
  }

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
    // ⚡ 3-second grace period debounce: prevents flickering offline during page reloads or transport upgrades
    return new Promise<boolean>((resolve) => {
      if (offlineTimers.has(userId)) {
        clearTimeout(offlineTimers.get(userId)!);
      }

      const timer = setTimeout(async () => {
        offlineTimers.delete(userId);

        // Verify user hasn't reconnected during grace period
        if (memorySockets.has(userId) && (memorySockets.get(userId)?.size ?? 0) > 0) {
          resolve(false);
          return;
        }

        try {
          if (redis.status === 'ready') {
            await redis.srem(RedisKeys.onlineUsers, userId);
          }
        } catch (err) {}

        try {
          await prisma.user.update({
            where: { id: userId },
            data: { isOnline: false, lastSeenAt: new Date() },
          });
        } catch (err) {}

        logger.debug(`User ${userId} marked offline after grace period`);
        resolve(true);
      }, 3000);

      offlineTimers.set(userId, timer);
    });
  }

  logger.debug(`User ${userId} disconnected socket ${socketId}, ${remainingSockets} remaining`);
  return false;
}

/**
 * Get all currently online users
 */
export async function getOnlineUsers(): Promise<string[]> {
  const onlineSet = new Set<string>();

  // 1. Truly connected active sockets in memory
  for (const [userId, sockets] of memorySockets.entries()) {
    if (sockets && sockets.size > 0) {
      onlineSet.add(userId);
    }
  }

  // 2. Redis online set (for multi-instance / cluster deployments)
  try {
    if (redis.status === 'ready') {
      const redisUsers = await redis.smembers(RedisKeys.onlineUsers);
      if (redisUsers && Array.isArray(redisUsers)) {
        redisUsers.forEach((id) => onlineSet.add(id));
      }
    }
  } catch (err) {}

  // 3. Fallback to DB for active users (updated within last 60 seconds)
  try {
    const recentActive = await prisma.user.findMany({
      where: {
        isOnline: true,
        lastSeenAt: { gte: new Date(Date.now() - 60000) },
      },
      select: { id: true },
    });
    recentActive.forEach((u) => onlineSet.add(u.id));
  } catch (err) {}

  return Array.from(onlineSet);
}

/**
 * Check if specific users are online
 */
export async function checkOnlineStatus(userIds: string[]): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {};
  if (!userIds || userIds.length === 0) return status;

  const onlineList = await getOnlineUsers();
  const onlineSet = new Set(onlineList);

  userIds.forEach((id) => {
    status[id] = onlineSet.has(id);
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
