import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

function createRedisClient(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy(times: number) {
      // Reconnect with capped backoff up to 10s
      const delay = Math.min(times * 1000, 10000);
      return delay;
    },
  });

  client.on('connect', () => {
    logger.info(`✅ Redis ${name} connected`);
  });

  client.on('error', (err: Error) => {
    // Silent warn on missing redis during offline local dev
  });

  client.on('close', () => {
    logger.warn(`Redis ${name} connection closed`);
  });

  return client;
}

// Main client for general cache operations
export const redis = createRedisClient('cache');

// Dedicated clients for Socket.io Redis adapter (Pub/Sub requires separate connections)
export const redisPub = createRedisClient('pub');
export const redisSub = createRedisClient('sub');

// ─── Redis Key Helpers ──────────────────────────────────

export const RedisKeys = {
  // Presence
  onlineUsers: 'presence:online',
  userSockets: (userId: string) => `presence:sockets:${userId}`,

  // Sessions
  refreshToken: (userId: string) => `auth:refresh:${userId}`,
  userProfile: (userId: string) => `user:profile:${userId}`,

  // Typing
  typing: (channelId: string) => `typing:${channelId}`,
  typingChannel: (channelId: string) => `typing:${channelId}`,
} as const;

// ─── Resilient Redis Call Helpers ───────────────────────

export async function safeRedisSet(key: string, value: string, mode?: 'EX', duration?: number): Promise<void> {
  try {
    if (redis.status === 'ready') {
      if (mode === 'EX' && duration) {
        await redis.set(key, value, 'EX', duration);
      } else {
        await redis.set(key, value);
      }
    }
  } catch (err) {
    logger.warn(`Redis SET bypassed (offline mode) for key: ${key}`);
  }
}

export async function safeRedisGet(key: string): Promise<string | null> {
  try {
    if (redis.status === 'ready') {
      return await redis.get(key);
    }
  } catch (err) {
    logger.warn(`Redis GET bypassed (offline mode) for key: ${key}`);
  }
  return null;
}

export async function safeRedisDel(key: string): Promise<void> {
  try {
    if (redis.status === 'ready') {
      await redis.del(key);
    }
  } catch (err) {
    logger.warn(`Redis DEL bypassed (offline mode) for key: ${key}`);
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    await Promise.all([
      redis.quit(),
      redisPub.quit(),
      redisSub.quit(),
    ]);
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error disconnecting Redis:', error);
  }
}
