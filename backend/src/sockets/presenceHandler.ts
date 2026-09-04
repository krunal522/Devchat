/**
 * @file presenceHandler.ts
 * @description Socket.IO Presence Event Handlers.
 * Manages real-time online status lookups, user presence checks, and online counts.
 * 
 * Features:
 * - `presence:get_online`: Fetches list of active user IDs from Redis store.
 * - `presence:check`: Batch check online status for array of user IDs.
 * - `presence:count`: Get current count of active connections.
 * 
 * @module Sockets/PresenceHandler
 */

import { Server, Socket } from 'socket.io';
import * as presenceService from '../modules/presence/presence.service.js';
import { logger } from '../utils/logger.js';

export function registerPresenceHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId;

  // ─── Request Online Users ─────────────────────────
  socket.on('presence:get_online', async (callback?: Function) => {
    try {
      const onlineUsers = await presenceService.getOnlineUsers();
      callback?.({ success: true, data: onlineUsers });
    } catch (error: any) {
      logger.error(`Error getting online users: ${error.message}`);
      callback?.({ error: error.message });
    }
  });

  // ─── Check specific users' status ─────────────────
  socket.on('presence:check', async (userIds: string[], callback?: Function) => {
    try {
      const status = await presenceService.checkOnlineStatus(userIds);
      callback?.({ success: true, data: status });
    } catch (error: any) {
      logger.error(`Error checking presence: ${error.message}`);
      callback?.({ error: error.message });
    }
  });

  // ─── Get online user count ────────────────────────
  socket.on('presence:count', async (callback?: Function) => {
    try {
      const count = await presenceService.getOnlineCount();
      callback?.({ success: true, data: count });
    } catch (error: any) {
      logger.error(`Error getting online count: ${error.message}`);
      callback?.({ error: error.message });
    }
  });
}

