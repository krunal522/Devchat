import { useState, useEffect, useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useToastStore } from '../../stores/toastStore';
import { AILogoIcon } from '../ui/AILogoIcon';
import { formatMessageTime } from '../../utils/formatDate';
import { groupMessagesIntoSessions, type ChatSession } from '../../utils/aiSessions';
import type { Message } from '../../types/message';
import './AIHistoryModal.css';

interface AIHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  onSelectMessage?: (messageId: string) => void;
}

const EMPTY_MESSAGES: Message[] = [];

export function AIHistoryModal({ isOpen, onClose, channelId, onSelectMessage }: AIHistoryModalProps) {
  const messages = useChatStore((s) => (channelId ? s.messages[channelId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES));
  const loadMessages = useChatStore((s) => s.loadMessages);
  const clearChannelMessages = useChatStore((s) => s.clearChannelMessages);
  const [searchTerm, setSearchTerm] = useState('');

  // Auto-fetch history messages from backend DB whenever modal is opened
  useEffect(() => {
    if (isOpen && channelId) {
      loadMessages(channelId);
    }
  }, [isOpen, channelId, loadMessages]);

  // Group messages into distinct Chat Sessions
  const sessions = useMemo(() => groupMessagesIntoSessions(messages), [messages]);

  // Filter sessions by search term
  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) return sessions;
    const term = searchTerm.toLowerCase();
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(term) ||
        session.messages.some((m) => m.content.toLowerCase().includes(term))
    );
  }, [sessions, searchTerm]);

  if (!isOpen) return null;

  const handleOpenSession = (sessionId: string) => {
    onClose();
    if (onSelectMessage) {
      onSelectMessage(sessionId);
    }
  };

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear your current AI chat view?')) {
      clearChannelMessages(channelId);
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Chat Cleared',
        message: 'Cleared current chat view session',
      });
      onClose();
    }
  };

  return (
    <div className="ai-history-overlay" onClick={onClose}>
      <div className="ai-history-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-history-modal__header">
          <div className="ai-history-modal__title-group">
            <AILogoIcon size={26} />
            <div>
              <h3 className="ai-history-modal__title">DevChat AI — Chat Sessions</h3>
              <span className="ai-history-modal__sub">
                {sessions.length} separate chat {sessions.length === 1 ? 'session' : 'sessions'} available
              </span>
            </div>
          </div>
          <button type="button" className="ai-history-modal__close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Clean Full-Width Search Bar */}
        <div className="ai-history-modal__actions">
          <div className="ai-history-modal__search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search chat sessions by prompt or response..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ai-history-modal__search-input"
              autoFocus
            />
            {searchTerm && (
              <button
                type="button"
                className="ai-history-modal__search-clear"
                onClick={() => setSearchTerm('')}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Distinct Chat Sessions List */}
        <div className="ai-history-modal__list">
          {filteredSessions.length === 0 ? (
            <div className="ai-history-modal__empty">
              <span>📜</span>
              <p>{searchTerm ? 'No matching chat sessions found' : 'No past chat sessions available.'}</p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const aiAnswer = session.messages.find(
                (m) => m.user?.username === 'devchat_ai' || m.user?.id === 'devchat-ai-bot-id'
              );

              return (
                <div
                  key={session.id}
                  className="ai-history-session-card"
                  onClick={() => handleOpenSession(session.id)}
                  title="Click to open this full separate chat session in main chat"
                >
                  <div className="ai-history-session-header">
                    <div className="ai-history-session-title">
                      <span>💬</span>
                      <span>{session.title}</span>
                    </div>
                    <div className="ai-history-session-meta">
                      <span className="ai-history-session-badge">
                        {session.messages.length} {session.messages.length === 1 ? 'msg' : 'msgs'}
                      </span>
                      <span className="ai-history-session-time">
                        {formatMessageTime(session.startTime)}
                      </span>
                    </div>
                  </div>

                  {aiAnswer && (
                    <div className="ai-history-session-preview">
                      <strong>🤖 DevChat AI: </strong>
                      {aiAnswer.content.length > 140
                        ? `${aiAnswer.content.slice(0, 140)}...`
                        : aiAnswer.content}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="ai-history-modal__footer">
          <button
            type="button"
            className="ai-history-modal__clear-btn"
            onClick={handleClearHistory}
          >
            Clear Current View
          </button>
          <button
            type="button"
            className="ai-history-modal__restore-btn"
            onClick={() => {
              onClose();
              useChatStore.getState().loadMessages(channelId);
            }}
          >
            📜 Restore All Sessions
          </button>
          <button
            type="button"
            className="ai-history-modal__done-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
