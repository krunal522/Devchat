import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
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
import { DevChatImage } from '../ui/DevChatImage';
import { useToastStore } from '../../stores/toastStore';
import type { Message } from '../../types/message';
import '../ui/FileIcon.css';
import './MessageItem.css';

interface MessageItemProps {
  message: Message;
  isThreadParent?: boolean;
}

function getSafeStreamingMarkdown(content: string): string {
  const fenceMatches = content.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    return content + '\n```';
  }
  return content;
}

export const MessageItem = memo(function MessageItem({ message, isThreadParent }: MessageItemProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentUserAvatar = useAuthStore((s) => s.user?.avatarUrl);
  const currentUserDisplayName = useAuthStore((s) => s.user?.displayName);
  const openThread = useChatStore((s) => s.openThread);
  const activeChannel = useChatStore((s) => s.activeChannel);
  const authorId = message.user?.id;
  const isOwnMessage = Boolean(currentUserId && authorId === currentUserId);
  const authorName = isOwnMessage && currentUserDisplayName ? currentUserDisplayName : (message.user?.displayName || 'Unknown');
  const authorAvatar = isOwnMessage && currentUserAvatar !== undefined ? (currentUserAvatar || message.user?.avatarUrl) : message.user?.avatarUrl;

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
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);

  // Slack-style More Actions Menu & Delete Modal States
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
  const moreMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [lightboxAttachment, setLightboxAttachment] = useState<{ url: string; name: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingReactionRef = useRef(false);

  const calculatePickerPosition = useCallback(() => {
    if (!emojiTriggerRef.current) return null;
    const rect = emojiTriggerRef.current.getBoundingClientRect();
    const pickerHeight = 390; // height of emoji picker
    const pickerWidth = 340;

    // Check if there's enough space below in the viewport
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < pickerHeight + 16;

    // Align with trigger button, clamped safely to prevent offscreen overflow
    let right = window.innerWidth - rect.right;
    if (rect.right - pickerWidth < 12) {
      right = window.innerWidth - pickerWidth - 12;
    }
    if (right < 12) {
      right = 12;
    }

    return {
      ...(openUpwards
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 }),
      right,
    };
  }, []);

  const handleTogglePicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMoreMenu(false);
    if (!showFullPicker) {
      const pos = calculatePickerPosition();
      if (pos) setPickerPosition(pos);
      setShowFullPicker(true);
    } else {
      setShowFullPicker(false);
    }
  };

  const calculateMoreMenuPosition = useCallback(() => {
    if (!moreMenuTriggerRef.current) return null;
    const rect = moreMenuTriggerRef.current.getBoundingClientRect();
    const menuHeight = 160;
    const menuWidth = 190;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuHeight + 16;

    let right = window.innerWidth - rect.right;
    if (rect.right - menuWidth < 12) {
      right = window.innerWidth - menuWidth - 12;
    }
    if (right < 12) {
      right = 12;
    }

    return {
      ...(openUpwards
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
      right,
    };
  }, []);

  const handleToggleMoreMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowFullPicker(false);
    if (!showMoreMenu) {
      const pos = calculateMoreMenuPosition();
      if (pos) setMoreMenuPosition(pos);
      setShowMoreMenu(true);
    } else {
      setShowMoreMenu(false);
    }
  };

  const handleCopyText = async () => {
    setShowMoreMenu(false);
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      useToastStore.getState().addToast({
        title: 'Copied',
        message: 'Message copied to clipboard',
        type: 'success',
      });
    } catch (err) {
      console.warn('Clipboard copy error:', err);
    }
  };

  const handleConfirmDelete = async () => {
    setShowDeleteModal(false);
    useChatStore.getState().removeMessage(message.id, message.channelId);
    deleteMessage(message.id);
    try {
      await messageApi.deleteMessage(message.id);
    } catch (err) {
      console.warn('REST delete fallback error:', err);
    }
  };

  // Close or reposition on window scroll / resize / outside click
  useEffect(() => {
    if (!showFullPicker && !showMoreMenu) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showMoreMenu && !target.closest('.message__more-menu') && !moreMenuTriggerRef.current?.contains(target)) {
        setShowMoreMenu(false);
      }
    };

    const handleScrollOrResize = () => {
      if (showFullPicker) {
        const pos = calculatePickerPosition();
        if (pos) setPickerPosition(pos);
      }
      if (showMoreMenu) {
        const pos = calculateMoreMenuPosition();
        if (pos) setMoreMenuPosition(pos);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFullPicker(false);
        setShowMoreMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showFullPicker, showMoreMenu, calculatePickerPosition, calculateMoreMenuPosition]);

  // Handle Delete Modal keyboard shortcuts
  useEffect(() => {
    if (!showDeleteModal) return;
    const handleModalKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDeleteModal(false);
      } else if (e.key === 'Enter') {
        handleConfirmDelete();
      }
    };
    window.addEventListener('keydown', handleModalKeys);
    return () => window.removeEventListener('keydown', handleModalKeys);
  }, [showDeleteModal]);

  const channelNameLower = typeof activeChannel?.name === 'string' ? activeChannel.name.toLowerCase() : '';
  const isAIChat =
    activeChannel?.type === 'DIRECT' &&
    (channelNameLower.includes('devchat ai') ||
      (activeChannel?.createdBy as any)?.username === 'devchat_ai');

  const canEditOrDelete = isOwnMessage;

  // ChatGPT-style streaming typewriter animation for newly arrived AI messages
  const isFreshAIMessage = useRef(
    isAIMessage &&
    Boolean(message.content) &&
    Date.now() - new Date(message.createdAt).getTime() < 10000
  ).current;

  const [displayedContent, setDisplayedContent] = useState(() =>
    isFreshAIMessage ? '' : (message.content || '')
  );
  const [isStreaming, setIsStreaming] = useState(isFreshAIMessage);

  useEffect(() => {
    if (!isFreshAIMessage || !message.content) {
      setDisplayedContent(message.content || '');
      setIsStreaming(false);
      return;
    }

    let currentIndex = 0;
    const fullText = message.content;
    const totalLength = fullText.length;
    // Ultra-fast responsive streaming: ~6 to 25 characters per tick, 10ms tick (~350ms total)
    const step = Math.max(6, Math.ceil(totalLength / 35));

    const timer = setInterval(() => {
      currentIndex = Math.min(currentIndex + step, totalLength);
      setDisplayedContent(fullText.slice(0, currentIndex));

      if (currentIndex >= totalLength) {
        clearInterval(timer);
        setIsStreaming(false);
      }
    }, 10);

    return () => clearInterval(timer);
  }, [message.content, isFreshAIMessage]);

  // Keep chat pinned to bottom while AI response streams
  useEffect(() => {
    if (isStreaming) {
      const container = document.querySelector('.message-list');
      if (container) {
        const threshold = 180;
        const isNear = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
        if (isNear) {
          container.scrollTop = container.scrollHeight;
        }
      }
    }
  }, [displayedContent, isStreaming]);

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
    if (!currentUserId || !message?.id) return;

    // Prevent spam double clicks from sending conflicting socket packets
    if (pendingReactionRef.current) return;
    pendingReactionRef.current = true;
    setTimeout(() => {
      pendingReactionRef.current = false;
    }, 200);

    const existingReactions = message.reactions || [];
    const hasSameReaction = existingReactions.some(
      (r) => r.userId === currentUserId && r.emoji === emoji
    );

    let newReactions;
    if (hasSameReaction) {
      // Toggle off / remove reaction instantly
      newReactions = existingReactions.filter(
        (r) => !(r.userId === currentUserId && r.emoji === emoji)
      );
    } else {
      // Remove any previous reaction by this user and add the new one (matches backend behavior)
      const withoutUserReactions = existingReactions.filter(
        (r) => r.userId !== currentUserId
      );
      newReactions = [
        ...withoutUserReactions,
        {
          id: `temp-${Date.now()}`,
          emoji,
          userId: currentUserId,
          messageId: message.id,
          createdAt: new Date().toISOString(),
        },
      ];
    }

    // 1. Instant 0ms optimistic local store update
    const updatedMsg = { ...message, reactions: newReactions };
    useChatStore.getState().updateMessage(updatedMsg);

    // 2. Dispatch event over WebSocket
    toggleReaction(message.id, emoji);

    // 3. Dual-channel REST sync: guarantees database persistence & broadcast even if socket is reconnecting
    messageApi.toggleReaction(message.id, emoji).then((serverMsg) => {
      if (serverMsg) {
        useChatStore.getState().updateMessage(serverMsg);
      }
    }).catch(() => {});
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
            message.content && (
              <div
                className="message__content-wrapper"
                onClick={() => {
                  if (isStreaming) {
                    setDisplayedContent(message.content);
                    setIsStreaming(false);
                  }
                }}
              >
                <MarkdownRenderer content={isStreaming ? getSafeStreamingMarkdown(displayedContent) : message.content} />
                {isStreaming && <span className="ai-streaming-cursor">▋</span>}
              </div>
            )
          )}

          {/* Attachments Renderer */}
          {(() => {
            // Avoid showing duplicate image card if the image is already displayed inside the message content
            const uniqueAttachments = (message.attachments || []).filter((att) => {
              if (att.fileType === 'IMAGE' && message.content) {
                if (message.content.includes(att.fileUrl) || message.content.includes('![')) {
                  return false;
                }
              }
              return true;
            });

            if (uniqueAttachments.length === 0) return null;

            const resolveUrl = (url?: string) => {
              if (!url) return '';
              if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) return url;
              const backend = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
              return `${backend}${url.startsWith('/') ? '' : '/'}${url}`;
            };

            return (
              <div className="message__attachments">
                {uniqueAttachments.map((att) => {
                  const finalUrl = resolveUrl(att.fileUrl);

                  if (att.fileType === 'IMAGE') {
                    return (
                      <div
                        key={att.id}
                        className="message__attachment-image"
                        onClick={() => setLightboxAttachment({ url: finalUrl, name: att.fileName })}
                        title="Click to expand full image"
                      >
                        <DevChatImage
                          src={finalUrl}
                          alt={att.fileName}
                          logoSize={34}
                        />
                      </div>
                    );
                  }

                  if (att.fileType === 'AUDIO') {
                    return <VoicePlayer key={att.id} src={finalUrl} />;
                  }

                  if (att.fileType === 'VIDEO') {
                    return (
                      <div key={att.id} className="message__attachment-media">
                        <video controls src={finalUrl} style={{ maxWidth: '100%', borderRadius: 8 }} />
                      </div>
                    );
                  }

                  return (
                    <a key={att.id} href={finalUrl} target="_blank" rel="noopener noreferrer" className="message__attachment-card" download>
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
            );
          })()}

          {/* Reaction Badges */}
          {Object.keys(groupedReactions).length > 0 && (
            <div className="message__reactions">
              {Object.entries(groupedReactions).map(([emoji, data]) => (
                <button
                  key={emoji}
                  className={`message__reaction-badge ${data.hasReacted ? 'message__reaction-badge--active' : ''}`}
                  onClick={() => handleToggleReaction(emoji)}
                >
                  <span>{emoji}</span>
                  <span className="message__reaction-count">{data.count}</span>
                </button>
              ))}
            </div>
          )}

          {message._count?.replies > 0 && !isThreadParent && (
            <div className="message__thread-indicator" onClick={() => openThread(message)} title="Open side thread panel">
              💬 {message._count.replies} {message._count.replies === 1 ? 'reply' : 'replies'}
            </div>
          )}
        </div>

        {/* Hover Action Toolbar (Completely disabled for DevChat AI and while editing) */}
        {!isEditing && !isAIMessage && !isAIChat && (
          <div className={`message__actions ${showFullPicker || showMoreMenu ? 'message__actions--active' : ''}`}>
            {/* 1. Clean Smiley Reaction Picker Trigger */}
            <button
              ref={emojiTriggerRef}
              type="button"
              className={`message__action-btn ${showFullPicker ? 'message__action-btn--active' : ''}`}
              onClick={handleTogglePicker}
              title="Add reaction"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>

            {/* 2. Reply in Thread (hidden if already the thread parent) */}
            {!isThreadParent && (
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
            )}

            {/* 3. Reply Directly in Chat */}
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

            {/* 4. Slack-style More Actions (⋯) Trigger */}
            <button
              ref={moreMenuTriggerRef}
              type="button"
              className={`message__action-btn ${showMoreMenu ? 'message__action-btn--active' : ''}`}
              onClick={handleToggleMoreMenu}
              title="More actions"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
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
              <DevChatImage
                src={lightboxAttachment.url}
                alt={lightboxAttachment.name}
                logoSize={48}
                loading="eager"
                containerStyle={{
                  maxWidth: '88vw',
                  maxHeight: '78vh',
                  minWidth: '280px',
                  minHeight: '260px',
                  borderRadius: '14px',
                  background: 'rgba(18, 20, 30, 0.95)',
                }}
                style={{
                  maxHeight: '78vh',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>,
          document.body
        )}

      {/* Floating Reaction Emoji Picker Portal (Avoids clipping & flips up if near bottom) */}
      {showFullPicker && pickerPosition &&
        createPortal(
          <div
            className="message__portal-emoji-picker"
            style={{
              position: 'fixed',
              top: pickerPosition.top !== undefined ? `${pickerPosition.top}px` : 'auto',
              bottom: pickerPosition.bottom !== undefined ? `${pickerPosition.bottom}px` : 'auto',
              right: `${pickerPosition.right}px`,
              zIndex: 999999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <EmojiPicker
              onSelectEmoji={(emoji) => {
                handleToggleReaction(emoji);
                setShowFullPicker(false);
              }}
              onClose={() => setShowFullPicker(false)}
            />
          </div>,
          document.body
        )}

      {/* Slack-Style More Actions (⋯) Dropdown Menu Portal */}
      {showMoreMenu && moreMenuPosition &&
        createPortal(
          <div
            className="message__more-menu"
            style={{
              position: 'fixed',
              top: moreMenuPosition.top !== undefined ? `${moreMenuPosition.top}px` : 'auto',
              bottom: moreMenuPosition.bottom !== undefined ? `${moreMenuPosition.bottom}px` : 'auto',
              right: `${moreMenuPosition.right}px`,
              zIndex: 999999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Copy Text */}
            {message.content && (
              <button
                type="button"
                className="message__more-menu-item"
                onClick={handleCopyText}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy text</span>
              </button>
            )}

            {/* Reply / Quote in Chat */}
            <button
              type="button"
              className="message__more-menu-item"
              onClick={() => {
                setShowMoreMenu(false);
                useChatStore.getState().setReplyingToMessage(message);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 17 4 12 9 7" />
                <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
              </svg>
              <span>Reply to message</span>
            </button>

            {canEditOrDelete && (
              <>
                <div className="message__more-menu-divider" />

                {/* Edit Message */}
                <button
                  type="button"
                  className="message__more-menu-item"
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleEdit();
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span>Edit message</span>
                  <span className="message__more-menu-shortcut">E</span>
                </button>

                {/* Delete Message */}
                <button
                  type="button"
                  className="message__more-menu-item message__more-menu-item--danger"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowDeleteModal(true);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span>Delete message</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}

      {/* Enterprise Slack-Style Delete Message Confirmation Modal */}
      {showDeleteModal &&
        createPortal(
          <div className="slack-delete-modal__backdrop" onClick={() => setShowDeleteModal(false)}>
            <div className="slack-delete-modal__card" onClick={(e) => e.stopPropagation()}>
              <div className="slack-delete-modal__header">
                <div className="slack-delete-modal__title-row">
                  <span className="slack-delete-modal__icon">🗑️</span>
                  <h3 className="slack-delete-modal__title">Delete message</h3>
                </div>
                <button
                  type="button"
                  className="slack-delete-modal__close"
                  onClick={() => setShowDeleteModal(false)}
                  title="Close (Esc)"
                >
                  ✕
                </button>
              </div>

              <div className="slack-delete-modal__body">
                <p className="slack-delete-modal__desc">
                  Are you sure you want to delete this message? This cannot be undone.
                </p>

                {/* Quoted Message Preview Box */}
                <div className="slack-delete-modal__preview">
                  <div className="slack-delete-modal__preview-author">
                    <span className="slack-delete-modal__preview-name">{authorName}</span>
                    <span className="slack-delete-modal__preview-time">{formatMessageTime(message.createdAt)}</span>
                  </div>
                  <div className="slack-delete-modal__preview-text">
                    {message.content || (message.attachments?.length ? 'Attachment' : 'Message')}
                  </div>
                </div>
              </div>

              <div className="slack-delete-modal__footer">
                <button
                  type="button"
                  className="slack-delete-modal__btn slack-delete-modal__btn--cancel"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="slack-delete-modal__btn slack-delete-modal__btn--delete"
                  onClick={handleConfirmDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
});
