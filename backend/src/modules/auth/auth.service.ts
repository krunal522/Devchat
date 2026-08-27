import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database.js';
import { safeRedisSet, safeRedisGet, safeRedisDel, RedisKeys } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import type { RegisterInput, LoginInput } from './auth.schema.js';
import type { AuthPayload } from '../../middleware/auth.js';

const BCRYPT_ROUNDS = 12;

// ─── Token Helpers ──────────────────────────────────────

function generateAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as any,
  });
}

function generateRefreshToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as any,
  });
}

function generateTokenPair(payload: AuthPayload) {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

// Parse JWT expiry string to seconds for Redis TTL
function parseExpiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60; // default 7 days
  const [, value, unit] = match;
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(value) * (multipliers[unit] || 1);
}

// ─── Service Methods ────────────────────────────────────

export async function register(input: RegisterInput) {
  const cleanEmail = input.email.toLowerCase().trim();
  const cleanUsername = input.username.toLowerCase().trim().replace(/^@/, '');

  // Check for existing user
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: cleanEmail },
        { username: cleanUsername },
      ],
    },
  });

  if (existingUser) {
    if (existingUser.email.toLowerCase() === cleanEmail) {
      throw ApiError.conflict('Email is already registered');
    }
    throw ApiError.conflict('Username is already taken');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // Create user with normalized values
  const user = await prisma.user.create({
    data: {
      email: cleanEmail,
      username: cleanUsername,
      displayName: input.displayName.trim(),
      passwordHash,
      avatarUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(input.displayName)}&backgroundColor=6c5ce7`,
    },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      statusText: true,
      createdAt: true,
    },
  });

  // Auto-join default workspace & all public channels
  try {
    const defaultWorkspace = await prisma.workspace.findFirst({
      select: { id: true },
    });
    if (defaultWorkspace) {
      await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId: user.id, workspaceId: defaultWorkspace.id } },
        update: {},
        create: { userId: user.id, workspaceId: defaultWorkspace.id, role: 'MEMBER' },
      });
    }

    const publicChannels = await prisma.channel.findMany({
      where: { type: 'PUBLIC' },
      select: { id: true },
    });

    if (publicChannels.length > 0) {
      for (const channel of publicChannels) {
        await prisma.channelMember.upsert({
          where: { userId_channelId: { userId: user.id, channelId: channel.id } },
          update: {},
          create: { userId: user.id, channelId: channel.id },
        });
      }
    }
  } catch (err) {
    logger.warn('Failed to auto-join public channels during registration:', err);
  }

  // Generate tokens
  const payload: AuthPayload = {
    userId: user.id,
    email: user.email,
    username: user.username,
  };
  const tokens = generateTokenPair(payload);

  // Store refresh token in Redis (or bypass gracefully if offline)
  const refreshTTL = parseExpiryToSeconds(env.JWT_REFRESH_EXPIRY);
  await safeRedisSet(
    RedisKeys.refreshToken(user.id),
    tokens.refreshToken,
    'EX',
    refreshTTL
  );

  logger.info(`New user registered: ${user.username} (${user.id})`);

  return { user, ...tokens };
}

export async function login(input: LoginInput) {
  const identifier = input.email.toLowerCase().trim();
  const identifierNoAt = identifier.replace(/^@/, '');

  // Find user by email or username (supports email, username, or @username)
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { username: identifier },
        { username: identifierNoAt },
      ],
    },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      statusText: true,
      passwordHash: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw ApiError.unauthorized('Invalid email/username or password');
  }

  // Verify password
  const isValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Generate tokens
  const payload: AuthPayload = {
    userId: user.id,
    email: user.email,
    username: user.username,
  };
  const tokens = generateTokenPair(payload);

  // Store refresh token in Redis (or bypass gracefully if offline)
  const refreshTTL = parseExpiryToSeconds(env.JWT_REFRESH_EXPIRY);
  await safeRedisSet(
    RedisKeys.refreshToken(user.id),
    tokens.refreshToken,
    'EX',
    refreshTTL
  );

  // Remove passwordHash from response
  const { passwordHash: _, ...userWithoutPassword } = user;

  logger.info(`User logged in: ${user.username} (${user.id})`);

  return { user: userWithoutPassword, ...tokens };
}

export async function refreshToken(token: string) {
  let decoded: AuthPayload;

  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthPayload;
  } catch {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  // Verify token exists in Redis if Redis is connected
  const storedToken = await safeRedisGet(RedisKeys.refreshToken(decoded.userId));
  if (storedToken && storedToken !== token) {
    throw ApiError.unauthorized('Refresh token has been revoked');
  }

  // Verify user still exists
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, username: true },
  });

  if (!user) {
    throw ApiError.unauthorized('User no longer exists');
  }

  // Generate new token pair
  const payload: AuthPayload = {
    userId: user.id,
    email: user.email,
    username: user.username,
  };
  const tokens = generateTokenPair(payload);

  // Replace old refresh token in Redis
  const refreshTTL = parseExpiryToSeconds(env.JWT_REFRESH_EXPIRY);
  await safeRedisSet(
    RedisKeys.refreshToken(user.id),
    tokens.refreshToken,
    'EX',
    refreshTTL
  );

  return tokens;
}

export async function logout(userId: string): Promise<void> {
  await safeRedisDel(RedisKeys.refreshToken(userId));
  logger.info(`User logged out: ${userId}`);
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      statusText: true,
      isOnline: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user;
}
