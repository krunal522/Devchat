/**
 * ringtoneService.ts
 * Synthesizes a realistic telephone ringtone using Web Audio API
 */
class RingtoneService {
  private audioCtx: AudioContext | null = null;
  private isRinging: boolean = false;
  private intervalTimer: any = null;

  public startRinging() {
    if (this.isRinging) return;
    this.isRinging = true;

    const playPulse = () => {
      if (!this.isRinging) return;
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        
        this.audioCtx = new AudioCtx();
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        // Standard US/UK North American Dual-Tone Ringing (440Hz + 480Hz)
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        osc2.frequency.setValueAtTime(480, this.audioCtx.currentTime);

        // Volume Envelope
        gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 1.8);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(this.audioCtx.currentTime + 1.8);
        osc2.stop(this.audioCtx.currentTime + 1.8);
      } catch (err) {
        console.warn('Ringtone AudioContext error:', err);
      }
    };

    playPulse();
    this.intervalTimer = setInterval(playPulse, 2800);
  }

  public stopRinging() {
    this.isRinging = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}

export const ringtoneService = new RingtoneService();
