import { Router } from 'express';
import * as userController from './user.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { updateProfileSchema } from './user.schema.js';

const router = Router();

router.get('/', authenticate, userController.getUsers);
router.get('/online', authenticate, userController.getOnlineUsers);
router.get('/search', authenticate, userController.searchUsers);
router.get('/:userId', authenticate, userController.getUserById);
router.patch('/me', authenticate, validate(updateProfileSchema), userController.updateProfile);

export default router;
