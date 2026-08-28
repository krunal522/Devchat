import { Request, Response, NextFunction } from 'express';
import * as userService from './user.service.js';

export async function getUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await userService.getUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
}

export async function getOnlineUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const userIds = await userService.getOnlineUsers();
    res.json({ success: true, data: userIds });
  } catch (error) {
    next(error);
  }
}

export async function getUserById(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.getUserById(req.params.userId as string);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.updateProfile(req.user!.userId, req.body);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function searchUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const query = (req.query.q as string) || '';
    const users = await userService.searchUsers(query, req.user?.userId);
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
}
