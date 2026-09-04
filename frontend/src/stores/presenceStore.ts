/**
 * @file presenceStore.ts
 * @description Real-time User Presence & Typing Indicator Zustand Store.
 * Centralized reactive store for tracking user online status (Set<string>) and typing indicators.
 * 
 * Key Features:
 * - Reactive `Set<string>` online users map for 0ms presence lookups.
 * - Helper `useIsUserOnline(userId)` hook preventing unnecessary re-renders.
 * - Local storage fallback ensuring current user always displays as active.
 * 
 * @module Stores/PresenceStore
 */

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
    const validIds = (Array.isArray(userIds) ? userIds : []).filter(Boolean).map((id) => String(id).trim());
    const finalSet = new Set(validIds);
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const u = JSON.parse(storedUser);
        if (u?.id) finalSet.add(String(u.id).trim());
      }
    } catch {}
    set({ onlineUsers: finalSet });
  },

  addOnlineUser: (userId) => {
    if (!userId) return;
    const cleanId = String(userId).trim();
    set((state) => {
      if (state.onlineUsers.has(cleanId)) return state;
      const updated = new Set(state.onlineUsers);
      updated.add(cleanId);
      return { onlineUsers: updated };
    });
  },

  removeOnlineUser: (userId) => {
    if (!userId) return;
    const cleanId = String(userId).trim();
    set((state) => {
      if (!state.onlineUsers.has(cleanId)) return state;
      const updated = new Set(state.onlineUsers);
      updated.delete(cleanId);
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
        if (filtered.length === current.length) return state;
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
  const cleanId = userId ? String(userId).trim() : '';
  return usePresenceStore((s) => (cleanId ? s.onlineUsers.has(cleanId) : false));
}
