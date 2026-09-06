import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useSocketActions } from '../../hooks/useSocket';
import { userApi } from '../../services/userApi';
import { UserAvatar } from '../user/UserAvatar';
import type { User } from '../../types/user';
import './WelcomeDashboard.css';

export function WelcomeDashboard() {
  const user = useAuthStore((s) => s.user);
  const channels = useChatStore((s) => s.channels);
  const dmChannels = useChatStore((s) => s.dmChannels);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const openDM = useChatStore((s) => s.openDM);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const { sendMessage } = useSocketActions();

  const {
    openCreateChannelModal,
    openStartDMModal,
    openSearchModal,
    setMobileView,
  } = useUIStore();

  const [workspaceUsers, setWorkspaceUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  useEffect(() => {
    setIsLoadingUsers(true);
    userApi
      .getUsers()
      .then((users) => {
        if (Array.isArray(users)) {
          // Exclude self and DevChat AI bot
          setWorkspaceUsers(
            users.filter(
              (u) =>
                u.id !== user?.id &&
                u.username !== 'devchat_ai' &&
                u.id !== 'devchat-ai-bot-id'
            )
          );
        }
      })
      .catch((err) => console.error('Failed to load workspace users:', err))
      .finally(() => setIsLoadingUsers(false));
  }, [user?.id]);

  const publicChannels = channels.filter((c) => c.type !== 'DIRECT');

  const handleSelectChannel = (channelId: string) => {
    setActiveChannel(channelId);
    setMobileView('chat');
  };

  const handleOpenDMWithUser = async (targetUser: User) => {
    await openDM(targetUser.id, targetUser);
    setMobileView('chat');
  };

  const handleLaunchAIChat = async (initialPrompt?: string) => {
    setMobileView('chat');
    const existingAIDM = dmChannels.find(
      (d) =>
        d.otherUser?.username === 'devchat_ai' ||
        d.otherUser?.id === 'devchat-ai-bot-id'
    );

    let targetChannelId = existingAIDM?.id;

    if (!targetChannelId) {
      const aiUser = {
        id: 'devchat-ai-bot-id',
        username: 'devchat_ai',
        displayName: '🤖 DevChat AI',
        avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=DevChatAI',
        isOnline: true,
      };
      await openDM('devchat-ai-bot-id', aiUser);
      const updatedDM = useChatStore
        .getState()
        .dmChannels.find(
          (d) =>
            d.otherUser?.username === 'devchat_ai' ||
            d.otherUser?.id === 'devchat-ai-bot-id'
        );
      targetChannelId = updatedDM?.id || 'devchat-ai-bot-id';
    } else {
      await setActiveChannel(targetChannelId);
    }

    if (initialPrompt && targetChannelId) {
      setTimeout(() => {
        sendMessage(targetChannelId!, initialPrompt);
      }, 150);
    }
  };

  const displayName = user?.displayName || user?.username || 'Developer';
  const onlineCount = onlineUsers.size > 0 ? onlineUsers.size : 1;

  return (
    <div className="welcome-dashboard">
      <div className="welcome-dashboard__ambient-mesh" />
      <div className="welcome-dashboard__grid-pattern" />

      <div className="welcome-dashboard__container">
        {/* Top Hero Section */}
        <header className="welcome-dashboard__hero">
          <div className="welcome-dashboard__badge">
            <span className="welcome-dashboard__badge-pulse" />
            <span className="welcome-dashboard__badge-text">
              WebSocket Core Live • Latency &lt; 15ms
            </span>
          </div>

          <h1 className="welcome-dashboard__title">
            Welcome back, <span className="welcome-dashboard__title-gradient">{displayName}</span> 👋
          </h1>
          <p className="welcome-dashboard__subtitle">
            Your high-velocity engineering workspace is synchronized and ready.
            Collaborate in real time, build with our AI co-pilot, or jump into team channels.
          </p>
        </header>

        {/* 4 Interactive Command Cards */}
        <div className="welcome-dashboard__grid">
          {/* Card 1: DevChat AI Assistant */}
          <section className="welcome-card welcome-card--ai">
            <div className="welcome-card__header">
              <div className="welcome-card__icon welcome-card__icon--ai">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                  <rect x="3" y="8" width="18" height="12" rx="4" />
                  <circle cx="9" cy="14" r="1.5" />
                  <circle cx="15" cy="14" r="1.5" />
                  <path d="M9 18h6" />
                </svg>
              </div>
              <span className="welcome-card__tag welcome-card__tag--ai">AI CO-PILOT</span>
            </div>

            <h2 className="welcome-card__title">DevChat AI Assistant</h2>
            <p className="welcome-card__description">
              Supercharge your engineering workflow with real-time code reviews, SQL query debugging, and architectural diagrams.
            </p>

            <div className="welcome-card__ai-prompts">
              <span className="welcome-card__label">Quick Prompts:</span>
              <button
                type="button"
                className="welcome-card__prompt-chip"
                onClick={() => handleLaunchAIChat('Explain WebSocket vs SSE architecture with code examples')}
              >
                ⚡ WebSocket vs SSE
              </button>
              <button
                type="button"
                className="welcome-card__prompt-chip"
                onClick={() => handleLaunchAIChat('How do I optimize PostgreSQL query indexes in Neon?')}
              >
                🛠️ Optimize Neon SQL
              </button>
              <button
                type="button"
                className="welcome-card__prompt-chip"
                onClick={() => handleLaunchAIChat('Review React TypeScript component state best practices')}
              >
                ⚛️ React State Review
              </button>
            </div>

            <button
              type="button"
              className="welcome-card__action-btn welcome-card__action-btn--primary"
              onClick={() => handleLaunchAIChat()}
            >
              <span>Launch AI Session</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </section>

          {/* Card 2: Workspace Channels */}
          <section className="welcome-card welcome-card--channels">
            <div className="welcome-card__header">
              <div className="welcome-card__icon welcome-card__icon--channels">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="9" x2="20" y2="9" />
                  <line x1="4" y1="15" x2="20" y2="15" />
                  <line x1="10" y1="3" x2="8" y2="21" />
                  <line x1="16" y1="3" x2="14" y2="21" />
                </svg>
              </div>
              <span className="welcome-card__tag">CHANNELS</span>
            </div>

            <h2 className="welcome-card__title">Team Channels</h2>
            <p className="welcome-card__description">
              Jump into specialized channels to catch up on project updates, designs, code commits, and discussions.
            </p>

            <div className="welcome-card__channel-list">
              {publicChannels.slice(0, 6).map((chan) => (
                <button
                  key={chan.id}
                  type="button"
                  className="welcome-card__channel-chip"
                  onClick={() => handleSelectChannel(chan.id)}
                  title={`Open #${chan.name}`}
                >
                  <span className="welcome-card__channel-hash">#</span>
                  <span className="welcome-card__channel-name">{chan.name}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="welcome-card__action-btn welcome-card__action-btn--secondary"
              onClick={openCreateChannelModal}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create New Channel</span>
            </button>
          </section>

          {/* Card 3: Teammates & Direct Messages */}
          <section className="welcome-card welcome-card--team">
            <div className="welcome-card__header">
              <div className="welcome-card__icon welcome-card__icon--team">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <span className="welcome-card__tag">DIRECT MESSAGES</span>
            </div>

            <h2 className="welcome-card__title">Collaborate 1-on-1</h2>
            <p className="welcome-card__description">
              Message colleagues directly with live typing indicators, batch file attachments, and instant voice notes.
            </p>

            <div className="welcome-card__teammates-list">
              {workspaceUsers.slice(0, 4).map((member) => {
                const isOnline = onlineUsers.has(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    className="welcome-card__teammate-item"
                    onClick={() => handleOpenDMWithUser(member)}
                    title={`Start DM with ${member.displayName || member.username}`}
                  >
                    <UserAvatar
                      src={member.avatarUrl}
                      displayName={member.displayName || member.username}
                      size="sm"
                      isOnline={isOnline}
                      showStatus
                    />
                    <div className="welcome-card__teammate-info">
                      <span className="welcome-card__teammate-name">
                        {member.displayName || member.username}
                      </span>
                      <span className={`welcome-card__teammate-status ${isOnline ? 'welcome-card__teammate-status--online' : ''}`}>
                        {isOnline ? 'Active now' : `@${member.username}`}
                      </span>
                    </div>
                  </button>
                );
              })}
              {workspaceUsers.length === 0 && !isLoadingUsers && (
                <div className="welcome-card__teammates-empty">
                  No other members registered yet.
                </div>
              )}
            </div>

            <button
              type="button"
              className="welcome-card__action-btn welcome-card__action-btn--secondary"
              onClick={openStartDMModal}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span>Start Direct Message</span>
            </button>
          </section>

          {/* Card 4: Global Search & Productivity Tools */}
          <section className="welcome-card welcome-card--search">
            <div className="welcome-card__header">
              <div className="welcome-card__icon welcome-card__icon--search">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <span className="welcome-card__tag">COMMAND PALETTE</span>
            </div>

            <h2 className="welcome-card__title">Spotlight Search</h2>
            <p className="welcome-card__description">
              Instantly index and find any message, code snippet, attached file, or colleague across your entire workspace.
            </p>

            <button
              type="button"
              className="welcome-card__search-preview"
              onClick={openSearchModal}
            >
              <span className="welcome-card__search-icon">🔍</span>
              <span className="welcome-card__search-placeholder">Search messages, files &amp; users...</span>
              <kbd className="welcome-card__search-kbd">Ctrl K</kbd>
            </button>

            <div className="welcome-card__shortcuts">
              <div className="welcome-card__shortcut-row">
                <span className="welcome-card__shortcut-desc">Global Search</span>
                <span className="welcome-card__shortcut-keys"><kbd>Ctrl</kbd> + <kbd>K</kbd></span>
              </div>
              <div className="welcome-card__shortcut-row">
                <span className="welcome-card__shortcut-desc">Send Message</span>
                <span className="welcome-card__shortcut-keys"><kbd>Enter</kbd></span>
              </div>
              <div className="welcome-card__shortcut-row">
                <span className="welcome-card__shortcut-desc">New Line</span>
                <span className="welcome-card__shortcut-keys"><kbd>Shift</kbd> + <kbd>Enter</kbd></span>
              </div>
            </div>
          </section>
        </div>

        {/* Bottom Workspace Pulse Strip */}
        <footer className="welcome-dashboard__pulse-bar">
          <div className="welcome-pulse-item">
            <span className="welcome-pulse-item__icon">⚡</span>
            <div className="welcome-pulse-item__content">
              <span className="welcome-pulse-item__label">&lt; 15ms Latency</span>
              <span className="welcome-pulse-item__sub">WebSocket Socket Engine</span>
            </div>
          </div>

          <div className="welcome-pulse-item">
            <span className="welcome-pulse-item__icon">👥</span>
            <div className="welcome-pulse-item__content">
              <span className="welcome-pulse-item__label">{onlineCount} Active Online</span>
              <span className="welcome-pulse-item__sub">Real-Time Presence</span>
            </div>
          </div>

          <div className="welcome-pulse-item">
            <span className="welcome-pulse-item__icon">📁</span>
            <div className="welcome-pulse-item__content">
              <span className="welcome-pulse-item__label">Multi-File &amp; Voice</span>
              <span className="welcome-pulse-item__sub">Batch Uploads &amp; Audio</span>
            </div>
          </div>

          <div className="welcome-pulse-item">
            <span className="welcome-pulse-item__icon">🔒</span>
            <div className="welcome-pulse-item__content">
              <span className="welcome-pulse-item__label">Enterprise Core</span>
              <span className="welcome-pulse-item__sub">Neon PostgreSQL DB</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
