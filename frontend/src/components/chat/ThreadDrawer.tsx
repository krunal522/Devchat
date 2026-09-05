import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { MessageItem } from './MessageItem';
import { useSocketActions } from '../../hooks/useSocket';
import { messageApi } from '../../services/messageApi';
import './ThreadDrawer.css';

export function ThreadDrawer() {
  const activeThreadMessage = useChatStore((s) => s.activeThreadMessage);
  const replies = useChatStore((s) => s.activeThreadReplies);
  const setThreadReplies = useChatStore((s) => s.setThreadReplies);
  const closeThread = useChatStore((s) => s.closeThread);
  const activeChannel = useChatStore((s) => s.activeChannel);
  const { sendMessage } = useSocketActions();

  const [replyContent, setReplyContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const isSubmittingRef = useRef(false);

  const parentId = activeThreadMessage?.id;
  const channelId = activeThreadMessage?.channelId;

  // Deduplicate and filter out temporary messages when confirmed server messages exist
  const safeReplies = useMemo(() => {
    if (!Array.isArray(replies)) return [];
    const seen = new Set<string>();
    const serverReplies = replies.filter((r) => !r.id.startsWith('temp-'));

    return replies.filter((r) => {
      if (!r?.id || seen.has(r.id)) return false;
      seen.add(r.id);

      // If this is a temporary message, drop it if a confirmed server message from the same author with same content exists
      if (r.id.startsWith('temp-')) {
        const norm = (r.content || '').trim();
        const hasConfirmed = serverReplies.some(
          (sr) => sr.user?.id === r.user?.id && (sr.content || '').trim() === norm
        );
        if (hasConfirmed) return false;
      }
      return true;
    });
  }, [replies]);

  // 1. Fetch thread replies from API when thread opens
  useEffect(() => {
    if (!parentId) return;

    let isMounted = true;
    setIsLoading(true);

    messageApi.getThreadMessages(parentId)
      .then((data) => {
        if (isMounted) {
          setThreadReplies(data.replies || []);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load thread replies:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [parentId, setThreadReplies]);

  // Scroll to bottom when new reply is added
  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [safeReplies.length]);

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = replyContent.trim();
    if (!trimmed || !activeThreadMessage || !channelId || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 250);

    sendMessage(channelId, trimmed, activeThreadMessage.id);
    setReplyContent('');
  };

  if (!activeThreadMessage) return null;

  return (
    <div className="thread-drawer-overlay">
      <div className="thread-drawer">
        {/* Header */}
        <div className="thread-drawer__header">
          <div className="thread-drawer__header-title">
            <h3>Thread</h3>
            <span className="thread-drawer__channel-tag">
              #{activeChannel?.name || 'channel'}
            </span>
          </div>

          <button
            type="button"
            className="thread-drawer__close-btn"
            onClick={closeThread}
            title="Close Thread (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="thread-drawer__body">
          {/* Parent Original Message */}
          <div className="thread-drawer__parent-message">
            <MessageItem message={activeThreadMessage} />
          </div>

          {/* Replies Divider */}
          <div className="thread-drawer__divider">
            <span>
              {safeReplies.length} {safeReplies.length === 1 ? 'reply' : 'replies'}
            </span>
            <div className="thread-drawer__divider-line" />
          </div>

          {/* List of Replies */}
          <div className="thread-drawer__replies-list">
            {isLoading ? (
              <div className="thread-drawer__loading">Loading replies...</div>
            ) : (
              safeReplies.map((reply) => (
                <MessageItem key={reply.id} message={reply} />
              ))
            )}
            <div ref={repliesEndRef} />
          </div>
        </div>

        {/* Dedicated Thread Reply Input */}
        <form className="thread-drawer__footer" onSubmit={handleSendReply}>
          <input
            type="text"
            className="thread-drawer__input"
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Reply in thread..."
          />
          <button
            type="submit"
            className={`thread-drawer__send-btn ${replyContent.trim() ? 'thread-drawer__send-btn--active' : ''}`}
            disabled={!replyContent.trim()}
          >
            Reply
          </button>
        </form>
      </div>
    </div>
  );
}
