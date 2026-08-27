import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().min(2, 'Workspace name must be at least 2 characters').max(50),
  logoUrl: z.string().optional().nullable(),
  description: z.string().max(250).optional().nullable(),
  settingsJson: z.string().optional().nullable(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(2, 'Workspace name must be at least 2 characters').max(50).optional(),
  logoUrl: z.string().optional().nullable(),
  description: z.string().max(250).optional().nullable(),
  settingsJson: z.string().optional().nullable(),
});

export const joinWorkspaceSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required'),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

export const updateWorkspaceRoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type JoinWorkspaceInput = z.infer<typeof joinWorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateWorkspaceRoleInput = z.infer<typeof updateWorkspaceRoleSchema>;
