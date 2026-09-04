/**
 * @file formatPresence.ts
 * @description Formats presence online/offline status text and relative timestamps.
 */

export function formatLastSeenText(isOnline: boolean, lastSeenAt?: string | Date): string {
  if (isOnline) return '🟢 Active now';
  if (!lastSeenAt) return 'Offline';

  const date = new Date(lastSeenAt);
  if (isNaN(date.getTime())) return 'Offline';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Last seen just now';
  if (diffMins < 60) return `Last seen ${diffMins}m ago`;

  const todayStr = now.toDateString();
  const dateDateStr = date.toDateString();
  if (todayStr === dateDateStr) {
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Last seen today at ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === dateDateStr) {
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Last seen yesterday at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Last seen ${dateStr} at ${timeStr}`;
}
