import { Server, Socket } from 'socket.io';
import { redis, RedisKeys } from '../config/redis.js';

const TYPING_TIMEOUT = 3000; // 3 seconds auto-stop
const typingTimers = new Map<string, NodeJS.Timeout>();

async function safeRedisHSet(key: string, field: string, value: string) {
  try {
    if (redis.status === 'ready') {
      await redis.hset(key, field, value);
    }
  } catch {
    // Redis offline
  }
}

async function safeRedisHDel(key: string, field: string) {
  try {
    if (redis.status === 'ready') {
      await redis.hdel(key, field);
    }
  } catch {
    // Redis offline
  }
}

export function registerTypingHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId;
  const username = socket.data.username;

  // ─── Start Typing ─────────────────────────────────
  socket.on('typing:start', (channelId: string) => {
    if (!channelId) return;

    const timerKey = `${userId}:${channelId}`;

    // Broadcast typing to channel (excluding sender)
    socket.to(`channel:${channelId}`).emit('typing:update', {
      userId,
      username,
      channelId,
      isTyping: true,
    });

    // Store in Redis for persistence across reconnects
    safeRedisHSet(RedisKeys.typing(channelId), userId, username);

    // Clear existing timer and set new auto-stop
    const existingTimer = typingTimers.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);

    typingTimers.set(
      timerKey,
      setTimeout(() => {
        // Auto-stop typing after timeout
        socket.to(`channel:${channelId}`).emit('typing:update', {
          userId,
          username,
          channelId,
          isTyping: false,
        });
        safeRedisHDel(RedisKeys.typing(channelId), userId);
        typingTimers.delete(timerKey);
      }, TYPING_TIMEOUT)
    );
  });

  // ─── Stop Typing ──────────────────────────────────
  socket.on('typing:stop', (channelId: string) => {
    if (!channelId) return;

    const timerKey = `${userId}:${channelId}`;

    // Clear auto-stop timer
    const existingTimer = typingTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      typingTimers.delete(timerKey);
    }

    // Broadcast stop typing
    socket.to(`channel:${channelId}`).emit('typing:update', {
      userId,
      username,
      channelId,
      isTyping: false,
    });

    safeRedisHDel(RedisKeys.typing(channelId), userId);
  });

  // ─── Get who's typing in a channel ────────────────
  socket.on('typing:get', async (channelId: string, callback?: Function) => {
    try {
      if (redis.status === 'ready') {
        const typingUsers = await redis.hgetall(RedisKeys.typing(channelId));
        callback?.({
          success: true,
          data: Object.entries(typingUsers).map(([id, name]) => ({ userId: id, username: name })),
        });
        return;
      }
      callback?.({ success: true, data: [] });
    } catch {
      callback?.({ error: 'Failed to get typing status' });
    }
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    // Clear all typing timers for this user
    typingTimers.forEach((timer, key) => {
      if (key.startsWith(`${userId}:`)) {
        clearTimeout(timer);
        typingTimers.delete(key);
        const channelId = key.split(':')[1];
        safeRedisHDel(RedisKeys.typing(channelId), userId);
      }
    });
  });
}
