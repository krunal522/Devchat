import type { User } from './user';

export interface Channel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: 'PUBLIC' | 'PRIVATE' | 'DIRECT';
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  _count: {
    members: number;
    messages: number;
  };
  isMember?: boolean;
  myRole?: 'ADMIN' | 'MEMBER' | null;
}

export interface DMChannel {
  id: string;
  otherUser: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isOnline: boolean;
    lastSeenAt: string;
  } | null;
  lastMessage: {
    content: string;
    createdAt: string;
    user: { username: string };
  } | null;
  updatedAt: string;
}
