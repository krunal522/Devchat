import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from '../config/env.js';
import { redisPub, redisSub } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { authenticateSocket } from './authMiddleware.js';
import { registerChatHandlers } from './chatHandler.js';
import { registerChannelHandlers } from './channelHandler.js';
import { registerPresenceHandlers } from './presenceHandler.js';
import { registerTypingHandlers } from './typingHandler.js';
import * as presenceService from '../modules/presence/presence.service.js';

let io: Server;

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (_origin, callback) => callback(null, true),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 5000,
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
  });

  // Redis adapter for horizontal scaling (or fallback to memory adapter if offline)
  try {
    if (redisPub.status === 'ready' && redisSub.status === 'ready') {
      io.adapter(createAdapter(redisPub, redisSub));
      logger.info('✅ Socket.io initialized with Redis adapter');
    } else {
      logger.info('⚡ Socket.io running in memory mode (Redis offline)');
    }
  } catch (err) {
    logger.warn('Socket.io using default in-memory adapter');
  }

  // Authentication middleware
  io.use(authenticateSocket);

  // Connection handler
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    const username = socket.data.username;

    logger.info(`🔌 User connected: ${username} (${userId}) [${socket.id}]`);

    // ⚡ CRITICAL: Join personal room & register handlers FIRST — synchronously, zero delay
    // user:${userId} room must exist BEFORE any message can be delivered to this user
    socket.join(`user:${userId}`);

    // Register all event handlers immediately
    registerChatHandlers(io, socket);
    registerChannelHandlers(io, socket);
    registerPresenceHandlers(io, socket);
    registerTypingHandlers(io, socket);

    // ── Background work: DB updates & broadcasts (non-blocking) ──────────────
    // These are slow (Neon cloud DB ~1-2s) so run AFTER socket is fully ready
    presenceService.setOnline(userId, socket.id).then(() => {
      // Broadcast online status only after DB confirms online
      io.emit('user:online', { userId, username });
    }).catch(() => {
      // Broadcast even if DB update fails
      io.emit('user:online', { userId, username });
    });

    // Send current online users to the newly connected client (background)
    presenceService.getOnlineUsers().then((onlineUsers) => {
      socket.emit('presence:online_users', onlineUsers);
    }).catch(() => {});

    // Disconnect handler
    socket.on('disconnect', async (reason) => {
      logger.info(`🔌 User disconnected: ${username} (${reason}) [${socket.id}]`);

      const wentOffline = await presenceService.removeSocket(userId, socket.id);

      if (wentOffline) {
        // Broadcast offline status to all connected users
        io.emit('user:offline', {
          userId,
          username,
          lastSeen: new Date().toISOString(),
        });
      }
    });
  });

  return io;
}
