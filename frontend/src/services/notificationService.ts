/**
 * notificationService.ts
 *
 * Enterprise Web Push Notification & Audio Chime service.
 */

class NotificationService {
  private hasPermission: boolean = false;

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

  public playNotificationChime() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note (sweet chime)
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
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
