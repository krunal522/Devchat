import React, { useEffect } from 'react';
import { useCallStore } from '../../stores/callStore';
import { getSocket } from '../../services/socketManager';
import { UserAvatar } from '../user/UserAvatar';
import './IncomingCallModal.css';

export function IncomingCallModal() {
  const callState = useCallStore((s) => s.callState);
  const callType = useCallStore((s) => s.callType);
  const callId = useCallStore((s) => s.callId);
  const peerUser = useCallStore((s) => s.peerUser);
  const endCall = useCallStore((s) => s.endCall);

  if (callState !== 'incoming' || !peerUser || !callId) return null;

  const handleAccept = () => {
    const socket = getSocket();
    socket?.emit('call:accept', {
      callerId: peerUser.id,
      callId,
    });
    useCallStore.getState().setConnected();
  };

  const handleDecline = () => {
    const socket = getSocket();
    socket?.emit('call:reject', {
      callerId: peerUser.id,
      callId,
      reason: 'declined',
    });
    endCall();
  };

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        <div className="incoming-call-avatar-wrapper">
          <UserAvatar
            src={peerUser.avatarUrl}
            displayName={peerUser.name}
            size="lg"
          />
          <div className="incoming-call-pulse" />
        </div>

        <h3 className="incoming-call-name">{peerUser.name}</h3>
        <p className="incoming-call-subtitle">
          Incoming {callType === 'video' ? '📹 Video' : '📞 Voice'} Call...
        </p>

        <div className="incoming-call-actions">
          <button
            type="button"
            className="incoming-call-btn incoming-call-btn--decline"
            onClick={handleDecline}
            title="Decline Call"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              <line x1="23" y1="1" x2="1" y2="23" />
            </svg>
          </button>

          <button
            type="button"
            className="incoming-call-btn incoming-call-btn--accept"
            onClick={handleAccept}
            title="Accept Call"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
