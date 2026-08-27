import { prisma } from '../../config/database.js';
import * as presenceService from '../presence/presence.service.js';

export async function createAuditLog(data: {
  workspaceId?: string;
  userId: string;
  action: string;
  details: string;
  ipAddress?: string;
}) {
  return prisma.auditLog.create({
    data: {
      workspaceId: data.workspaceId,
      userId: data.userId,
      action: data.action,
      details: data.details,
      ipAddress: data.ipAddress,
    },
  });
}

export async function getWorkspaceStats() {
  const [totalUsers, totalChannels, totalMessages, totalAttachments] = await Promise.all([
    prisma.user.count(),
    prisma.channel.count(),
    prisma.message.count(),
    prisma.attachment.findMany({ select: { fileSize: true } }),
  ]);

  const onlineCount = await presenceService.getOnlineCount();
  const totalStorageBytes = totalAttachments.reduce((sum, item) => sum + item.fileSize, 0);
  const totalStorageMB = (totalStorageBytes / (1024 * 1024)).toFixed(2);

  return {
    totalUsers,
    onlineCount,
    totalChannels,
    totalMessages,
    totalFiles: totalAttachments.length,
    totalStorageMB: parseFloat(totalStorageMB),
  };
}

export async function getAuditLogs(page = 1, limit = 50) {
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.auditLog.count(),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
