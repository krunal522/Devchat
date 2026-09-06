import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useSocketActions } from '../../hooks/useSocket';
import { useToastStore } from '../../stores/toastStore';
import { UserAvatar } from '../user/UserAvatar';
import type { Message } from '../../types/message';
import './ForwardModal.css';

interface ForwardModalProps {
  message: Message;
  isOpen: boolean;
  onClose: () => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({ message, isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  const channels = useChatStore((s) => s.channels);
  const dmChannels = useChatStore((s) => s.dmChannels);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { sendMessage } = useSocketActions();
  const addToast = useToastStore((s) => s.addToast);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSentMap({});
    }
  }, [isOpen]);

  // Filter channels (Public & Private)
  const filteredChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return channels.filter((c) => {
      if (c.type === 'DIRECT') return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
      );
    });
  }, [channels, searchQuery]);

  // Filter DMs
  const filteredDMs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dmChannels.filter((dm) => {
      if (!dm.otherUser) return false;
      if (!q) return true;
      const name = (dm.otherUser.displayName || dm.otherUser.username || '').toLowerCase();
      return name.includes(q);
    });
  }, [dmChannels, searchQuery]);

  // Extract preview info
  const imageAttachment = message.attachments?.find((a) => a.fileType === 'IMAGE');
  const resolveUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
      return url;
    }
    const backend = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
    return `${backend}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const handleForward = (targetId: string, targetName: string) => {
    if (sentMap[targetId]) return;

    const mappedAttachments = message.attachments && message.attachments.length > 0
      ? message.attachments.map((att) => ({
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          fileType: att.fileType,
          fileSize: att.fileSize,
          mimeType: att.mimeType || 'application/octet-stream',
        }))
      : undefined;

    sendMessage(
      targetId,
      message.content || '',
      undefined,
      mappedAttachments,
      true // isForwarded
    );

    setSentMap((prev) => ({ ...prev, [targetId]: true }));
    addToast({
      type: 'success',
      message: `Message forwarded to ${targetName}`,
    });
  };

  if (!isOpen) return null;

  const authorName = message.user?.displayName || message.user?.username || 'User';

  return createPortal(
    <div className="forward-modal-overlay" onClick={onClose}>
      <div className="forward-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="forward-modal-header">
          <h3>
            <span className="forward-modal-header-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 14 20 9 15 4" />
                <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
              </svg>
            </span>
            Forward Message
          </h3>
          <button
            type="button"
            className="forward-modal-close-btn"
            onClick={onClose}
            title="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Message Preview Snippet */}
        <div className="forward-modal-preview">
          {imageAttachment && (
            <img
              src={resolveUrl(imageAttachment.fileUrl)}
              alt={imageAttachment.fileName}
              className="forward-modal-preview-thumb"
            />
          )}
          <div className="forward-modal-preview-body">
            <div className="forward-modal-preview-author">{authorName}</div>
            <p className="forward-modal-preview-text">
              {message.content || (imageAttachment ? '📷 Photo' : '📎 Attachment')}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="forward-modal-search">
          <div className="forward-modal-search-box">
            <span className="forward-modal-search-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="forward-modal-search-input"
              placeholder="Search channels or people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Destinations List */}
        <div className="forward-modal-list">
          {filteredChannels.length === 0 && filteredDMs.length === 0 ? (
            <div className="forward-modal-empty">No channels or contacts found</div>
          ) : (
            <>
              {/* Channels Section */}
              {filteredChannels.length > 0 && (
                <div className="forward-modal-section">
                  <div className="forward-modal-section-title">Channels</div>
                  {filteredChannels.map((ch) => {
                    const isSent = Boolean(sentMap[ch.id]);
                    return (
                      <div key={ch.id} className="forward-modal-item">
                        <div className="forward-modal-item-left">
                          <div className="forward-modal-item-hash">
                            {ch.type === 'PRIVATE' ? '🔒' : '#'}
                          </div>
                          <div className="forward-modal-item-info">
                            <span className="forward-modal-item-name">{ch.name}</span>
                            <span className="forward-modal-item-sub">
                              {ch.description || `${ch._count?.members || 1} members`}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className={`forward-modal-send-btn ${isSent ? 'forward-modal-send-btn--sent' : ''}`}
                          onClick={() => handleForward(ch.id, `#${ch.name}`)}
                          disabled={isSent}
                        >
                          {isSent ? (
                            <>
                              <span>✓</span>
                              <span>Sent</span>
                            </>
                          ) : (
                            <>
                              <span>Send</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                              </svg>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Direct Messages Section */}
              {filteredDMs.length > 0 && (
                <div className="forward-modal-section" style={{ marginTop: '0.75rem' }}>
                  <div className="forward-modal-section-title">Direct Messages</div>
                  {filteredDMs.map((dm) => {
                    if (!dm.otherUser) return null;
                    const isSent = Boolean(sentMap[dm.id]);
                    const dmName = dm.otherUser.displayName || dm.otherUser.username;
                    return (
                      <div key={dm.id} className="forward-modal-item">
                        <div className="forward-modal-item-left">
                          <UserAvatar
                            src={dm.otherUser.avatarUrl}
                            displayName={dmName}
                            size="sm"
                            isOnline={dm.otherUser.isOnline}
                            showStatus
                          />
                          <div className="forward-modal-item-info">
                            <span className="forward-modal-item-name">{dmName}</span>
                            <span className="forward-modal-item-sub">
                              @{dm.otherUser.username}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className={`forward-modal-send-btn ${isSent ? 'forward-modal-send-btn--sent' : ''}`}
                          onClick={() => handleForward(dm.id, dmName)}
                          disabled={isSent}
                        >
                          {isSent ? (
                            <>
                              <span>✓</span>
                              <span>Sent</span>
                            </>
                          ) : (
                            <>
                              <span>Send</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                              </svg>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
