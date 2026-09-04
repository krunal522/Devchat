import { createServer } from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { initializeSocket } from './sockets/index.js';
import { logger } from './utils/logger.js';

const httpServer = createServer(app);

// Initialize Socket.io
initializeSocket(httpServer);

// ─── Start Server ───────────────────────────────────────

async function start(): Promise<void> {
  try {
    // Start HTTP server first
    httpServer.listen(env.PORT, () => {
      logger.info(`
╔════════════════════════════════════════════════╗
║                                                ║
║   🚀 DevChat Server Running                   ║
║                                                ║
║   REST API:    http://localhost:${env.PORT}         ║
║   WebSocket:   ws://localhost:${env.PORT}           ║
║   Environment: ${env.NODE_ENV.padEnd(27)}║
║                                                ║
╚════════════════════════════════════════════════╝
      `);
    });

    // Connect database and seed AI bot user
    connectDatabase()
      .then(async () => {
        // Reset stale isOnline flags from previous server session (handles Render restarts)
        try {
          const { prisma } = await import('./config/database.js');
          await prisma.user.updateMany({
            where: { isOnline: true },
            data: { isOnline: false },
          });
          logger.info('✅ Cleared stale online presence flags');

          // ⚡ NEON DB KEEPALIVE: Ping every 25s to prevent serverless cold starts
          // Without this, first message after idle period takes 2-5 seconds (Neon compute wakeup)
          setInterval(() => {
            prisma.$queryRaw`SELECT 1`.catch(() => {
              // Silent — Neon is temporarily unreachable, will reconnect automatically
            });
          }, 25000);
          logger.info('✅ DB keepalive started (prevents Neon cold starts)');

          // ⚡ RENDER SELF-PING KEEPALIVE: Ping /health every 4 minutes to prevent Render free-tier sleep
          const renderUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT}`;
          setInterval(() => {
            fetch(`${renderUrl}/health`).catch(() => {});
          }, 4 * 60 * 1000);
          logger.info('✅ Render keepalive self-ping worker started (prevents Render sleep mode)');
        } catch (err) {
          logger.warn('Could not reset isOnline flags:', err);
        }

        const { getOrCreateAIBotUser } = await import('./modules/ai/ai.service.js');
        await getOrCreateAIBotUser();
      })
      .catch((err) => {
        logger.warn('Database connection error:', err);
      });
  } catch (error) {
    logger.error('Failed to start server:', error);
  }
}

// ─── Graceful Shutdown ──────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  httpServer.close(async () => {
    logger.info('HTTP server closed');

    // Disconnect services
    await Promise.all([
      disconnectDatabase(),
      disconnectRedis(),
    ]);

    logger.info('All connections closed. Goodbye! 👋');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled errors
process.on('unhandledRejection', (reason: Error) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

start();
