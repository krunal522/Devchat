import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireWorkspaceAccess, requireWorkspaceRole } from '../../middleware/workspaceAuth.js';
import * as workspaceController from './workspace.controller.js';

const router = Router();

// Public invitation route (requires auth to view token details / accept)
router.get('/invitations/token/:token', authenticate, workspaceController.getInvitationByToken);
router.post('/invitations/token/:token/accept', authenticate, workspaceController.acceptInvitation);
router.post('/invitations/token/:token/reject', authenticate, workspaceController.rejectInvitation);

// Authenticated user workspace routes
router.use(authenticate);

router.get('/', workspaceController.getUserWorkspaces);
router.post('/', workspaceController.createWorkspace);
router.post('/join', workspaceController.joinWorkspace);

// Workspace specific routes with membership access check
router.get('/:id', requireWorkspaceAccess('id'), workspaceController.getWorkspaceByIdOrSlug);
router.get('/:id/export', requireWorkspaceAccess('id'), workspaceController.exportWorkspace);
router.patch('/:id', requireWorkspaceRole(['OWNER', 'ADMIN']), workspaceController.updateWorkspace);
router.delete('/:id', requireWorkspaceRole(['OWNER']), workspaceController.deleteWorkspace);
router.post('/:id/leave', requireWorkspaceAccess('id'), workspaceController.leaveWorkspace);

// Members management
router.get('/:id/members', requireWorkspaceAccess('id'), workspaceController.getWorkspaceMembers);
router.patch('/:id/members/:memberId/role', requireWorkspaceRole(['OWNER', 'ADMIN']), workspaceController.updateMemberRole);
router.delete('/:id/members/:memberId', requireWorkspaceRole(['OWNER', 'ADMIN']), workspaceController.removeMember);

// Invitations management
router.post('/:id/invitations', requireWorkspaceRole(['OWNER', 'ADMIN']), workspaceController.createInvitation);
router.get('/:id/invitations', requireWorkspaceRole(['OWNER', 'ADMIN']), workspaceController.getPendingInvitations);
router.delete('/:id/invitations/:invitationId', requireWorkspaceRole(['OWNER', 'ADMIN']), workspaceController.cancelInvitation);

export default router;
