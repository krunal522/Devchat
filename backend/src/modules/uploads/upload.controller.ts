import type { Request, Response, NextFunction } from 'express';
import { getFileType } from '../../middleware/upload.js';
import { ApiError } from '../../utils/ApiError.js';

export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw ApiError.badRequest('No file provided');
    }

    const file = req.file;
    const fileType = getFileType(file.mimetype, file.originalname);
    const host = req.get('host') || 'localhost:3001';
    const protocol = req.protocol || 'http';
    const fileUrl = `${protocol}://${host}/uploads/${file.filename}`;

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
