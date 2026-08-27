import React, { useEffect, useRef } from 'react';
import { useCallStore } from '../../stores/callStore';
import { webrtcManager } from '../../services/webrtcManager';
import { getSocket } from '../../services/socketManager';
import { UserAvatar } from '../user/UserAvatar';
import './ActiveCallModal.css';

export function ActiveCallModal() {
  const callState = useCallStore((s) => s.callState);
  const callType = useCallStore((s) => s.callType);
  const callId = useCallStore((s) => s.callId);
  const peerUser = useCallStore((s) => s.peerUser);
  const isMuted = useCallStore((s) => s.isMuted);
  const isVideoOff = useCallStore((s) => s.isVideoOff);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);
  const isMinimized = useCallStore((s) => s.isMinimized);
  const localStream = useCallStore((s) => s.localStream);
  const remoteStream = useCallStore((s) => s.remoteStream);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleVideoOff = useCallStore((s) => s.toggleVideoOff);
  const toggleMinimize = useCallStore((s) => s.toggleMinimize);
  const endCall = useCallStore((s) => s.endCall);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (callState === 'idle' || !peerUser) return null;

  const handleEndCall = () => {
    const socket = getSocket();
    if (callId && peerUser) {
      socket?.emit('call:end', {
        targetUserId: peerUser.id,
        callId,
      });
    }
    webrtcManager.closeConnection();
    endCall();
  };

  const handleScreenShare = async () => {
    if (peerUser) {
      await webrtcManager.toggleScreenShare(peerUser.id);
    }
  };

  return (
    <div className={`active-call-backdrop ${isMinimized ? 'active-call-backdrop--minimized' : ''}`}>
      <div className={`active-call-container ${isMinimized ? 'active-call-container--minimized' : ''}`}>
        
        {/* Header Bar */}
        <div className="active-call-header">
          <div className="active-call-user-info">
            <UserAvatar src={peerUser.avatarUrl} displayName={peerUser.name} size="sm" />
            <div className="active-call-text">
              <span className="active-call-name">{peerUser.name}</span>
              <span className="active-call-status">
                {callState === 'calling' ? 'Calling...' : callState === 'connected' ? '00:42' : 'Call ended'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="active-call-header-btn"
            onClick={toggleMinimize}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '🗖' : '🗗'}
          </button>
        </div>

        {/* Video Area */}
        {!isMinimized && (
          <div className="active-call-video-area">
            {/* Remote Video Stream or Avatar fallback */}
            {callType === 'video' && remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="active-call-remote-video"
              />
            ) : (
              <div className="active-call-avatar-placeholder">
                <UserAvatar src={peerUser.avatarUrl} displayName={peerUser.name} size="lg" />
                <h3>{peerUser.name}</h3>
                <p>{callState === 'calling' ? 'Ringing...' : 'Voice Call Active'}</p>
              </div>
            )}

            {/* Local PIP Video */}
            {callType === 'video' && !isVideoOff && (
              <div className="active-call-pip">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="active-call-pip-video"
                />
              </div>
            )}
          </div>
        )}

        {/* Call Controls Bar */}
        <div className="active-call-controls">
          {/* Mute Mic */}
          <button
            type="button"
            className={`call-control-btn ${isMuted ? 'call-control-btn--active' : ''}`}
            onClick={toggleMute}
            title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
          >
            {isMuted ? '🎙️❌' : '🎙️'}
          </button>

          {/* Camera Toggle */}
          <button
            type="button"
            className={`call-control-btn ${isVideoOff ? 'call-control-btn--active' : ''}`}
            onClick={toggleVideoOff}
            title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
          >
            {isVideoOff ? '📹❌' : '📹'}
          </button>

          {/* Screen Share */}
          <button
            type="button"
            className={`call-control-btn ${isScreenSharing ? 'call-control-btn--sharing' : ''}`}
            onClick={handleScreenShare}
            title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
          >
            🖥️
          </button>

          {/* End Call */}
          <button
            type="button"
            className="call-control-btn call-control-btn--end"
            onClick={handleEndCall}
            title="End Call"
          >
            🔴
          </button>
        </div>

      </div>
    </div>
  );
}
