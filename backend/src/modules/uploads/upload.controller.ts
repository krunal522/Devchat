import type { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { getFileType } from '../../middleware/upload.js';
import { ApiError } from '../../utils/ApiError.js';
import { prisma } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw ApiError.badRequest('No file provided');
    }

    const file = req.file;
    const fileType = getFileType(file.mimetype, file.originalname);
    const host = req.get('host') || 'localhost:3001';
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const fileUrl = `${protocol}://${host}/uploads/${file.filename}`;

    // Resilient DB Persistence: Store binary in PostgreSQL so Render container restarts NEVER delete it
    try {
      const buffer = await fs.promises.readFile(file.path);
      await prisma.fileUpload.upsert({
        where: { filename: file.filename },
        update: {
          mimeType: file.mimetype,
          size: file.size,
          data: new Uint8Array(buffer),
        },
        create: {
          filename: file.filename,
          mimeType: file.mimetype,
          size: file.size,
          data: new Uint8Array(buffer),
        },
      });
      logger.info(`Persisted file ${file.filename} to database (${file.size} bytes)`);
    } catch (dbErr) {
      logger.error('Failed to backup uploaded file to database:', dbErr);
    }

    res.json({
      success: true,
      data: {
        fileName: file.originalname,
        fileUrl,
        fileType,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });
  } catch (error) {
    next(error);
  }
}
