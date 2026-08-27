import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../utils/ApiError.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow images, documents, code files, zip archives, audio, and video
    cb(null, true);
  },
});

export function getFileType(mimeType: string, filename: string): 'IMAGE' | 'DOCUMENT' | 'CODE' | 'AUDIO' | 'VIDEO' | 'OTHER' {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType.startsWith('video/')) return 'VIDEO';

  const ext = path.extname(filename).toLowerCase();
  const codeExts = ['.js', '.ts', '.tsx', '.jsx', '.py', '.json', '.html', '.css', '.c', '.cpp', '.java', '.go', '.rs', '.sql', '.sh'];
  if (codeExts.includes(ext) || mimeType.includes('json') || mimeType.includes('javascript')) {
    return 'CODE';
  }

  const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'];
  if (docExts.includes(ext) || mimeType.includes('pdf') || mimeType.includes('text/')) {
    return 'DOCUMENT';
  }

  return 'OTHER';
}
