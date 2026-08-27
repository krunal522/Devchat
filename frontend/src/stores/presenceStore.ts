import { create } from 'zustand';

interface TypingUser {
  userId: string;
  username: string;
}

interface PresenceState {
  onlineUsers: Set<string>;
  typingUsers: Record<string, TypingUser[]>;

  setOnlineUsers: (userIds: string[]) => void;
  addOnlineUser: (userId: string) => void;
  removeOnlineUser: (userId: string) => void;

  setTyping: (channelId: string, userId: string, username: string, isTyping: boolean) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineUsers: new Set<string>(),
  typingUsers: {},

  setOnlineUsers: (userIds) => {
    set({ onlineUsers: new Set(userIds) });
  },

  addOnlineUser: (userId) => {
    set((state) => {
      if (state.onlineUsers.has(userId)) return state; // no-op if already present
      const updated = new Set(state.onlineUsers);
      updated.add(userId);
      return { onlineUsers: updated };
    });
  },

  removeOnlineUser: (userId) => {
    set((state) => {
      if (!state.onlineUsers.has(userId)) return state; // no-op if not present
      const updated = new Set(state.onlineUsers);
      updated.delete(userId);
      return { onlineUsers: updated };
    });
  },

  setTyping: (channelId, userId, username, isTyping) => {
    set((state) => {
      const current = state.typingUsers[channelId] || [];
      if (isTyping) {
        if (current.some((t) => t.userId === userId)) return state;
        return { typingUsers: { ...state.typingUsers, [channelId]: [...current, { userId, username }] } };
      } else {
        const filtered = current.filter((t) => t.userId !== userId);
        if (filtered.length === current.length) return state; // no-op
        return { typingUsers: { ...state.typingUsers, [channelId]: filtered } };
      }
    });
  },
}));

/**
 * Stable selector — returns boolean, not a function.
 * Use: const isOnline = useIsUserOnline(userId)
 */
export function useIsUserOnline(userId: string | undefined): boolean {
  return usePresenceStore((s) => (userId ? s.onlineUsers.has(userId) : false));
}
