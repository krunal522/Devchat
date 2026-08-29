import React, { useState, useEffect } from 'react';
import { UserAvatar } from '../user/UserAvatar';
import { usePresenceStore } from '../../stores/presenceStore';
import type { User } from '../../types/user';
import './MentionPopup.css';

interface MentionPopupProps {
  users: User[];
  filterText: string;
  onSelectUser: (username: string) => void;
  onClose: () => void;
}

export function MentionPopup({ users, filterText, onSelectUser, onClose }: MentionPopupProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const safeUsers = Array.isArray(users) ? users : [];
  const filteredUsers = safeUsers.filter(
    (u) =>
      u.username?.toLowerCase().includes(filterText.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(filterText.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredUsers.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredUsers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredUsers[selectedIndex]) {
          onSelectUser(filteredUsers[selectedIndex].username);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredUsers, selectedIndex, onSelectUser, onClose]);

  if (filteredUsers.length === 0) return null;

  return (
    <div className="mention-popup">
      <div className="mention-popup__header">
        <span>Mention Team Member</span>
      </div>
      <div className="mention-popup__list">
        {filteredUsers.slice(0, 8).map((user, index) => (
          <div
            key={user.id}
            className={`mention-popup__item ${index === selectedIndex ? 'mention-popup__item--selected' : ''}`}
            onClick={() => onSelectUser(user.username)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <UserAvatar src={user.avatarUrl} displayName={user.displayName} size="xs" />
            <div className="mention-popup__item-info">
              <span className="mention-popup__item-name">{user.displayName}</span>
              <span className="mention-popup__item-handle">@{user.username}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
