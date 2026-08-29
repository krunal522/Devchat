import React, { useState, useEffect, useRef } from 'react';
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

  const parentId = activeThreadMessage?.id;
  const channelId = activeThreadMessage?.channelId;

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
  }, [(replies || []).length]);

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !activeThreadMessage || !channelId) return;

    sendMessage(channelId, replyContent.trim(), activeThreadMessage.id);
    setReplyContent('');
  };

  if (!activeThreadMessage) return null;

  const safeReplies = Array.isArray(replies) ? replies : [];

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
              replies.map((reply) => (
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
