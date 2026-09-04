/**
 * notificationService.ts
 *
 * Enterprise Web Push Notification & Audio Chime service.
 */

export type NotificationSound = 'pop' | 'chime' | 'cheerful';

class NotificationService {
  private hasPermission: boolean = false;
  private soundPreset: NotificationSound = 'pop';

  constructor() {
    if ('Notification' in window) {
      this.hasPermission = Notification.permission === 'granted';
    }
  }

  public async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;

    if (Notification.permission === 'default') {
      const status = await Notification.requestPermission();
      this.hasPermission = status === 'granted';
    } else {
      this.hasPermission = Notification.permission === 'granted';
    }

    return this.hasPermission;
  }

  public setSoundPreset(preset: NotificationSound) {
    this.soundPreset = preset;
  }

  public playNotificationChime(preset?: NotificationSound) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const activePreset = preset || this.soundPreset;

      if (activePreset === 'pop') {
        // Modern Apple/Slack style glass double pop chime (E6 -> G6)
        const now = ctx.currentTime;

        // First Note (E6 ~ 1318 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1318.51, now);
        gain1.gain.setValueAtTime(0.12, now);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.12);

        // Second Note (G6 ~ 1567 Hz)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1567.98, now + 0.06);
        gain2.gain.setValueAtTime(0.15, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.06);
        osc2.stop(now + 0.22);
      } else if (activePreset === 'cheerful') {
        // Discord style 3-note ascending chord (C5 -> G5 -> C6)
        const now = ctx.currentTime;
        const notes = [523.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const startTime = now + idx * 0.07;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.12, startTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.2);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.2);
        });
      } else {
        // Classic soft chime (A5 -> D6)
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (err) {
      console.warn('Audio chime failed:', err);
    }
  }

  public sendDesktopNotification(title: string, body: string, icon?: string) {
    if (!this.hasPermission || document.visibilityState === 'visible') {
      return;
    }

    try {
      const n = new Notification(title, {
        body,
        icon: icon || '/favicon.ico',
        badge: '/favicon.ico',
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (err) {
      console.error('Failed to trigger desktop notification:', err);
    }
  }
}

export const notificationService = new NotificationService();
