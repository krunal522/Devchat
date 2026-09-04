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
    if (offlineTimers.has(userId)) {
      clearTimeout(offlineTimers.get(userId)!);
    }

    // ⚡ Mark offline in DB IMMEDIATELY so other users see correct status right away
    // Also remove from Redis immediately
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

    // Short 3-second grace period ONLY to handle browser tab refresh / brief reconnects
    // (Not for marking offline — that already happened above)
    const timer = setTimeout(async () => {
      offlineTimers.delete(userId);

      // Re-verify if user reconnected during grace period
      if (memorySockets.has(userId) && (memorySockets.get(userId)?.size || 0) > 0) {
        // User reconnected — undo the offline mark
        try {
          await prisma.user.update({
            where: { id: userId },
            data: { isOnline: true },
          });
          if (redis.status === 'ready') {
            await redis.sadd(RedisKeys.onlineUsers, userId);
          }
        } catch {}
        return;
      }

      memorySockets.delete(userId);
      logger.debug(`User ${userId} confirmed offline after grace period`);
    }, 3000);

    offlineTimers.set(userId, timer);
    // Return true = caller should broadcast user:offline immediately
    return true;
  }

  logger.debug(`User ${userId} disconnected socket ${socketId}, ${remainingSockets} remaining`);
  return false;
}

/**
 * Get all currently online users
 */
export async function getOnlineUsers(): Promise<string[]> {
  const onlineSet = new Set<string>();

  // 1. Only truly connected sockets = online
  //    offlineTimers users are DISCONNECTING — do NOT show them as online
  for (const userId of memorySockets.keys()) {
    if ((memorySockets.get(userId)?.size || 0) > 0) {
      onlineSet.add(userId);
    }
  }

  // 2. Redis online set (across distributed backend workers / multiple server instances)
  try {
    if (redis.status === 'ready') {
      const redisUsers = await redis.smembers(RedisKeys.onlineUsers);
      if (redisUsers && Array.isArray(redisUsers)) {
        redisUsers.forEach((id) => onlineSet.add(id));
      }
    }
  } catch (err) {}

  // 3. DB fallback — ONLY check isOnline: true (NOT lastSeenAt)
  //    Using lastSeenAt caused ghost online status for up to 5 minutes after logout!
  if (onlineSet.size === 0) {
    try {
      const dbOnlineUsers = await prisma.user.findMany({
        where: { isOnline: true },
        select: { id: true },
      });
      dbOnlineUsers.forEach((u) => onlineSet.add(u.id));
    } catch (err) {}
  }

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
