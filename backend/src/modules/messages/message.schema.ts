import { z } from 'zod';

export const attachmentInputSchema = z.object({
  fileName: z.string(),
  fileUrl: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
});

export const sendMessageSchema = z.object({
  content: z.string().max(4000, 'Message must be at most 4000 characters').default(''),
  parentId: z.string().uuid().optional(),
  attachments: z.array(attachmentInputSchema).optional(),
});

export const updateMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message must be at most 4000 characters')
    .transform((v) => v.trim()),
});

export const messageQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type MessageQuery = z.infer<typeof messageQuerySchema>;
