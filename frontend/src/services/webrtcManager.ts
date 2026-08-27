import { useCallStore } from '../stores/callStore';
import { getSocket } from './socketManager';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private screenStream: MediaStream | null = null;

  public async startCall(peerUserId: string, isVideo: boolean, callId: string) {
    try {
      // 1. Get user local audio/video media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      useCallStore.getState().setLocalStream(stream);

      // 2. Create peer connection
      this.createPeerConnection(peerUserId, callId);

      // 3. Add local tracks to peer connection
      stream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, stream);
      });

      // 4. Create WebRTC Offer
      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);

      // 5. Emit offer to peer
      const socket = getSocket();
      socket?.emit('call:webrtc_offer', {
        targetUserId: peerUserId,
        offer,
        callId,
      });
    } catch (error) {
      console.error('Error starting WebRTC call:', error);
      useCallStore.getState().endCall();
    }
  }

  public async handleIncomingOffer(peerUserId: string, offer: RTCSessionDescriptionInit, callId: string) {
    try {
      const isVideo = useCallStore.getState().callType === 'video';

      // 1. Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      useCallStore.getState().setLocalStream(stream);

      // 2. Create peer connection
      this.createPeerConnection(peerUserId, callId);

      // 3. Add local tracks
      stream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, stream);
      });

      // 4. Set remote description (Offer)
      await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));

      // 5. Create Answer
      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);

      // 6. Send Answer back to caller
      const socket = getSocket();
      socket?.emit('call:webrtc_answer', {
        targetUserId: peerUserId,
        answer,
        callId,
      });

      useCallStore.getState().setConnected();
    } catch (error) {
      console.error('Error handling incoming WebRTC offer:', error);
      useCallStore.getState().endCall();
    }
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit) {
    try {
      if (this.peerConnection && this.peerConnection.signalingState !== 'stable') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        useCallStore.getState().setConnected();
      }
    } catch (error) {
      console.error('Error setting remote answer:', error);
    }
  }

  public async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.peerConnection) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  public async toggleScreenShare(peerUserId: string): Promise<boolean> {
    const isSharing = useCallStore.getState().isScreenSharing;

    if (isSharing) {
      // Stop screen sharing and revert back to camera video
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((t) => t.stop());
        this.screenStream = null;
      }

      const cameraStream = useCallStore.getState().localStream;
      if (cameraStream && this.peerConnection) {
        const videoTrack = cameraStream.getVideoTracks()[0];
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender && videoTrack) {
          await videoSender.replaceTrack(videoTrack);
        }
      }

      useCallStore.getState().setScreenSharing(false);
      return false;
    } else {
      try {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        this.screenStream = screenStream;

        const screenTrack = screenStream.getVideoTracks()[0];
        if (this.peerConnection) {
          const senders = this.peerConnection.getSenders();
          const videoSender = senders.find((s) => s.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(screenTrack);
          } else {
            this.peerConnection.addTrack(screenTrack, screenStream);
          }
        }

        // When user stops screen share via browser floating bar
        screenTrack.onended = () => {
          this.toggleScreenShare(peerUserId);
        };

        useCallStore.getState().setScreenSharing(true);
        return true;
      } catch (err) {
        console.error('Failed to start screen share:', err);
        return false;
      }
    }
  }

  public closeConnection() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  private createPeerConnection(peerUserId: string, callId: string) {
    this.closeConnection();

    this.peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // 1. ICE Candidate Handler
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket();
        socket?.emit('call:webrtc_ice_candidate', {
          targetUserId: peerUserId,
          candidate: event.candidate,
          callId,
        });
      }
    };

    // 2. Incoming Track Handler
    const remoteStream = new MediaStream();
    this.peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
      useCallStore.getState().setRemoteStream(remoteStream);
    };

    // 3. Connection State Logger
    this.peerConnection.onconnectionstatechange = () => {
      if (
        this.peerConnection?.connectionState === 'disconnected' ||
        this.peerConnection?.connectionState === 'failed' ||
        this.peerConnection?.connectionState === 'closed'
      ) {
        useCallStore.getState().endCall();
      }
    };
  }
}

export const webrtcManager = new WebRTCManager();
