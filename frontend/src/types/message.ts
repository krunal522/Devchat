import type { User } from './user';

export interface Reaction {
  id: string;
  emoji: string;
  userId: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: 'IMAGE' | 'DOCUMENT' | 'CODE' | 'AUDIO' | 'VIDEO' | 'OTHER';
  fileSize: number;
  mimeType: string;
}

export interface Message {
  id: string;
  content: string;
  isEdited: boolean;
  isDeleted?: boolean;
  parentId: string | null;
  channelId: string;
  createdAt: string;
  updatedAt: string;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  reactions?: Reaction[];
  attachments?: Attachment[];
  parent?: {
    id: string;
    content: string;
    user: Pick<User, 'id' | 'username' | 'displayName'>;
  } | null;
  _count: {
    replies: number;
  };
}

export interface MessagesResponse {
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}
