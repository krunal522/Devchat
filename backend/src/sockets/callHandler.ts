import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';

export interface CallInitiatePayload {
  callId: string;
  targetUserId: string;
  channelId?: string;
  isVideo: boolean;
  caller: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export function registerCallHandlers(io: Server, socket: Socket) {
  const currentUserId = (socket as any).user?.userId;

  // 1. Caller initiates a call to target user
  socket.on('call:initiate', (payload: CallInitiatePayload) => {
    const { targetUserId, callId, isVideo, caller, channelId } = payload;
    if (!targetUserId) return;

    logger.info(`Call initiated by ${currentUserId} to ${targetUserId} (video: ${isVideo})`);

    // Emit to target user's personal room
    io.to(`user:${targetUserId}`).emit('call:incoming', {
      callId,
      channelId,
      isVideo,
      caller: caller || {
        id: currentUserId,
        username: (socket as any).user?.username || 'User',
        displayName: (socket as any).user?.displayName || 'User',
      },
    });
  });

  // 2. Target user accepts the call
  socket.on('call:accept', (payload: { callerId: string; callId: string }) => {
    const { callerId, callId } = payload;
    logger.info(`Call ${callId} accepted by ${currentUserId}`);
    io.to(`user:${callerId}`).emit('call:accepted', { callId, acceptorId: currentUserId });
  });

  // 3. Target user rejects/declines the call
  socket.on('call:reject', (payload: { callerId: string; callId: string; reason?: string }) => {
    const { callerId, callId, reason } = payload;
    logger.info(`Call ${callId} rejected by ${currentUserId}`);
    io.to(`user:${callerId}`).emit('call:rejected', { callId, reason: reason || 'declined' });
  });

  // 4. Caller cancels before answer
  socket.on('call:cancel', (payload: { targetUserId: string; callId: string }) => {
    const { targetUserId, callId } = payload;
    logger.info(`Call ${callId} cancelled by caller ${currentUserId}`);
    io.to(`user:${targetUserId}`).emit('call:cancelled', { callId });
  });

  // 5. WebRTC SDP Offer
  socket.on('call:webrtc_offer', (payload: { targetUserId: string; offer: any; callId: string }) => {
    const { targetUserId, offer, callId } = payload;
    io.to(`user:${targetUserId}`).emit('call:webrtc_offer', {
      senderId: currentUserId,
      offer,
      callId,
    });
  });

  // 6. WebRTC SDP Answer
  socket.on('call:webrtc_answer', (payload: { targetUserId: string; answer: any; callId: string }) => {
    const { targetUserId, answer, callId } = payload;
    io.to(`user:${targetUserId}`).emit('call:webrtc_answer', {
      senderId: currentUserId,
      answer,
      callId,
    });
  });

  // 7. WebRTC ICE Candidate Exchange
  socket.on('call:webrtc_ice_candidate', (payload: { targetUserId: string; candidate: any; callId: string }) => {
    const { targetUserId, candidate, callId } = payload;
    io.to(`user:${targetUserId}`).emit('call:webrtc_ice_candidate', {
      senderId: currentUserId,
      candidate,
      callId,
    });
  });

  // 8. End active call
  socket.on('call:end', (payload: { targetUserId: string; callId: string }) => {
    const { targetUserId, callId } = payload;
    logger.info(`Call ${callId} ended by ${currentUserId}`);
    if (targetUserId) {
      io.to(`user:${targetUserId}`).emit('call:ended', { callId, endedBy: currentUserId });
    }
  });
}
