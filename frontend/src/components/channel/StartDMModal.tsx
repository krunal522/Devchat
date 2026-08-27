import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { Modal } from '../ui/Modal';
import { UserAvatar } from '../user/UserAvatar';
import type { User } from '../../types/user';
import './StartDMModal.css';

interface StartDMModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StartDMModal({ isOpen, onClose }: StartDMModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const currentUser = useAuthStore((s) => s.user);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const openDM = useChatStore((s) => s.openDM);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    // Fetch all members so search finds any user to chat with
    api
      .get('/users')
      .then((res) => {
        setUsers(res.data.data || []);
      })
      .catch((err) => console.error('Failed to load members for DM:', err))
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  const handleSelectUser = async (targetUserId: string) => {
    await openDM(targetUserId);
    onClose();
  };

  const filteredUsers = users.filter((u) => {
    if (u.id === currentUser?.id || u.id === 'devchat-ai-bot-id' || u.username === 'devchat_ai') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const name = (u.displayName || '').toLowerCase();
    const username = (u.username || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return name.includes(q) || username.includes(q) || email.includes(q);
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Direct Message">
      <div className="start-dm-modal">
        <div className="start-dm-modal__search">
          <input
            type="text"
            className="start-dm-modal__input"
            placeholder="Search members by name, @username, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="start-dm-modal__list">
          {isLoading ? (
            <div className="start-dm-modal__loading">Loading members...</div>
          ) : filteredUsers.length > 0 ? (
            filteredUsers.map((user) => (
              <button
                key={user.id}
                className="start-dm-modal__item"
                onClick={() => handleSelectUser(user.id)}
              >
                <UserAvatar
                  src={user.avatarUrl}
                  displayName={user.displayName}
                  size="sm"
                  isOnline={onlineUsers.has(user.id)}
                  showStatus
                />
                <div className="start-dm-modal__user-info">
                  <span className="start-dm-modal__name">{user.displayName}</span>
                  <span className="start-dm-modal__username">@{user.username}</span>
                </div>
                <span className="start-dm-modal__chat-badge">Start Chat 💬</span>
              </button>
            ))
          ) : (
            <div className="start-dm-modal__empty">
              {searchQuery
                ? `No members found matching "${searchQuery}"`
                : 'No other members found.'}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
