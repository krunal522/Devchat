import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/database.js';

export function registerChannelHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId;
  const username = socket.data.username;

  // ─── Join Channel Room ─────────────────────────────
  socket.on('channel:join', async (channelId: string, callback?: Function) => {
    try {
      if (!channelId) return;

      // Join the Socket.io room for this channel
      socket.join(`channel:${channelId}`);

      logger.debug(`User ${username} (${userId}) joined socket channel room: ${channelId}`);
      callback?.({ success: true });
    } catch (error: any) {
      logger.error(`Error joining channel room: ${error.message}`);
      callback?.({ error: error.message || 'Failed to join channel room' });
    }
  });

  // ─── Leave Channel Room ────────────────────────────
  socket.on('channel:leave', async (channelId: string, callback?: Function) => {
    try {
      socket.leave(`channel:${channelId}`);

      logger.debug(`User ${username} left channel room ${channelId}`);
      callback?.({ success: true });
    } catch (error: any) {
      logger.error(`Error leaving channel: ${error.message}`);
      callback?.({ error: error.message || 'Failed to leave channel' });
    }
  });

  // ─── Join All User's Channels ─────────────────────
  socket.on('channel:join_all', async (callback?: Function) => {
    try {
      // Join ALL channels including DMs (type: DIRECT)
      const memberships = await prisma.channelMember.findMany({
        where: { userId },
        select: { channelId: true },
      });

      const channelIds = memberships.map((m) => m.channelId);
      channelIds.forEach((id) => socket.join(`channel:${id}`));

      // Always join personal user room for direct notifications
      socket.join(`user:${userId}`);

      logger.debug(`User ${username} joined ${channelIds.length} channel rooms (incl. DMs)`);
      callback?.({ success: true, channelIds });
    } catch (error: any) {
      logger.error(`Error joining all channels: ${error.message}`);
      callback?.({ error: error.message || 'Failed to join channels' });
    }
  });

  // ─── Broadcast channel created ────────────────────
  socket.on('channel:created', (channel: any) => {
    // Broadcast to all connected users so they see the new channel
    io.emit('channel:new', channel);
  });

  // ─── Broadcast member joined channel ──────────────
  socket.on('channel:member_joined', (data: { channelId: string; userId: string; username: string }) => {
    io.to(`channel:${data.channelId}`).emit('channel:member_joined', {
      channelId: data.channelId,
      userId: data.userId,
      username: data.username,
    });
  });
  // ─── DM Room Auto-Join (emitted by server) ────────────
  // When backend creates a DM channel, it tells both users to join that room
  socket.on('dm:join_room', (data: { channelId: string }) => {
    if (data?.channelId) {
      socket.join(`channel:${data.channelId}`);
      logger.debug(`User ${username} auto-joined DM room: channel:${data.channelId}`);
    }
  });
}
