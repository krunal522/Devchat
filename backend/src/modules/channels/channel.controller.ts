import { Request, Response, NextFunction } from 'express';
import * as channelService from './channel.service.js';
import { getIO } from '../../sockets/index.js';

export async function createChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = (req.headers['x-workspace-id'] as string) || (req.query.workspaceId as string) || undefined;
    const channel = await channelService.createChannel(req.user!.userId, req.body, workspaceId);
    try {
      const io = getIO();
      if (channel.type === 'PUBLIC') {
        io.emit('channel:new', channel);
      } else {
        io.to(`user:${req.user!.userId}`).emit('channel:added', { channelId: channel.id });
      }
    } catch (e) {
      // socket io optionally not initialized in tests
    }
    res.status(201).json({ success: true, data: channel });
  } catch (error) {
    next(error);
  }
}

export async function getChannels(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = (req.headers['x-workspace-id'] as string) || (req.query.workspaceId as string) || undefined;
    const channels = await channelService.getChannels(req.user!.userId, workspaceId);
    res.json({ success: true, data: channels });
  } catch (error) {
    next(error);
  }
}

export async function getChannelById(req: Request, res: Response, next: NextFunction) {
  try {
    const channel = await channelService.getChannelById(req.params.channelId as string, req.user!.userId);
    res.json({ success: true, data: channel });
  } catch (error) {
    next(error);
  }
}

export async function joinChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await channelService.joinChannel(req.user!.userId, req.params.channelId as string);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function leaveChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await channelService.leaveChannel(req.user!.userId, req.params.channelId as string);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getChannelMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const members = await channelService.getChannelMembers(req.params.channelId as string);
    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
}

export async function addChannelMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [req.body.userId];
    const members = await channelService.addChannelMembers(
      req.user!.userId,
      req.params.channelId as string,
      userIds
    );

    try {
      const io = getIO();
      for (const uId of userIds) {
        io.to(`user:${uId}`).emit('channel:added', { channelId: req.params.channelId });
      }
      io.to(`channel:${req.params.channelId}`).emit('channel:member_added', { channelId: req.params.channelId, userIds });
    } catch (e) {
      // Socket io error fallback
    }

    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
}

export async function removeChannelMember(req: Request, res: Response, next: NextFunction) {
  try {
    const members = await channelService.removeChannelMember(
      req.user!.userId,
      req.params.channelId as string,
      req.params.userId as string
    );

    try {
      const io = getIO();
      io.to(`user:${req.params.userId}`).emit('channel:removed', { channelId: req.params.channelId });
      io.to(`channel:${req.params.channelId}`).emit('channel:member_removed', { channelId: req.params.channelId, userId: req.params.userId });
    } catch (e) {
      // Socket io error fallback
    }

    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
}

export async function deleteChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await channelService.deleteChannel(
      req.user!.userId,
      req.params.channelId as string
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getDMChannels(req: Request, res: Response, next: NextFunction) {
  try {
    const channels = await channelService.getDMChannels(req.user!.userId);
    res.json({ success: true, data: channels });
  } catch (error) {
    next(error);
  }
}

export async function getOrCreateDMChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const channel = await channelService.getOrCreateDMChannel(
      req.user!.userId,
      req.params.userId as string
    );
    res.json({ success: true, data: channel });
  } catch (error) {
    next(error);
  }
}
