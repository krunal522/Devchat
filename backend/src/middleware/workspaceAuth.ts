import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';

export interface WorkspaceAuthRequest extends Request {
  workspaceMember?: {
    id: string;
    userId: string;
    workspaceId: string;
    role: string;
    joinedAt: Date;
  };
}

export function requireWorkspaceAccess(paramName: string = 'workspaceId') {
  return async (req: WorkspaceAuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw ApiError.unauthorized('Authentication required');
      }

      const workspaceId = (req.params[paramName] || req.params.id || req.body[paramName]) as string;
      if (!workspaceId) {
        throw ApiError.badRequest('Workspace ID is required');
      }

      const member = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
      });

      if (!member) {
        throw ApiError.forbidden('Access denied. You are not a member of this workspace.');
      }

      req.workspaceMember = member;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireWorkspaceRole(allowedRoles: ('OWNER' | 'ADMIN' | 'MEMBER')[]) {
  return async (req: WorkspaceAuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.workspaceMember) {
        const userId = req.user?.userId;
        const workspaceId = (req.params.workspaceId || req.params.id || req.body.workspaceId) as string;
        if (!userId || !workspaceId) {
          throw ApiError.badRequest('Workspace context missing');
        }

        const member = await prisma.workspaceMember.findUnique({
          where: {
            userId_workspaceId: { userId, workspaceId },
          },
        });

        if (!member) {
          throw ApiError.forbidden('Access denied. You are not a member of this workspace.');
        }

        req.workspaceMember = member;
      }

      const userRole = req.workspaceMember.role;
      if (!allowedRoles.includes(userRole as any)) {
        throw ApiError.forbidden(`Insufficient permissions. Required role: ${allowedRoles.join(' or ')}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
