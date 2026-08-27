import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import * as adminController from './admin.controller.js';

const router = Router();

router.use(authenticate);

router.get('/stats', adminController.getStatsHandler);
router.get('/audit-logs', adminController.getAuditLogsHandler);

export default router;
