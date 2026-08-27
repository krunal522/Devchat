// Legacy re-export — all new code should import from socketManager.ts
export { initSocket as connectSocket, destroySocket as disconnectSocket, getSocket } from './socketManager';
