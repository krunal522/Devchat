import api from './api';
import type { Channel, DMChannel } from '../types/channel';
import type { UserWithRole } from '../types/user';

export const channelApi = {
  getChannels: async (): Promise<Channel[]> => {
    const res = await api.get('/channels');
    return res.data.data;
  },

  getChannel: async (channelId: string): Promise<Channel> => {
    const res = await api.get(`/channels/${channelId}`);
    return res.data.data;
  },

  createChannel: async (data: {
    name: string;
    description?: string;
    type?: 'PUBLIC' | 'PRIVATE';
  }): Promise<Channel> => {
    const res = await api.post('/channels', data);
    return res.data.data;
  },

  joinChannel: async (channelId: string): Promise<void> => {
    await api.post(`/channels/${channelId}/join`);
  },

  leaveChannel: async (channelId: string): Promise<void> => {
    await api.post(`/channels/${channelId}/leave`);
  },

  getMembers: async (channelId: string): Promise<UserWithRole[]> => {
    const res = await api.get(`/channels/${channelId}/members`);
    return res.data.data;
  },

  addMembers: async (channelId: string, userIds: string[]): Promise<UserWithRole[]> => {
    const res = await api.post(`/channels/${channelId}/members`, { userIds });
    return res.data.data;
  },

  removeMember: async (channelId: string, userId: string): Promise<UserWithRole[]> => {
    const res = await api.delete(`/channels/${channelId}/members/${userId}`);
    return res.data.data;
  },

  deleteChannel: async (channelId: string): Promise<void> => {
    await api.delete(`/channels/${channelId}`);
  },

  getDMChannels: async (): Promise<DMChannel[]> => {
    const res = await api.get('/channels/dm');
    return res.data.data;
  },

  getOrCreateDM: async (userId: string): Promise<Channel> => {
    const res = await api.post(`/channels/dm/${userId}`);
    return res.data.data;
  },
};
