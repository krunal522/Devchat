/**
 * @file Header.tsx
 * @description Main Chat Window Top Header Component.
 * Displays channel title, direct message status ("Active now" / "Last seen..."),
 * global search trigger (Ctrl+K), and channel control actions.
 * 
 * Key Features:
 * - Real-time relative presence status formatter (`formatLastSeenText`).
 * - Global keyboard shortcut binding (`Ctrl+K` for instant search modal).
 * - Member panel toggling & mobile view drawer toggling.
 * 
 * @module Components/Layout/Header
 */

import { useState, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { usePresenceStore, useIsUserOnline } from '../../stores/presenceStore';
import { useToastStore } from '../../stores/toastStore';
import { SearchModal } from '../search/SearchModal';
import { AddMemberModal } from '../channel/AddMemberModal';
import { AIHistoryModal } from '../chat/AIHistoryModal';
import { UserAvatar } from '../user/UserAvatar';
import { userApi } from '../../services/userApi';
import './Header.css';

export function formatLastSeenText(isOnline: boolean, lastSeenAt?: string | Date): string {
  if (isOnline) return '🟢 Active now';
  if (!lastSeenAt) return 'Offline';

  const date = new Date(lastSeenAt);
  if (isNaN(date.getTime())) return 'Offline';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Last seen just now';
  if (diffMins < 60) return `Last seen ${diffMins}m ago`;

  const todayStr = now.toDateString();
  const dateDateStr = date.toDateString();
  if (todayStr === dateDateStr) {
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Last seen today at ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === dateDateStr) {
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Last seen yesterday at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Last seen ${dateStr} at ${timeStr}`;
}

export function Header() {
  const activeChannel = useChatStore((s) => s.activeChannel);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const dmChannels = useChatStore((s) => s.dmChannels);
  const deleteChannelStore = useChatStore((s) => s.deleteChannel);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { toggleMemberPanel, isMemberPanelOpen, setMobileView } = useUIStore();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAIHistoryOpen, setIsAIHistoryOpen] = useState(false);

  // Try to get channel info from store
  const channel = activeChannel || channels.find((c) => c.id === activeChannelId);
  const isAdmin = channel?.myRole === 'ADMIN' || channel?.createdById === currentUserId;

  const isDirect = channel?.type === 'DIRECT';
  const dmInfo = dmChannels.find((d) => d.id === channel?.id);
  const channelNameLower = typeof channel?.name === 'string' ? channel.name.toLowerCase() : '';
  const isAIChat = isDirect && (channelNameLower.includes('devchat ai') || dmInfo?.otherUser?.username === 'devchat_ai' || (channel?.createdBy as any)?.username === 'devchat_ai');

  // Find the other user from channel members if available
  const memberOther = (channel as any)?.members?.find((m: any) => {
    const mId = m.userId || m.user?.id;
    return mId && mId !== currentUserId;
  });
  const memberOtherUserId = memberOther?.user?.id || memberOther?.userId;

  // Derive otherUserId with all fallback mechanisms
  const otherUserId = isDirect
    ? (dmInfo?.otherUser?.id ||
       (channel?.createdBy?.id && channel.createdBy.id !== currentUserId ? channel.createdBy.id : undefined) ||
       memberOtherUserId)
    : undefined;

  const realTimeIsOnline = useIsUserOnline(otherUserId);
  const isOtherUserOnline = isAIChat ? true : realTimeIsOnline;
  const lastSeenAt = dmInfo?.otherUser?.lastSeenAt || (channel?.createdBy as any)?.lastSeenAt;

  const [, setTick] = useState(0);

  // Live timer tick to continuously update relative "Last seen Xm ago" when user is offline
  useEffect(() => {
    if (isOtherUserOnline) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, [isOtherUserOnline]);

  // REST fallback: refresh online status for the DM recipient whenever switching channels
  useEffect(() => {
    if (!otherUserId || isAIChat) return;
    userApi.getOnlineUsers().then((ids) => {
      if (Array.isArray(ids) && ids.length > 0) {
        usePresenceStore.getState().setOnlineUsers(ids);
      }
    }).catch(() => { });
  }, [otherUserId, isAIChat]);

  const handleClearChat = () => {
    if (!channel) return;
    useChatStore.getState().clearChannelMessages(channel.id);
    useToastStore.getState().addToast({
      type: 'info',
      title: 'Chat Cleared',
      message: 'DevChat AI conversation cleared 🧹',
    });
  };

  const handleSelectMessage = async (sessionId: string) => {
    setIsAIHistoryOpen(false);
    if (!channel) return;

    // Ensure all messages loaded and activate selected session
    await useChatStore.getState().loadMessages(channel.id);
    useChatStore.getState().setActiveSessionId(sessionId);
  };

  // Auto-refresh relative last seen text in realtime every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const presenceStatusText = isAIChat
    ? '🟢 Active now (24/7 AI)'
    : isDirect
      ? formatLastSeenText(isOtherUserOnline, lastSeenAt)
      : undefined;

  // Keyboard shortcut (Ctrl+K or Cmd+K) for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDeleteChannel = async () => {
    if (!channel) return;
    if (!confirm(`Are you sure you want to delete channel #${channel.name}? All messages will be permanently deleted.`)) {
      return;
    }

    try {
      await deleteChannelStore(channel.id);
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Channel Deleted',
        message: `#${channel.name} was deleted`,
      });
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Delete Failed',
        message: err.response?.data?.error?.message || 'Could not delete channel',
      });
    }
  };

  return (
    <>
      <header className="chat-header">
        <button
          type="button"
          className="chat-header__back-btn"
          onClick={() => setMobileView('list')}
          title="Back to conversation list"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <div className="chat-header__info" onClick={() => toggleMemberPanel()}>
          {isDirect ? (
            <UserAvatar
              src={dmInfo?.otherUser?.avatarUrl || channel?.createdBy?.avatarUrl}
              displayName={channel?.name || '?'}
              size="sm"
              isOnline={isAIChat ? true : isOtherUserOnline}
              showStatus
            />
          ) : (
            <div className="chat-header__hash-badge">#</div>
          )}

          <div className="chat-header__details">
            <div className="chat-header__title-row">
              <h2 className="chat-header__name">{channel?.name || 'Select a channel'}</h2>
              {isDirect && channel?.description && (
                <span className="chat-header__handle">{channel.description}</span>
              )}
            </div>
            {isDirect ? (
              presenceStatusText && (
                <span className={`chat-header__subtext ${isOtherUserOnline ? 'chat-header__subtext--online' : ''}`}>
                  {presenceStatusText}
                </span>
              )
            ) : (
              channel?.description && (
                <span className="chat-header__subtext">{channel.description}</span>
              )
            )}
          </div>
        </div>

        <div className="chat-header__actions">
          <button
            className="chat-header__search-trigger"
            onClick={() => setIsSearchOpen(true)}
            title="Search messages (Ctrl+K)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="chat-header__btn-text">Search</span>
            <kbd>Ctrl K</kbd>
          </button>



          {channel && (
            <>
              {isAIChat && (
                <button
                  className="chat-header__new-chat-btn"
                  onClick={handleClearChat}
                  title="Clear conversation screen"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span>Clear Chat</span>
                </button>
              )}

              {!isDirect && (
                <button
                  className="chat-header__add-member-btn"
                  onClick={() => setIsAddMemberOpen(true)}
                  title="Add members to channel"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="17" y1="11" x2="23" y2="11" />
                  </svg>
                  <span className="chat-header__btn-text">Add Members</span>
                </button>
              )}

              {!isDirect && isAdmin && (
                <button
                  className="chat-header__delete-channel-btn"
                  onClick={handleDeleteChannel}
                  title="Delete channel (Admin)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span className="chat-header__btn-text">Delete</span>
                </button>
              )}

              <button
                className={`chat-header__members-count-btn ${isMemberPanelOpen ? 'chat-header__members-count-btn--active' : ''}`}
                onClick={toggleMemberPanel}
                title="View channel members"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="chat-header__btn-text">
                  {channel.type === 'DIRECT' ? '2 Members' : `${channel._count?.members || 1} Members`}
                </span>
              </button>

              <button
                className={`chat-header__action-btn ${isMemberPanelOpen ? 'chat-header__action-btn--active' : ''}`}
                onClick={toggleMemberPanel}
                title="Toggle members panel"
              >
                ☰
              </button>
            </>
          )}
        </div>
      </header>

      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      {channel && (
        <AddMemberModal
          isOpen={isAddMemberOpen}
          onClose={() => setIsAddMemberOpen(false)}
          channelId={channel.id}
          channelName={channel.name}
        />
      )}
      {channel && (
        <AIHistoryModal
          isOpen={isAIHistoryOpen}
          onClose={() => setIsAIHistoryOpen(false)}
          channelId={channel.id}
          onSelectMessage={handleSelectMessage}
        />
      )}
    </>
  );
}
