import { MainLayout } from '../components/layout/MainLayout';
import { MessageList } from '../components/chat/MessageList';
import { MessageInput } from '../components/chat/MessageInput';

// Socket events are handled by socketManager.ts (initialized in authStore on login/checkAuth)
// No hook needed here — zero infinite-loop risk.
export function Chat() {
  return (
    <MainLayout>
      <MessageList />
      <MessageInput />
    </MainLayout>
  );
}
