import api from './api';
import type { Message, MessagesResponse, Attachment } from '../types/message';

export interface UploadedFileResponse {
  fileName: string;
  fileUrl: string;
  fileType: 'IMAGE' | 'DOCUMENT' | 'CODE' | 'AUDIO' | 'VIDEO' | 'OTHER';
  fileSize: number;
  mimeType: string;
}

export const messageApi = {
  getMessages: async (
    channelId: string,
    cursor?: string,
    limit: number = 50
  ): Promise<MessagesResponse> => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(limit));

    const res = await api.get(`/channels/${channelId}/messages?${params}`);
    return res.data.data;
  },

  sendMessage: async (
    channelId: string,
    content: string,
    parentId?: string,
    attachments?: Omit<Attachment, 'id'>[]
  ): Promise<Message> => {
    const res = await api.post(`/channels/${channelId}/messages`, {
      content,
      parentId,
      attachments,
    });
    return res.data.data;
  },

  updateMessage: async (messageId: string, content: string): Promise<Message> => {
    const res = await api.put(`/messages/${messageId}`, { content });
    return res.data.data;
  },

  deleteMessage: async (messageId: string): Promise<void> => {
    await api.delete(`/messages/${messageId}`);
  },

  clearChannelMessages: async (channelId: string): Promise<void> => {
    await api.delete(`/channels/${channelId}/messages/clear`);
  },

  getThreadMessages: async (
    messageId: string
  ): Promise<{ parent: Message; replies: Message[] }> => {
    const res = await api.get(`/messages/${messageId}/thread`);
    return res.data.data;
  },

  uploadFile: async (file: File): Promise<UploadedFileResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/uploads', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data.data;
  },
};
