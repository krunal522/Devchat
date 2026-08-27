import { Router } from 'express';
import * as messageController from './message.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendMessageSchema, updateMessageSchema } from './message.schema.js';

const router = Router();

// Channel messages
router.get(
  '/channels/:channelId/messages',
  authenticate,
  messageController.getMessages
);

router.post(
  '/channels/:channelId/messages',
  authenticate,
  validate(sendMessageSchema),
  messageController.sendMessage
);

// Global message search
router.get(
  '/messages/search',
  authenticate,
  messageController.searchMessages
);

// Individual messages
router.get(
  '/messages/:messageId/thread',
  authenticate,
  messageController.getThreadMessages
);

router.put(
  '/messages/:messageId',
  authenticate,
  validate(updateMessageSchema),
  messageController.updateMessage
);

router.delete(
  '/messages/:messageId',
  authenticate,
  messageController.deleteMessage
);

router.post(
  '/messages/:messageId/reactions',
  authenticate,
  messageController.toggleReaction
);

export default router;
