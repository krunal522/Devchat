export interface SocketEvents {
  // Client → Server
  'message:send': (payload: { channelId: string; content: string; parentId?: string }, callback?: Function) => void;
  'message:edit': (payload: { messageId: string; content: string }, callback?: Function) => void;
  'message:delete': (payload: { messageId: string }, callback?: Function) => void;
  'channel:join': (channelId: string, callback?: Function) => void;
  'channel:leave': (channelId: string, callback?: Function) => void;
  'channel:join_all': (callback?: Function) => void;
  'typing:start': (channelId: string) => void;
  'typing:stop': (channelId: string) => void;
  'presence:get_online': (callback?: Function) => void;

  // Server → Client
  'message:new': (message: any) => void;
  'message:edited': (message: any) => void;
  'message:deleted': (data: { messageId: string; channelId: string }) => void;
  'user:online': (data: { userId: string; username: string }) => void;
  'user:offline': (data: { userId: string; username: string; lastSeen: string }) => void;
  'typing:update': (data: { userId: string; username: string; channelId: string; isTyping: boolean }) => void;
  'presence:online_users': (userIds: string[]) => void;
  'channel:new': (channel: any) => void;
  'channel:member_joined': (data: { channelId: string; userId: string; username: string }) => void;
}

export type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
