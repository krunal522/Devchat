/**
 * @file authStore.ts
 * @description Authentication & User Session Management Zustand Store.
 * Controls JWT tokens, auto-refresh on 401 response, WebSocket lifecycle connection (`initSocket`/`destroySocket`),
 * and user profile state.
 * 
 * Key Features:
 * - Silent Token Refresh (`authApi.refresh`) when access token expires.
 * - Automatic Socket initialization on login/auth verification.
 * - Graceful network retry preserving local sessions during transient disconnects.
 * 
 * @module Stores/AuthStore
 */

import { create } from 'zustand';
import type { User } from '../types/user';
import { authApi } from '../services/authApi';
import { initSocket, destroySocket } from '../services/socketManager';
import { notificationService } from '../services/notificationService';

import { userApi } from '../services/userApi';
import { useToastStore } from './toastStore';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; username: string; displayName: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (data: { displayName?: string; statusText?: string; avatarUrl?: string }) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: true,
  error: null,

  updateProfile: async (data) => {
    const updatedUser = await userApi.updateProfile(data);
    set({ user: updatedUser });
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authApi.login({ email, password });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      initSocket(data.accessToken);
      notificationService.requestPermission();
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Invalid email/username or password';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  register: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authApi.register(input);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      initSocket(data.accessToken);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Registration failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    }
    destroySocket();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false, isLoading: false, error: null });
  },

  checkAuth: async () => {
    let token = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!token && !refreshToken) {
      set({ isLoading: false, isAuthenticated: false, user: null });
      return;
    }

    try {
      if (token) {
        try {
          const user = await authApi.getMe();
          initSocket(token);
          set({ user, isAuthenticated: true, isLoading: false });
          return;
        } catch (meErr: any) {
          // If token expired/unauthorized (401), attempt silent token refresh
          if (meErr.response?.status === 401 && refreshToken) {
            const tokenRes = await authApi.refresh(refreshToken);
            token = tokenRes.accessToken;
            localStorage.setItem('accessToken', tokenRes.accessToken);
            localStorage.setItem('refreshToken', tokenRes.refreshToken);
            const user = await authApi.getMe();
            initSocket(token);
            set({ user, isAuthenticated: true, isLoading: false });
            return;
          }
          throw meErr;
        }
      } else if (refreshToken) {
        const tokenRes = await authApi.refresh(refreshToken);
        token = tokenRes.accessToken;
        localStorage.setItem('accessToken', tokenRes.accessToken);
        localStorage.setItem('refreshToken', tokenRes.refreshToken);
        const user = await authApi.getMe();
        initSocket(token);
        set({ user, isAuthenticated: true, isLoading: false });
        return;
      }
    } catch (err: any) {
      console.warn('Authentication check failed:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, isAuthenticated: false, isLoading: false });
      } else {
        // Keep active session during temporary network/server glitches
        set({ isLoading: false });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
