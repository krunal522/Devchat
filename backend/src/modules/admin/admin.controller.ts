import { Request, Response } from 'express';
import * as adminService from './admin.service.js';

export async function getStatsHandler(req: Request, res: Response) {
  try {
    const stats = await adminService.getWorkspaceStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to fetch admin stats' },
    });
  }
}

export async function getAuditLogsHandler(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await adminService.getAuditLogs(page, limit);
    res.json({
      success: true,
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to fetch audit logs' },
    });
  }
}
