/**
 * @file channelHandler.ts
 * @description Real-time Channel and DM Room Socket Handlers.
 * Handles channel room subscriptions (`channel:join`, `channel:leave`, `channel:join_all`)
 * and wams up memory caches for fast direct message routing.
 * 
 * Key Features:
 * - Room auto-subscription for all channels and DMs the user is a member of.
 * - In-memory channel member cache warm up (`cacheAddMember`).
 * - Global room broadcast for newly created channels (`channel:new`).
 * 
 * @module Sockets/ChannelHandler
 */

import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/database.js';
import { cacheSetMembers, cacheAddMember } from './channelMemberCache.js';

export function registerChannelHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId;
  const username = socket.data.username;

  // ─── Join Channel Room ─────────────────────────────
  socket.on('channel:join', async (channelId: string, callback?: Function) => {
    try {
      if (!channelId) return;

      // Join the Socket.io room for this channel
      socket.join(`channel:${channelId}`);
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
      callback?.({ success: true });
    } catch (error: any) {
      logger.error(`Error leaving channel: ${error.message}`);
      callback?.({ error: error.message || 'Failed to leave channel' });
    }
  });

  // ─── Join All User's Channels ─────────────────────
  socket.on('channel:join_all', async (callback?: Function) => {
    try {
      // Join ALL channels including DMs (type: DIRECT) AND all workspace public channels
      const [memberships, publicChannels] = await Promise.all([
        prisma.channelMember.findMany({
          where: { userId },
          select: { channelId: true },
        }),
        prisma.channel.findMany({
          where: { type: 'PUBLIC' },
          select: { id: true },
        }),
      ]);

      const allChannelIds = Array.from(
        new Set([
          ...memberships.map((m) => m.channelId),
          ...publicChannels.map((c) => c.id),
        ])
      );

      allChannelIds.forEach((id) => {
        socket.join(`channel:${id}`);
        // ⚡ Warm up member cache: record this user as member of each channel
        cacheAddMember(id, userId);
      });

      // Always join personal user room for direct notifications
      socket.join(`user:${userId}`);
      callback?.({ success: true, channelIds: allChannelIds });
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
    }
  });
}
