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
