import api from './api';
import type { User } from '../types/user';

export const userApi = {
  getUsers: async (): Promise<User[]> => {
    const res = await api.get('/users');
    return res.data.data;
  },

  getUser: async (userId: string): Promise<User> => {
    const res = await api.get(`/users/${userId}`);
    return res.data.data;
  },

  updateProfile: async (data: { displayName?: string; statusText?: string; avatarUrl?: string }): Promise<User> => {
    const res = await api.patch('/users/me', data);
    return res.data.data;
  },
};
