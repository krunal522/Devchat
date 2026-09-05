import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [{ emit: 'stdout', level: 'error' }],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    // Reset all users' stale online status on server boot
    await prisma.user.updateMany({
      data: { isOnline: false },
    });

    // Ensure persistent channel read states table exists
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS channel_read_states (
          user_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, channel_id)
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_channel_read_states_user ON channel_read_states(user_id);
      `);
    } catch (tblErr) {
      logger.warn('channel_read_states init note:', tblErr);
    }

    logger.info('✅ Database connected & presence state reset');
  } catch (error: any) {
    logger.warn('⚠️ Database connection failed');
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('PostgreSQL disconnected');
}
