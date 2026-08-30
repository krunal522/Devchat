import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 10000, // 10,000 requests per 15 minutes for real-time web app
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      statusCode: 429,
    },
  },
});

/**
 * Stricter rate limiter for auth endpoints (prevents brute force)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 authentication requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts, please try again later',
      statusCode: 429,
    },
  },
});
