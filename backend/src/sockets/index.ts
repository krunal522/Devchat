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
    pingTimeout: 60000,
    pingInterval: 25000,
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
  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId;
    const username = socket.data.username;

    logger.info(`🔌 User connected: ${username} (${userId}) [${socket.id}]`);

    // Set user online
    await presenceService.setOnline(userId, socket.id);

    // Broadcast online status to all connected users
    io.emit('user:online', {
      userId,
      username,
    });

    // Join user to their personal room (for DMs and notifications)
    socket.join(`user:${userId}`);

    // Register event handlers
    registerChatHandlers(io, socket);
    registerChannelHandlers(io, socket);
    registerPresenceHandlers(io, socket);
    registerTypingHandlers(io, socket);

    // Send current online users to the newly connected client
    const onlineUsers = await presenceService.getOnlineUsers();
    socket.emit('presence:online_users', onlineUsers);

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
