import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { upload } from '../../middleware/upload.js';
import * as uploadController from './upload.controller.js';

const router = Router();

router.post('/', authenticate, upload.single('file'), uploadController.uploadFile);

export default router;
