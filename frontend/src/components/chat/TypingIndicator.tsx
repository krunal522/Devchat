import { usePresenceStore } from '../../stores/presenceStore';
import { useAuthStore } from '../../stores/authStore';
import './TypingIndicator.css';

// Stable empty array — avoids new reference on every render
const EMPTY_TYPING: never[] = [];

interface TypingIndicatorProps {
  channelId: string;
}

export function TypingIndicator({ channelId }: TypingIndicatorProps) {
  const typingUsers = usePresenceStore((s) => s.typingUsers[channelId] ?? EMPTY_TYPING);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Filter out current user
  const otherTyping = typingUsers.filter((t) => t.userId !== currentUserId);

  if (otherTyping.length === 0) return null;

  let text = '';
  if (otherTyping.length === 1) {
    text = `${otherTyping[0].username} is typing`;
  } else if (otherTyping.length === 2) {
    text = `${otherTyping[0].username} and ${otherTyping[1].username} are typing`;
  } else {
    text = `${otherTyping[0].username} and ${otherTyping.length - 1} others are typing`;
  }

  return (
    <div className="typing-indicator">
      <div className="typing-indicator__dots">
        <span className="typing-indicator__dot" />
        <span className="typing-indicator__dot" />
        <span className="typing-indicator__dot" />
      </div>
      <span className="typing-indicator__text">{text}</span>
    </div>
  );
}
