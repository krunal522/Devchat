import { useState, useEffect } from 'react';
import { channelApi } from '../../services/channelApi';
import { userApi } from '../../services/userApi';
import { useChatStore } from '../../stores/chatStore';
import { useToastStore } from '../../stores/toastStore';
import { Modal } from '../ui/Modal';
import { UserAvatar } from '../user/UserAvatar';
import type { User } from '../../types/user';
import './AddMemberModal.css';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
}

export function AddMemberModal({ isOpen, onClose, channelId, channelName }: AddMemberModalProps) {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [existingMemberIds, setExistingMemberIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loadChannels = useChatStore((s) => s.loadChannels);

  useEffect(() => {
    if (!isOpen || !channelId) return;

    setIsLoading(true);
    setSelectedUserIds(new Set());

    Promise.all([
      userApi.getUsers().catch(() => []),
      channelApi.getMembers(channelId).catch(() => []),
    ])
      .then(([users, members]) => {
        const userList = Array.isArray(users) ? users : [];
        const memberList = Array.isArray(members) ? members : [];
        const existingIds = new Set(
          memberList.map((m: any) => (m.user ? m.user.id : m.id)).filter(Boolean)
        );

        setAllUsers(userList);
        setExistingMemberIds(existingIds as Set<string>);
      })
      .catch((err) => console.error('Failed to load member data:', err))
      .finally(() => setIsLoading(false));
  }, [isOpen, channelId]);

  const toggleUserSelection = (userId: string) => {
    if (existingMemberIds.has(userId)) return;

    setSelectedUserIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(userId)) {
        updated.delete(userId);
      } else {
        updated.add(userId);
      }
      return updated;
    });
  };

  const setActiveChannel = useChatStore((s) => s.setActiveChannel);

  const handleAddMembers = async () => {
    if (selectedUserIds.size === 0) return;

    setIsSubmitting(true);
    try {
      const count = selectedUserIds.size;
      await channelApi.addMembers(channelId, Array.from(selectedUserIds));
      await loadChannels();
      await setActiveChannel(channelId);

      useToastStore.getState().addToast({
        type: 'success',
        title: 'Members Added',
        message: `Added ${count} member${count === 1 ? '' : 's'} to #${channelName}`,
      });

      onClose();
    } catch (err: any) {
      console.error('Failed to add members:', err);
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Failed to Add Members',
        message: err.response?.data?.error?.message || 'Could not add members',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredUsers = allUsers.filter((u) => {
    // Exclude DevChat AI bot user from candidate list
    const isAIBot =
      u.username === 'devchat_ai' ||
      u.id === 'devchat-ai-bot-id' ||
      u.displayName?.toLowerCase().includes('devchat ai') ||
      u.email?.includes('devchat.ai');

    if (isAIBot) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Add members to #${channelName}`}>
      <div className="add-member-modal">
        <div className="add-member-modal__search">
          <input
            type="text"
            className="add-member-modal__input"
            placeholder="Search team members by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="add-member-modal__list">
          {isLoading ? (
            <div className="add-member-modal__status">Loading workspace members...</div>
          ) : filteredUsers.length > 0 ? (
            filteredUsers.map((user) => {
              const isAlreadyMember = existingMemberIds.has(user.id);
              const isSelected = selectedUserIds.has(user.id);

              return (
                <button
                  key={user.id}
                  type="button"
                  className={`add-member-modal__item ${
                    isAlreadyMember
                      ? 'add-member-modal__item--already-member'
                      : isSelected
                      ? 'add-member-modal__item--selected'
                      : ''
                  }`}
                  onClick={() => toggleUserSelection(user.id)}
                  disabled={isAlreadyMember}
                >
                  <UserAvatar
                    src={user.avatarUrl}
                    displayName={user.displayName}
                    size="sm"
                  />
                  <div className="add-member-modal__user-info">
                    <span className="add-member-modal__name">{user.displayName}</span>
                    <span className="add-member-modal__username">@{user.username}</span>
                  </div>

                  {isAlreadyMember ? (
                    <span className="add-member-modal__already-tag">✓ Member</span>
                  ) : (
                    <div className={`add-member-modal__checkbox ${isSelected ? 'add-member-modal__checkbox--checked' : ''}`}>
                      {isSelected && '✓'}
                    </div>
                  )}
                </button>
              );
            })
          ) : (
            <div className="add-member-modal__status">
              No workspace members found matching "{searchQuery}"
            </div>
          )}
        </div>

        <div className="add-member-modal__footer">
          <span className="add-member-modal__count">
            {selectedUserIds.size} member{selectedUserIds.size === 1 ? '' : 's'} selected to add
          </span>
          <div className="add-member-modal__actions">
            <button
              type="button"
              className="add-member-modal__btn add-member-modal__btn--cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="add-member-modal__btn add-member-modal__btn--submit"
              onClick={handleAddMembers}
              disabled={selectedUserIds.size === 0 || isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add Members'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
