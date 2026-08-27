import type { Request, Response, NextFunction } from 'express';
import * as workspaceService from './workspace.service.js';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  joinWorkspaceSchema,
  inviteMemberSchema,
  updateWorkspaceRoleSchema,
} from './workspace.schema.js';

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
}

export async function getUserWorkspaces(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaces = await workspaceService.getUserWorkspaces(req.user!.userId);
    res.json({ success: true, data: workspaces });
  } catch (error) {
    next(error);
  }
}

export async function createWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createWorkspaceSchema.parse(req.body);
    const workspace = await workspaceService.createWorkspace(req.user!.userId, input);
    res.status(201).json({ success: true, data: workspace });
  } catch (error) {
    next(error);
  }
}

export async function getWorkspaceByIdOrSlug(req: Request, res: Response, next: NextFunction) {
  try {
    const id = getParam(req, 'id');
    const workspace = await workspaceService.getWorkspaceByIdOrSlug(req.user!.userId, id);
    res.json({ success: true, data: workspace });
  } catch (error) {
    next(error);
  }
}

export async function updateWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const id = getParam(req, 'id');
    const input = updateWorkspaceSchema.parse(req.body);
    const updated = await workspaceService.updateWorkspace(req.user!.userId, id, input);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

export async function deleteWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const id = getParam(req, 'id');
    await workspaceService.deleteWorkspace(req.user!.userId, id);
    res.json({ success: true, message: 'Workspace deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function leaveWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const id = getParam(req, 'id');
    await workspaceService.leaveWorkspace(req.user!.userId, id);
    res.json({ success: true, message: 'Left workspace successfully' });
  } catch (error) {
    next(error);
  }
}

export async function joinWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const input = joinWorkspaceSchema.parse(req.body);
    const workspace = await workspaceService.joinWorkspaceByInviteCode(req.user!.userId, input);
    res.json({ success: true, data: workspace });
  } catch (error) {
    next(error);
  }
}

export async function getWorkspaceMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const id = getParam(req, 'id');
    const search = req.query.search as string | undefined;
    const members = await workspaceService.getWorkspaceMembers(req.user!.userId, id, search);
    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = getParam(req, 'id');
    const targetUserId = getParam(req, 'memberId');
    const input = updateWorkspaceRoleSchema.parse(req.body);
    const members = await workspaceService.updateMemberRole(req.user!.userId, workspaceId, targetUserId, input);
    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = getParam(req, 'id');
    const targetUserId = getParam(req, 'memberId');
    await workspaceService.removeMember(req.user!.userId, workspaceId, targetUserId);
    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    next(error);
  }
}

export async function createInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = getParam(req, 'id');
    const input = inviteMemberSchema.parse(req.body);
    const invitation = await workspaceService.createInvitation(req.user!.userId, workspaceId, input);
    res.status(201).json({ success: true, data: invitation });
  } catch (error) {
    next(error);
  }
}

export async function getPendingInvitations(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = getParam(req, 'id');
    const invitations = await workspaceService.getPendingInvitations(req.user!.userId, workspaceId);
    res.json({ success: true, data: invitations });
  } catch (error) {
    next(error);
  }
}

export async function cancelInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = getParam(req, 'id');
    const invitationId = getParam(req, 'invitationId');
    await workspaceService.cancelInvitation(req.user!.userId, workspaceId, invitationId);
    res.json({ success: true, message: 'Invitation cancelled successfully' });
  } catch (error) {
    next(error);
  }
}

export async function getInvitationByToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getParam(req, 'token');
    const invitation = await workspaceService.getInvitationByToken(token);
    res.json({ success: true, data: invitation });
  } catch (error) {
    next(error);
  }
}

export async function acceptInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getParam(req, 'token');
    const workspace = await workspaceService.acceptInvitation(req.user!.userId, token);
    res.json({ success: true, data: workspace });
  } catch (error) {
    next(error);
  }
}

export async function rejectInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getParam(req, 'token');
    await workspaceService.rejectInvitation(token);
    res.json({ success: true, message: 'Invitation rejected successfully' });
  } catch (error) {
    next(error);
  }
}

export async function exportWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const id = getParam(req, 'id');
    const data = await workspaceService.exportWorkspaceData(req.user!.userId, id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="devchat_backup_${data.workspace.slug}_${Date.now()}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    next(error);
  }
}
