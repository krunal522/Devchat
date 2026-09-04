import React, { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { UserAvatar } from '../user/UserAvatar';
import { EmojiPicker } from '../ui/EmojiPicker';
import { MarkdownRenderer } from './MarkdownRenderer';
import { VoicePlayer } from './VoicePlayer';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useIsUserOnline } from '../../stores/presenceStore';
import { useSocketActions } from '../../hooks/useSocket';
import { messageApi } from '../../services/messageApi';
import { formatMessageTime } from '../../utils/formatDate';
import { FileIcon } from '../ui/FileIcon';
import type { Message } from '../../types/message';
import '../ui/FileIcon.css';
import './MessageItem.css';

interface MessageItemProps {
  message: Message;
}

export const MessageItem = memo(function MessageItem({ message }: MessageItemProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const openThread = useChatStore((s) => s.openThread);
  const activeChannel = useChatStore((s) => s.activeChannel);
  const authorId = message.user?.id;
  const authorName = message.user?.displayName || 'Unknown';
  const authorAvatar = message.user?.avatarUrl;
  const isOwnMessage = currentUserId === authorId;

  const displayNameLower = typeof message.user?.displayName === 'string' ? message.user.displayName.toLowerCase() : '';
  const usernameLower = typeof message.user?.username === 'string' ? message.user.username.toLowerCase() : '';

  const isAIMessage =
    message.user?.username === 'devchat_ai' ||
    message.user?.id === 'devchat-ai-bot-id' ||
    displayNameLower.includes('devchat ai') ||
    displayNameLower.includes('ai') ||
    usernameLower.includes('devchat_ai');

  const isAuthorSelf = Boolean(currentUserId && authorId === currentUserId);
  const isOnlineHook = useIsUserOnline(authorId);
  const isOnline = isAIMessage || isAuthorSelf || isOnlineHook;

  const { editMessage, deleteMessage, toggleReaction } = useSocketActions();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || '');
  const [showActions, setShowActions] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [lightboxAttachment, setLightboxAttachment] = useState<{ url: string; name: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const channelNameLower = typeof activeChannel?.name === 'string' ? activeChannel.name.toLowerCase() : '';
  const isAIChat =
    activeChannel?.type === 'DIRECT' &&
    (channelNameLower.includes('devchat ai') ||
      (activeChannel?.createdBy as any)?.username === 'devchat_ai');

  const canEditOrDelete = isOwnMessage;

  // Handle Escape key to close Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxAttachment) {
        setLightboxAttachment(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxAttachment]);

  // Group reactions by emoji
  const groupedReactions = (message.reactions || []).reduce<Record<string, { count: number; hasReacted: boolean }>>(
    (acc, r) => {
      if (!acc[r.emoji]) {
        acc[r.emoji] = { count: 0, hasReacted: false };
      }
      acc[r.emoji].count += 1;
      if (r.userId === currentUserId) {
        acc[r.emoji].hasReacted = true;
      }
      return acc;
    },
    {}
  );



  const handleEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSaveEdit = async () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== message.content) {
      setIsEditing(false);
      const updated = { ...message, content: trimmed, isEdited: true };
      useChatStore.getState().updateMessage(updated);
      editMessage(message.id, trimmed);
      try {
        await messageApi.updateMessage(message.id, trimmed);
      } catch (err) {
        console.warn('REST edit fallback error:', err);
      }
    } else {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this message?')) {
      useChatStore.getState().removeMessage(message.id, message.channelId);
      deleteMessage(message.id);
      try {
        await messageApi.deleteMessage(message.id);
      } catch (err) {
        console.warn('REST delete fallback error:', err);
      }
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleToggleReaction = (emoji: string) => {
    toggleReaction(message.id, emoji);

    if (!currentUserId) return;
    const existingReactions = message.reactions || [];
    const hasReacted = existingReactions.some(
      (r) => r.userId === currentUserId && r.emoji === emoji
    );

    let newReactions;
    if (hasReacted) {
      newReactions = existingReactions.filter(
        (r) => !(r.userId === currentUserId && r.emoji === emoji)
      );
    } else {
      newReactions = [
        ...existingReactions,
        { id: `temp-${Date.now()}`, emoji, userId: currentUserId },
      ];
    }

    const updatedMsg = { ...message, reactions: newReactions };
    useChatStore.getState().updateMessage(updatedMsg);
  };

  // ─── Deleted Message State (WhatsApp/Slack Tombstone) ───
  if (message.isDeleted || message.content === 'This message was deleted' || message.content === '🚫 This message was deleted') {
    return (
      <div className="message message--deleted">
        <UserAvatar
          src={authorAvatar}
          displayName={authorName}
          size="md"
          isOnline={isOnline}
          showStatus
        />
        <div className="message__body">
          <div className="message__header">
            <span className="message__author">{authorName}</span>
            <span className="message__time">{formatMessageTime(message.createdAt)}</span>
          </div>
          <p className="message__deleted-inline">
            <span className="message__deleted-icon">🚫</span>
            <i>This message was deleted</i>
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`message ${isEditing ? 'message--editing' : ''}`}>
        <UserAvatar
          src={authorAvatar}
          displayName={authorName}
          size="md"
          isOnline={isOnline}
          showStatus
        />

        <div className="message__body">
          <div className="message__header">
            <span className="message__author">{authorName}</span>
            <span className="message__time">{formatMessageTime(message.createdAt)}</span>
            {message.isEdited && <span className="message__edited">(edited)</span>}
          </div>

          {/* Quoted Parent Reply Card (Only shown if replying directly) */}
          {message.parent && !message.parentId && (
            <div className="message__quoted-reply">
              <div className="message__quoted-content">
                <div className="message__quoted-author">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 17 4 12 9 7" />
                    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                  </svg>
                  <span>{message.parent.user?.displayName || message.parent.user?.username || 'User'}</span>
                </div>
                <div className="message__quoted-text">
                  {message.parent.content || 'Attachment'}
                </div>
              </div>
            </div>
          )}

          {/* Professional Edit Mode */}
          {isEditing ? (
            <div className="message__edit-box">
              <textarea
                ref={inputRef}
                className="message__edit-textarea"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="Edit your message..."
              />
              <div className="message__edit-footer">
                <span className="message__edit-hint">
                  <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to cancel
                </span>
                <div className="message__edit-buttons">
                  <button
                    type="button"
                    className="message__edit-btn message__edit-btn--cancel"
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="message__edit-btn message__edit-btn--save"
                    onClick={handleSaveEdit}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          ) : (
            message.content && <MarkdownRenderer content={message.content} />
          )}

          {/* Attachments Renderer */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="message__attachments">
              {message.attachments.map((att) => {
                if (att.fileType === 'IMAGE') {
                  return (
                    <div
                      key={att.id}
                      className="message__attachment-image"
                      onClick={() => setLightboxAttachment({ url: att.fileUrl, name: att.fileName })}
                      title="Click to expand full image"
                    >
                      <img src={att.fileUrl} alt={att.fileName} loading="lazy" />
                    </div>
                  );
                }

                if (att.fileType === 'AUDIO') {
                  return <VoicePlayer key={att.id} src={att.fileUrl} />;
                }

                if (att.fileType === 'VIDEO') {
                  return (
                    <div key={att.id} className="message__attachment-media">
                      <video controls src={att.fileUrl} style={{ maxWidth: '100%', borderRadius: 8 }} />
                    </div>
                  );
                }

                return (
                  <a key={att.id} href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="message__attachment-card" download>
                    <FileIcon fileType={att.fileType} fileName={att.fileName} mimeType={att.mimeType} />
                    <div className="message__attachment-card-info">
                      <span className="message__attachment-card-name">{att.fileName}</span>
                      <span className="message__attachment-card-meta">
                        {(att.fileSize / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <span className="message__attachment-card-download" title="Download">⬇️</span>
                  </a>
                );
              })}
            </div>
          )}

          {/* Reaction Badges */}
          {Object.keys(groupedReactions).length > 0 && (
            <div className="message__reactions">
              {Object.entries(groupedReactions).map(([emoji, data]) => (
                <button
                  key={emoji}
                  className={`message__reaction-badge ${data.hasReacted ? 'message__reaction-badge--active' : ''}`}
                  onClick={() => toggleReaction(message.id, emoji)}
                >
                  <span>{emoji}</span>
                  <span className="message__reaction-count">{data.count}</span>
                </button>
              ))}
            </div>
          )}

          {message._count?.replies > 0 && (
            <div className="message__thread-indicator" onClick={() => openThread(message)} title="Open side thread panel">
              💬 {message._count.replies} {message._count.replies === 1 ? 'reply' : 'replies'}
            </div>
          )}
        </div>

        {/* Hover Action Toolbar (Completely disabled for DevChat AI and while editing) */}
        {!isEditing && !isAIMessage && !isAIChat && (
          <div className={`message__actions ${showFullPicker ? 'message__actions--active' : ''}`}>
            {/* Clean Smiley Reaction Picker Trigger */}
            <div className="message__more-emoji-wrapper">
              <button
                type="button"
                className={`message__action-btn ${showFullPicker ? 'message__action-btn--active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFullPicker((prev) => !prev);
                }}
                title="Add reaction"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </button>

              {showFullPicker && (
                <div className="message__full-emoji-picker" onClick={(e) => e.stopPropagation()}>
                  <EmojiPicker
                    onSelectEmoji={(emoji) => {
                      handleToggleReaction(emoji);
                      setShowFullPicker(false);
                    }}
                    onClose={() => setShowFullPicker(false)}
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              className="message__action-btn"
              onClick={() => useChatStore.getState().setReplyingToMessage(message)}
              title="Reply directly in chat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 17 4 12 9 7" />
                <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
              </svg>
            </button>

            <button
              type="button"
              className="message__action-btn"
              onClick={() => openThread(message)}
              title="Reply in thread"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>

            {canEditOrDelete && (
              <>
                <div className="message__action-divider" />
                <button
                  type="button"
                  className="message__action-btn"
                  onClick={handleEdit}
                  title="Edit message"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="message__action-btn message__action-btn--danger"
                  onClick={handleDelete}
                  title="Delete message"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Enterprise Image Lightbox Modal */}
      {lightboxAttachment &&
        createPortal(
          <div className="image-lightbox-backdrop" onClick={() => setLightboxAttachment(null)}>
            {/* Top Floating Glassmorphic Header */}
            <div className="image-lightbox-header" onClick={(e) => e.stopPropagation()}>
              <div className="image-lightbox-info">
                <span className="image-lightbox-icon">🖼️</span>
                <span className="image-lightbox-title">{lightboxAttachment.name}</span>
              </div>

              <div className="image-lightbox-actions">
                <a
                  href={lightboxAttachment.url}
                  download={lightboxAttachment.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="image-lightbox-action-btn image-lightbox-action-btn--download"
                  title="Download Image"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Download</span>
                </a>

                <button
                  type="button"
                  className="image-lightbox-action-btn image-lightbox-action-btn--close"
                  onClick={() => setLightboxAttachment(null)}
                  title="Close Preview (Esc)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Main Image Container */}
            <div className="image-lightbox-card" onClick={(e) => e.stopPropagation()}>
              <img src={lightboxAttachment.url} alt={lightboxAttachment.name} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
});
