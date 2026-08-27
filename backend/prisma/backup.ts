import fs from 'fs';
import path from 'path';

const prismaDir = path.resolve('prisma');
const dbPath = path.join(prismaDir, 'dev.db');
const backupsDir = path.resolve('backups');

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  console.error('❌ dev.db file not found in backend/prisma/');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFileName = `devchat_backup_${timestamp}.db`;
const backupFilePath = path.join(backupsDir, backupFileName);

fs.copyFileSync(dbPath, backupFilePath);
console.log(`✅ Backup successfully created at: ${backupFilePath}`);
