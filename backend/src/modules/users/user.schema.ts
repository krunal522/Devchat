import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  statusText: z.string().max(200).optional(),
  avatarUrl: z.string().optional(),
});

export const userIdParamSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
