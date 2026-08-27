import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { AuthPayload } from '../middleware/auth.js';

/**
 * Socket.io authentication middleware
 * Verifies JWT token passed during handshake
 */
export function authenticateSocket(socket: Socket, next: (err?: Error) => void): void {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      logger.warn(`Socket auth failed: No token provided [${socket.id}]`);
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;

    // Attach user data to socket for use in handlers
    socket.data.userId = decoded.userId;
    socket.data.email = decoded.email;
    socket.data.username = decoded.username;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn(`Socket auth failed: Token expired [${socket.id}]`);
      return next(new Error('Token expired'));
    }

    logger.warn(`Socket auth failed: Invalid token [${socket.id}]`);
    next(new Error('Invalid authentication token'));
  }
}
