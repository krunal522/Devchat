import { create } from 'zustand';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
export type CallType = 'audio' | 'video';

export interface PeerUser {
  id: string;
  name: string;
  avatarUrl?: string;
  username?: string;
}

interface CallStoreState {
  callState: CallState;
  callType: CallType;
  callId: string | null;
  channelId?: string;
  peerUser: PeerUser | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isMinimized: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;

  // Actions
  initiateCall: (peerUser: PeerUser, isVideo: boolean, channelId?: string) => string;
  receiveCall: (data: { callId: string; caller: PeerUser; isVideo: boolean; channelId?: string }) => void;
  setConnected: () => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  toggleMute: () => void;
  toggleVideoOff: () => void;
  setScreenSharing: (sharing: boolean) => void;
  toggleMinimize: () => void;
  endCall: () => void;
  resetCall: () => void;
}

export const useCallStore = create<CallStoreState>((set, get) => ({
  callState: 'idle',
  callType: 'audio',
  callId: null,
  channelId: undefined,
  peerUser: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  isMinimized: false,
  localStream: null,
  remoteStream: null,

  initiateCall: (peerUser: PeerUser, isVideo: boolean, channelId?: string) => {
    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    set({
      callState: 'calling',
      callType: isVideo ? 'video' : 'audio',
      callId,
      channelId,
      peerUser,
      isMuted: false,
      isVideoOff: !isVideo,
      isScreenSharing: false,
      isMinimized: false,
    });
    return callId;
  },

  receiveCall: (data) => {
    // Only accept incoming call if currently idle
    if (get().callState !== 'idle') return;

    set({
      callState: 'incoming',
      callType: data.isVideo ? 'video' : 'audio',
      callId: data.callId,
      channelId: data.channelId,
      peerUser: data.caller,
      isMuted: false,
      isVideoOff: !data.isVideo,
      isScreenSharing: false,
      isMinimized: false,
    });
  },

  setConnected: () => {
    set({ callState: 'connected' });
  },

  setLocalStream: (stream) => {
    set({ localStream: stream });
  },

  setRemoteStream: (stream) => {
    set({ remoteStream: stream });
  },

  toggleMute: () => {
    const stream = get().localStream;
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((t) => (t.enabled = !t.enabled));
      set((state) => ({ isMuted: !state.isMuted }));
    }
  },

  toggleVideoOff: () => {
    const stream = get().localStream;
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach((t) => (t.enabled = !t.enabled));
      set((state) => ({ isVideoOff: !state.isVideoOff }));
    }
  },

  setScreenSharing: (sharing) => {
    set({ isScreenSharing: sharing });
  },

  toggleMinimize: () => {
    set((state) => ({ isMinimized: !state.isMinimized }));
  },

  endCall: () => {
    const { localStream } = get();
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    set({
      callState: 'ended',
      localStream: null,
      remoteStream: null,
    });

    // Reset back to idle after 1.5 seconds
    setTimeout(() => {
      get().resetCall();
    }, 1500);
  },

  resetCall: () => {
    const { localStream } = get();
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    set({
      callState: 'idle',
      callType: 'audio',
      callId: null,
      channelId: undefined,
      peerUser: null,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
      isMinimized: false,
      localStream: null,
      remoteStream: null,
    });
  },
}));
