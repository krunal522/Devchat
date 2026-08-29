import type { Message } from '../types/message';

export interface ChatSession {
  id: string;
  title: string;
  startTime: string;
  messages: Message[];
}

export function groupMessagesIntoSessions(messagesList: Message[]): ChatSession[] {
  if (!messagesList || messagesList.length === 0) return [];

  const sessions: ChatSession[] = [];
  let currentSession: ChatSession | null = null;

  // Process messages in chronological order (oldest to newest)
  const sorted = [...messagesList].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const msg of sorted) {
    const isUser = msg.user?.username !== 'devchat_ai' && msg.user?.id !== 'devchat-ai-bot-id';

    if (isUser) {
      // User prompt starts a new separate chat session!
      const contentText = msg.content || '';
      const sessionTitle = contentText.length > 55 ? `${contentText.slice(0, 55)}...` : contentText;
      currentSession = {
        id: msg.id,
        title: sessionTitle || 'New Conversation',
        startTime: msg.createdAt,
        messages: [msg],
      };
      sessions.push(currentSession);
    } else {
      // AI answer belongs to the current session
      if (currentSession) {
        currentSession.messages.push(msg);
      } else {
        // Fallback for standalone AI message
        currentSession = {
          id: msg.id,
          title: 'DevChat AI Conversation',
          startTime: msg.createdAt,
          messages: [msg],
        };
        sessions.push(currentSession);
      }
    }
  }

  // Return sessions in reverse chronological order (newest sessions first)
  return sessions.reverse();
}
