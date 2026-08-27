export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  statusText: string;
  isOnline: boolean;
  lastSeenAt: string;
  createdAt: string;
}

export interface UserWithRole extends User {
  role: 'ADMIN' | 'MEMBER';
  joinedAt: string;
}
