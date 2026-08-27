import api from './api';
import type { User } from '../types/user';

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export const authApi = {
  register: async (data: {
    email: string;
    username: string;
    displayName: string;
    password: string;
  }): Promise<AuthResponse> => {
    const res = await api.post('/auth/register', data);
    return res.data.data;
  },

  login: async (data: { email: string; password: string }): Promise<AuthResponse> => {
    const res = await api.post('/auth/login', data);
    return res.data.data;
  },

  refresh: async (refreshToken: string): Promise<TokenResponse> => {
    const res = await api.post('/auth/refresh', { refreshToken });
    return res.data.data;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  getMe: async (): Promise<User> => {
    const res = await api.get('/auth/me');
    return res.data.data;
  },
};
