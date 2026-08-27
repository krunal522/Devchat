import { Router } from 'express';
import * as channelController from './channel.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createChannelSchema } from './channel.schema.js';

const router = Router();

// Channel CRUD
router.get('/', authenticate, channelController.getChannels);
router.post('/', authenticate, validate(createChannelSchema), channelController.createChannel);
router.get('/dm', authenticate, channelController.getDMChannels);
router.post('/dm/:userId', authenticate, channelController.getOrCreateDMChannel);
router.get('/:channelId', authenticate, channelController.getChannelById);
router.post('/:channelId/join', authenticate, channelController.joinChannel);
router.post('/:channelId/leave', authenticate, channelController.leaveChannel);
router.get('/:channelId/members', authenticate, channelController.getChannelMembers);
router.post('/:channelId/members', authenticate, channelController.addChannelMembers);
router.delete('/:channelId/members/:userId', authenticate, channelController.removeChannelMember);
router.delete('/:channelId', authenticate, channelController.deleteChannel);

export default router;
