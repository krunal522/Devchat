import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { getSocket } from '../../services/socketManager';
import { messageApi } from '../../services/messageApi';
import { useSocketActions } from '../../hooks/useSocket';
import { MessageItem } from './MessageItem';
import { AITypingBubble } from './AITypingBubble';
import { AILogoIcon } from '../ui/AILogoIcon';
import { UserAvatar } from '../user/UserAvatar';
import { groupMessagesIntoSessions } from '../../utils/aiSessions';
import { formatDateSeparator } from '../../utils/formatDate';
import './MessageList.css';

// Stable empty array — prevents new reference on every render
const EMPTY_MESSAGES: never[] = [];

const AI_STARTER_PROMPTS = [
  {
    icon: '⚛️',
    title: 'React vs React Native',
    desc: 'What is the main difference between React JS and React Native?',
    prompt: 'What is the difference between React JS and React Native?',
  },
  {
    icon: '⚡',
    title: 'Node.js REST API',
    desc: 'Write a clean Express REST API example with TypeScript',
    prompt: 'Write a clean Node.js REST API example with Express and TypeScript.',
  },
  {
    icon: '🎨',
    title: 'CSS Flexbox vs Grid',
    desc: 'When to use Flexbox vs CSS Grid with real code examples',
    prompt: 'Explain CSS Flexbox vs Grid with real layout examples.',
  },
  {
    icon: '🐞',
    title: 'React useEffect Hook',
    desc: 'How useEffect dependency array works and common pitfalls',
    prompt: 'Explain how React useEffect works with dependencies and cleanups.',
  },
];

export function MessageList() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activeChannel = useChatStore((s) => s.activeChannel);
  const dmChannels = useChatStore((s) => s.dmChannels);
  const messages = useChatStore((s) => (activeChannelId ? s.messages[activeChannelId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES));
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isLoading = useChatStore((s) => s.isLoadingMessages);
  const hasMore = useChatStore((s) => (activeChannelId ? s.hasMore[activeChannelId] : false));
  const loadMoreMessages = useChatStore((s) => s.loadMoreMessages);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const aiTypingChannelId = useUIStore((s) => s.aiTypingChannelId);
  const isAITyping = aiTypingChannelId === activeChannelId;
  const { sendMessage } = useSocketActions();

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const scrollTimeoutRef = useRef<number | null>(null);

  const dmInfo = dmChannels.find((d) => d.id === activeChannelId);
  const isAIChat = activeChannel?.type === 'DIRECT' && (
    activeChannel?.name?.toLowerCase().includes('devchat ai') ||
    dmInfo?.otherUser?.username === 'devchat_ai' ||
    (activeChannel?.createdBy as any)?.username === 'devchat_ai'
  );

  // Continuous chat display for AI conversations
  let displayMessages = messages;
  if (isAIChat && activeSessionId === 'new') {
    displayMessages = EMPTY_MESSAGES;
  }

  const isMemberPanelOpen = useUIStore((s) => s.isMemberPanelOpen);
  const mobileView = useUIStore((s) => s.mobileView);

  // Helper to force scroll to absolute bottom of container
  const scrollToBottomInstant = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, []);

  // Reset scroll to bottom whenever user switches channel
  useEffect(() => {
    isNearBottomRef.current = true;
    prevLengthRef.current = (messages || []).length;
    scrollToBottomInstant();
  }, [activeChannelId, scrollToBottomInstant]);

  // Auto-scroll ONLY when a NEW message is actually appended and user was already at bottom
  useEffect(() => {
    const currentLen = (messages || []).length;
    const prevLen = prevLengthRef.current;
    prevLengthRef.current = currentLen;

    if (currentLen > prevLen) {
      if (isNearBottomRef.current) {
        requestAnimationFrame(scrollToBottomInstant);
      }
    }
  }, [(messages || []).length, scrollToBottomInstant]);

  // When AI is typing, keep scrolled to bottom if user is already near bottom
  useEffect(() => {
    if (isAITyping && isNearBottomRef.current) {
      scrollToBottomInstant();
      const safetyTimer = setTimeout(() => {
        useUIStore.getState().setAITypingChannelId(null);
      }, 15000);
      return () => clearTimeout(safetyTimer);
    }
  }, [isAITyping, scrollToBottomInstant]);

  // ─── Always re-join socket room when channel changes ─────────────────────────
  useEffect(() => {
    if (!activeChannelId) return;
    getSocket()?.emit('channel:join', activeChannelId);
  }, [activeChannelId]);

  // ─── Silent Sync Safety Net ──────────────────────────────────────
  useEffect(() => {
    if (!activeChannelId) return;
    const syncInterval = setInterval(() => {
      const sock = getSocket();
      if (!sock || !sock.connected) {
        messageApi
          .getMessages(activeChannelId)
          .then((data) => {
            if (data && Array.isArray(data.messages)) {
              useChatStore.getState().mergeServerMessages(activeChannelId, data.messages);
            }
          })
          .catch(() => {});
      }
    }, 10000);

    return () => clearInterval(syncInterval);
  }, [activeChannelId]);

  // Ultra-smooth passive scroll handler — zero layout thrashing
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const threshold = 80;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isNearBottomRef.current = distanceFromBottom <= threshold;

    if (container.scrollTop < 80 && hasMore && activeChannelId) {
      if (scrollTimeoutRef.current !== null) return;
      scrollTimeoutRef.current = requestAnimationFrame(() => {
        scrollTimeoutRef.current = null;
        loadMoreMessages(activeChannelId);
      });
    }
  }, [hasMore, activeChannelId, loadMoreMessages]);

  const handlePromptClick = (promptText: string) => {
    if (activeChannelId) {
      sendMessage(activeChannelId, promptText);
    }
  };



  if (!activeChannelId) {
    return (
      <div className="message-list__empty">
        <div className="message-list__empty-content">
          <span className="message-list__empty-icon">💬</span>
          <h3>Welcome to DevChat</h3>
          <p>Select a channel from the sidebar to start chatting</p>
        </div>
      </div>
    );
  }

  // Only show skeleton loader if loading AND no messages exist in store yet
  if (isLoading && displayMessages.length === 0) {
    return (
      <div className="message-list">
        <div className="message-list__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="message-skeleton">
              <div className="message-skeleton__avatar" />
              <div className="message-skeleton__content">
                <div className="message-skeleton__header" />
                <div className="message-skeleton__text" />
                <div className="message-skeleton__text message-skeleton__text--short" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ChatGPT-style Starter Welcome Hero (Centered layout when session is clean)
  if (isAIChat && displayMessages.length === 0) {
    return (
      <div className="message-list message-list--starter" ref={containerRef}>
        <div className="message-list__starter-hero">
          <div className="message-list__starter-icon-wrapper">
            <AILogoIcon size={48} />
          </div>
          <h2 className="message-list__starter-title">How can I help you today?</h2>
          <p className="message-list__starter-sub">
            Ask any technical questions, debug errors, or generate production-ready code.
          </p>

          <div className="message-list__starter-grid">
            {AI_STARTER_PROMPTS.map((card, idx) => (
              <button
                key={idx}
                type="button"
                className="message-list__starter-card"
                onClick={() => handlePromptClick(card.prompt)}
              >
                <div className="message-list__starter-card-top">
                  <span className="message-list__starter-card-icon">{card.icon}</span>
                  <span className="message-list__starter-card-title">{card.title}</span>
                </div>
                <p className="message-list__starter-card-desc">{card.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Group messages with date separators
  let lastDate = '';

  return (
    <div className="message-list" ref={containerRef} onScroll={handleScroll}>
      <div className="message-list__inner">

        {displayMessages.map((message) => {
          const messageDate = new Date(message.createdAt).toDateString();
          const showDateSeparator = messageDate !== lastDate;
          lastDate = messageDate;

          return (
            <div key={message.id} id={`msg-${message.id}`} className="message-list__row">
              {showDateSeparator && (
                <div className="message-list__date-separator">
                  <span className="message-list__date-text">
                    {formatDateSeparator(message.createdAt)}
                  </span>
                </div>
              )}
              <MessageItem message={message} />
            </div>
          );
        })}

        {/* AI Typing Indicator Bubble */}
        {isAITyping && <AITypingBubble />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
