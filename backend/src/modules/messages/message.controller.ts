import { Request, Response, NextFunction } from 'express';
import * as messageService from './message.service.js';

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const message = await messageService.sendMessage(
      req.user!.userId,
      req.params.channelId as string,
      req.body
    );
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
}

export async function getMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await messageService.getMessages(
      req.params.channelId as string,
      req.user!.userId,
      cursor,
      Math.min(limit, 100)
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getThreadMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await messageService.getThreadMessages(
      req.params.messageId as string,
      req.user!.userId
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const message = await messageService.updateMessage(
      req.user!.userId,
      req.params.messageId as string,
      req.body
    );
    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await messageService.deleteMessage(
      req.user!.userId,
      req.params.messageId as string
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function toggleReaction(req: Request, res: Response, next: NextFunction) {
  try {
    const { emoji } = req.body;
    const message = await messageService.toggleReaction(
      req.user!.userId,
      req.params.messageId as string,
      emoji
    );
    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
}

export async function searchMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const query = (req.query.q as string) || '';
    const results = await messageService.searchMessages(req.user!.userId, query);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
}
