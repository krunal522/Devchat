import { z } from 'zod';

export const createChannelSchema = z.object({
  name: z
    .string()
    .transform((v) => v.replace(/^#\s*/, '').trim())
    .pipe(
      z
        .string()
        .min(2, 'Channel name must be at least 2 characters')
        .max(80, 'Channel name must be at most 80 characters')
        .regex(/^[a-zA-Z0-9\s_-]+$/, 'Channel name can only contain letters, numbers, spaces, underscores, and hyphens')
    ),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  type: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
});

export const updateChannelSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
});

export const channelIdParamSchema = z.object({
  channelId: z.string().uuid('Invalid channel ID'),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
