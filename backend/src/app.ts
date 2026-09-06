import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { prisma } from './config/database.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Route imports
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import workspaceRoutes from './modules/workspaces/workspace.routes.js';
import channelRoutes from './modules/channels/channel.routes.js';
import messageRoutes from './modules/messages/message.routes.js';
import uploadRoutes from './modules/uploads/upload.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

const app = express();

// Trust reverse proxy (Render, Cloudflare, Vercel)
app.set('trust proxy', 1);

// Root route for Render health checks
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'DevChat API Server is live and healthy',
    timestamp: new Date().toISOString(),
  });
});

// ─── Security Middleware ────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS ───────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id', 'x-workspace-id'],
}));

// ─── Body Parsing ───────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ─── Static File Uploads Serving & Resilient DB Fallback ────────
const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Fallback: If file is missing from local disk (e.g. Render/Railway container restarted/redeployed)
app.get('/uploads/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const fileRecord = await prisma.fileUpload.findUnique({
      where: { filename },
    });

    if (!fileRecord) {
      return res.status(404).send('File not found');
    }

    // Re-hydrate local disk cache so subsequent requests are served instantly by express.static
    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadsDir, filename), fileRecord.data);
    } catch {
      // Ignore disk write errors if container disk is constrained
    }

    res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', fileRecord.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.end(fileRecord.data);
  } catch (error) {
    logger.error('Error fetching file from database fallback:', error);
    return res.status(404).send('File not found');
  }
});

// ─── Compression ────────────────────────────────────────
app.use(compression());

// ─── Rate Limiting ──────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Health Check ───────────────────────────────────────
app.get(['/health', '/api/health'], (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
    },
  });
});

// ─── API Routes ─────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', messageRoutes);

// ─── Error Handling ─────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
