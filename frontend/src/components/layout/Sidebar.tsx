import { useEffect, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { usePresenceStore, useIsUserOnline } from '../../stores/presenceStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { UserAvatar } from '../user/UserAvatar';
import { CreateChannelModal } from '../channel/CreateChannelModal';
import { StartDMModal } from '../channel/StartDMModal';
import { EditProfileModal } from '../user/EditProfileModal';
import { LogoutConfirmModal } from '../auth/LogoutConfirmModal';
import { WorkspaceSelector } from '../workspace/WorkspaceSelector';
import { channelApi } from '../../services/channelApi';
import { userApi } from '../../services/userApi';
import { AILogoIcon } from '../ui/AILogoIcon';
import type { DMChannel } from '../../types/channel';
import './Sidebar.css';

function SidebarDMItem({
  dm,
  isActive,
  unread,
  onSelect,
}: {
  dm: DMChannel;
  isActive: boolean;
  unread: number;
  onSelect: () => void;
}) {
  const otherUserId = dm.otherUser?.id;
  const realTimeIsOnline = useIsUserOnline(otherUserId);
  const isAI = dm.otherUser?.username === 'devchat_ai' || dm.otherUser?.id === 'devchat-ai-bot-id';
  const isOnline = isAI ? true : realTimeIsOnline || Boolean(dm.otherUser?.isOnline);

  return (
    <button
      className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''} ${unread > 0 ? 'sidebar__item--unread' : ''}`}
      onClick={onSelect}
    >
      <UserAvatar
        src={dm.otherUser?.avatarUrl}
        displayName={dm.otherUser?.displayName || dm.otherUser?.username || '?'}
        size="xs"
        isOnline={isOnline}
        showStatus
      />
      <span className="sidebar__item-name">
        {dm.otherUser?.displayName || dm.otherUser?.username || 'Unknown'}
      </span>
      {unread > 0 && (
        <span className="sidebar__unread-badge">{unread > 99 ? '99+' : unread}</span>
      )}
    </button>
  );
}

export function Sidebar() {
  const channels = useChatStore((s) => s.channels);
  const dmChannels = useChatStore((s) => s.dmChannels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const loadChannels = useChatStore((s) => s.loadChannels);
  const loadDMChannels = useChatStore((s) => s.loadDMChannels);
  const user = useAuthStore((s) => s.user);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const {
    openCreateChannelModal,
    isCreateChannelModalOpen,
    closeCreateChannelModal,
    openStartDMModal,
    isStartDMModalOpen,
    closeStartDMModal,
    setMobileView,
  } = useUIStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  const handleSelectChannel = (id: string) => {
    setActiveChannel(id);
    setMobileView('chat');
  };

  const handleOpenAIChat = async () => {
    try {
      const channel = await channelApi.getOrCreateDM('devchat-ai-bot-id');
      await loadDMChannels();
      setActiveChannel(channel.id);
      setMobileView('chat');
    } catch (err) {
      console.error('Failed to open AI Chat:', err);
      openStartDMModal();
    }
  };

  useEffect(() => {
    loadChannels();
    loadDMChannels();

    const fetchOnlineUsers = () => {
      userApi
        .getOnlineUsers()
        .then((userIds) => {
          if (userIds && Array.isArray(userIds) && userIds.length > 0) {
            usePresenceStore.getState().setOnlineUsers(userIds);
          }
        })
        .catch(() => {});
    };

    fetchOnlineUsers();
    const interval = setInterval(fetchOnlineUsers, 5000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchOnlineUsers();
        loadDMChannels();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const workspaceMembers = useWorkspaceStore((s) => s.members);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const publicChannels = channels.filter((c) => c.type !== 'DIRECT');
  const filteredChannels = searchQuery
    ? publicChannels.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : publicChannels;

  // Deduplicate active DM channels by target recipient user ID (Exclude AI bot, self-DMs, and null otherUser)
  const currentUserId = useAuthStore((s) => s.user?.id);
  const uniqueDMMap = new Map<string, typeof dmChannels[0]>();
  dmChannels.forEach((dm) => {
    // Skip if no otherUser (malformed DM channel)
    if (!dm.otherUser) return;
    // Skip AI bot
    if (dm.otherUser.username === 'devchat_ai' || dm.otherUser.id === 'devchat-ai-bot-id') return;
    // Skip self-DMs (where otherUser is the current user — happens with duplicate channel entries)
    if (dm.otherUser.id === currentUserId) return;

    const targetId = dm.otherUser.id;
    if (!uniqueDMMap.has(targetId)) {
      uniqueDMMap.set(targetId, dm);
    }
  });
  const filteredDMChannels = Array.from(uniqueDMMap.values());

  // Calculate Overall Total Unread Counts
  const totalChannelsUnread = publicChannels.reduce((sum, c) => sum + (unreadCounts[c.id] || 0), 0);
  const totalDMsUnread = filteredDMChannels.reduce((sum, d) => sum + (unreadCounts[d.id] || 0), 0);
  const totalUnread = totalChannelsUnread + totalDMsUnread;

  // Update browser tab document title dynamically with unread count (e.g. "(3) DevChat")
  useEffect(() => {
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) DevChat — Real-time Messaging`;
    } else {
      document.title = 'DevChat — Real-time Messaging';
    }
  }, [totalUnread]);

  return (
    <>
      <aside className="sidebar glass">
        {/* Enterprise Workspace Selector Bar */}
        <WorkspaceSelector />

        {/* Search */}
        <div className="sidebar__search">
          <input
            type="text"
            className="sidebar__search-input"
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="sidebar__search-icon">🔍</span>
        </div>

        <div className="sidebar__content">
          {/* 🤖 Free AI Assistant Quick Launcher */}
          <div className="sidebar__ai-section">
            <button
              type="button"
              className="sidebar__ai-btn"
              onClick={handleOpenAIChat}
              title="Start a 1-on-1 chat with Free DevChat AI Assistant"
            >
              <div className="sidebar__ai-icon-box">
                <AILogoIcon size={24} />
                <span className="sidebar__ai-online-dot" />
              </div>
              <div className="sidebar__ai-meta">
                <span className="sidebar__ai-title">DevChat AI</span>
                <span className="sidebar__ai-sub">Free AI Coding Assistant</span>
              </div>
              <span className="sidebar__ai-badge">AI</span>
            </button>
          </div>

          {/* Channels Section */}
          <div className="sidebar__section">
            <div className="sidebar__section-header">
              <span className="sidebar__section-title">
                Channels {totalChannelsUnread > 0 && <span className="sidebar__section-count">({totalChannelsUnread})</span>}
              </span>
              <button
                className="sidebar__add-btn"
                onClick={openCreateChannelModal}
                title="Create channel"
              >
                +
              </button>
            </div>

            <div className="sidebar__list">
              {filteredChannels.map((channel) => {
                const unread = unreadCounts[channel.id] || 0;
                const isActive = activeChannelId === channel.id;

                return (
                  <button
                    key={channel.id}
                    className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''} ${unread > 0 ? 'sidebar__item--unread' : ''}`}
                    onClick={() => handleSelectChannel(channel.id)}
                  >
                    <span className="sidebar__item-hash">#</span>
                    <span className="sidebar__item-name">{channel.name}</span>
                    {unread > 0 && (
                      <span className="sidebar__unread-badge">{unread > 99 ? '99+' : unread}</span>
                    )}
                    {!channel.isMember && unread === 0 && (
                      <span className="sidebar__item-badge">Join</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Direct Messages Section */}
          <div className="sidebar__section">
            <div className="sidebar__section-header">
              <span className="sidebar__section-title">
                Direct Messages {totalDMsUnread > 0 && <span className="sidebar__section-count">({totalDMsUnread})</span>}
              </span>
              <button
                className="sidebar__add-btn"
                onClick={openStartDMModal}
                title="Start a direct message"
              >
                +
              </button>
            </div>

            <div className="sidebar__list">
              {filteredDMChannels.map((dm) => (
                <SidebarDMItem
                  key={dm.id}
                  dm={dm}
                  isActive={activeChannelId === dm.id}
                  unread={unreadCounts[dm.id] || 0}
                  onSelect={() => handleSelectChannel(dm.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* User Panel */}
        <div className="sidebar__user">
          <div className="sidebar__user-details" onClick={() => setIsEditProfileOpen(true)} title="Click to edit profile">
            <UserAvatar
              src={user?.avatarUrl}
              displayName={user?.displayName || ''}
              size="sm"
              isOnline={true}
              showStatus
            />
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">{user?.displayName}</span>
              <span className="sidebar__user-status">{user?.statusText || 'Set a status...'}</span>
            </div>
          </div>
          <button
            className="sidebar__logout-btn"
            onClick={() => setIsLogoutConfirmOpen(true)}
            title="Sign Out"
            aria-label="Sign Out"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <CreateChannelModal isOpen={isCreateChannelModalOpen} onClose={closeCreateChannelModal} />
      <StartDMModal isOpen={isStartDMModalOpen} onClose={closeStartDMModal} />
      <EditProfileModal isOpen={isEditProfileOpen} onClose={() => setIsEditProfileOpen(false)} />
      <LogoutConfirmModal isOpen={isLogoutConfirmOpen} onClose={() => setIsLogoutConfirmOpen(false)} />
    </>
  );
}
