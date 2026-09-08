/**
 * @file MemberPanel.tsx
 * @description Enterprise-grade Right-side Member & Channel Info Drawer Component.
 * Supports desktop slide-over and 100% native mobile Group Info / Channel Details (WhatsApp/Telegram/Slack style).
 *
 * Key Features:
 * - Full native mobile Group Info experience on iPhone & Android (100dvh, iOS safe-areas).
 * - Real-time online/offline presence updates via Socket & presenceStore.
 * - Live member search & filtering (All / Online / Admins).
 * - Quick Action Grid (Add Member, Mute/Unmute, Search Chat, Share/Copy Link).
 * - Admin controls: remove members, delete channel; member control: leave channel.
 * - 0ms instant DM routing when clicking any member row.
 *
 * @module Components/Layout/MemberPanel
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import { channelApi } from '../../services/channelApi';
import { UserAvatar } from '../user/UserAvatar';
import { AddMemberModal } from '../channel/AddMemberModal';
import { usePresenceStore, useIsUserOnline, useUserLastSeen } from '../../stores/presenceStore';
import { formatLastSeenText } from '../../utils/formatPresence';
import { getSocket } from '../../services/socketManager';
import type { UserWithRole } from '../../types/user';
import './MemberPanel.css';

export function MemberPanel() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activeChannel = useChatStore((s) => s.activeChannel);
  const channels = useChatStore((s) => s.channels);
  const dmChannels = useChatStore((s) => s.dmChannels);
  const openDM = useChatStore((s) => s.openDM);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Safe fallback to channels or dmChannels if activeChannel is null
  const channel =
    activeChannel ||
    channels.find((c) => c.id === activeChannelId) ||
    (dmChannels.find((d) => d.id === activeChannelId) as any);

  const isMemberPanelOpen = useUIStore((s) => s.isMemberPanelOpen);
  const closeMemberPanel = useUIStore((s) => s.closeMemberPanel);
  const setMobileView = useUIStore((s) => s.setMobileView);
  const mobileView = useUIStore((s) => s.mobileView);
  const openSearchModal = useUIStore((s) => s.openSearchModal);

  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const isPresenceReady = usePresenceStore((s) => s.isInitialized);

  const [members, setMembers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'online' | 'admins'>('all');

  const isOpen = isMemberPanelOpen || mobileView === 'details';

  const fetchMembers = useCallback(async () => {
    if (!activeChannelId) return;
    setIsLoading(true);
    try {
      const data = await channelApi.getMembers(activeChannelId);
      setMembers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeChannelId]);

  useEffect(() => {
    if (!activeChannelId) return;
    if (isOpen) {
      fetchMembers();
    }

    const socket = getSocket();
    const handleMemberUpdate = (data: { channelId: string }) => {
      if (!data || data.channelId === activeChannelId) {
        fetchMembers();
      }
    };

    socket?.on('channel:member_added', handleMemberUpdate);
    socket?.on('channel:member_removed', handleMemberUpdate);

    return () => {
      socket?.off('channel:member_added', handleMemberUpdate);
      socket?.off('channel:member_removed', handleMemberUpdate);
    };
  }, [activeChannelId, isOpen, fetchMembers]);

  // Direct Message (DM) specific info
  const dmInfo = dmChannels.find((d) => d.id === channel?.id);
  const otherUserObj =
    (channel as any)?.otherUser ||
    dmInfo?.otherUser ||
    (channel?.createdBy?.id && channel.createdBy.id !== currentUserId ? channel.createdBy : undefined);

  const otherUserId = channel?.type === 'DIRECT' ? (otherUserObj?.id || channel?.createdBy?.id) : undefined;
  const realTimeIsOnline = useIsUserOnline(otherUserId);
  const liveLastSeen = useUserLastSeen(otherUserId);
  const isOtherUserOnline = isPresenceReady
    ? realTimeIsOnline
    : (realTimeIsOnline || Boolean(otherUserObj?.isOnline));
  const avatarUrl = otherUserObj?.avatarUrl || channel?.createdBy?.avatarUrl;
  const lastSeenAt = liveLastSeen || otherUserObj?.lastSeenAt || (channel?.createdBy as any)?.lastSeenAt;

  if (!activeChannelId) return null;
  if (!isOpen) return null;

  const safeMembers = Array.isArray(members) ? members : [];
  const isAdmin = channel?.myRole === 'ADMIN' || channel?.createdById === currentUserId;
  const isDirect = channel?.type === 'DIRECT';

  const isMemberOnline = (m: UserWithRole) =>
    isPresenceReady ? onlineUsers.has(m.id) : (onlineUsers.has(m.id) || Boolean(m.isOnline));

  const onlineCount = safeMembers.filter(isMemberOnline).length;
  const adminCount = safeMembers.filter((m) => m.role === 'ADMIN' || m.id === activeChannel?.createdById).length;

  const filteredMembers = safeMembers.filter((m) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      m.displayName?.toLowerCase().includes(query) ||
      m.username?.toLowerCase().includes(query);
    if (!matchesSearch) return false;

    if (filterTab === 'online') return isMemberOnline(m);
    if (filterTab === 'admins') return m.role === 'ADMIN' || m.id === channel?.createdById;
    return true;
  });

  const handleClose = () => {
    closeMemberPanel();
    setMobileView('chat');
  };

  const handleCopyName = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!channel?.name) return;
    navigator.clipboard.writeText(`#${channel.name}`);
    useToastStore.getState().addToast({
      type: 'success',
      title: 'Name Copied',
      message: `#${channel.name} copied to clipboard!`,
    });
  };

  const handleShare = () => {
    if (!channel) return;
    const url = window.location.origin;
    navigator.clipboard.writeText(url).then(() => {
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Invite Link Copied',
        message: 'DevChat invite link copied to clipboard! 📋',
      });
    }).catch(() => {
      handleCopyName({ stopPropagation: () => {} } as any);
    });
  };

  const handleOpenSearch = () => {
    openSearchModal();
    if (mobileView === 'details') {
      closeMemberPanel();
      setMobileView('chat');
    }
  };

  const handleRemoveMember = async (e: React.MouseEvent, memberId: string, displayName: string) => {
    e.stopPropagation();
    if (!activeChannelId || !channel) return;

    if (!confirm(`Are you sure you want to remove ${displayName} from #${channel.name}?`)) {
      return;
    }

    try {
      const updatedMembers = await channelApi.removeMember(activeChannelId, memberId);
      setMembers(updatedMembers);
      await useChatStore.getState().loadChannels();
      await useChatStore.getState().setActiveChannel(activeChannelId);

      useToastStore.getState().addToast({
        type: 'info',
        title: 'Member Removed',
        message: `Removed ${displayName} from #${channel.name}`,
      });
    } catch (err: any) {
      console.error('Failed to remove member:', err);
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Removal Failed',
        message: err.response?.data?.error?.message || 'Could not remove member',
      });
    }
  };

  const handleLeaveChannel = async () => {
    if (!activeChannelId || !channel) return;
    if (!confirm(`Are you sure you want to leave #${channel.name}?`)) return;

    try {
      await channelApi.leaveChannel(activeChannelId);
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Left Channel',
        message: `You have left #${channel.name}`,
      });
      await useChatStore.getState().loadChannels();
      useChatStore.getState().setActiveChannel('');
      closeMemberPanel();
      setMobileView('list');
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Action Failed',
        message: err.response?.data?.error?.message || 'Could not leave channel',
      });
    }
  };

  const handleDeleteChannel = async () => {
    if (!activeChannelId || !channel) return;
    if (!confirm(`Are you sure you want to delete #${channel.name}? All messages will be permanently deleted.`)) return;

    try {
      await useChatStore.getState().deleteChannel(activeChannelId);
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Channel Deleted',
        message: `#${channel.name} was deleted`,
      });
      closeMemberPanel();
      setMobileView('list');
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Delete Failed',
        message: err.response?.data?.error?.message || 'Could not delete channel',
      });
    }
  };

  const formattedCreatedDate = channel?.createdAt
    ? new Date(channel.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const creatorName = channel?.createdBy?.displayName || channel?.createdBy?.username || 'Admin';

  const renderMemberRow = (member: UserWithRole) => {
    const isOnline = isMemberOnline(member);
    const isSelf = member.id === currentUserId;
    const isUserAdmin = member.role === 'ADMIN' || member.id === channel?.createdById;

    return (
      <div key={member.id} className="member-panel__item-wrapper">
        <button
          type="button"
          className={`member-panel__item ${!isOnline ? 'member-panel__item--offline' : ''}`}
          onClick={() => {
            if (!isSelf) {
              openDM(member.id, member);
              closeMemberPanel();
              setMobileView('chat');
            }
          }}
          title={isSelf ? 'You' : `Message ${member.displayName}`}
        >
          <UserAvatar
            src={member.avatarUrl}
            displayName={member.displayName}
            size="sm"
            isOnline={isOnline}
            showStatus
          />
          <div className="member-panel__user-info">
            <div className="member-panel__user-header">
              <span className="member-panel__user-name">{member.displayName}</span>
              {isSelf && <span className="member-panel__self-badge">You</span>}
              {isUserAdmin && <span className="member-panel__admin-badge">👑 Admin</span>}
            </div>
            <div className="member-panel__user-subtext">
              <span className="member-panel__handle">@{member.username}</span>
              <span className="member-panel__status-dot-text">
                • {isOnline ? 'Active now' : 'Offline'}
              </span>
            </div>
          </div>
        </button>

        {!isSelf && (
          <div className="member-panel__item-actions">
            <button
              type="button"
              className="member-panel__dm-btn"
              onClick={() => {
                openDM(member.id, member);
                closeMemberPanel();
                setMobileView('chat');
              }}
              title={`Direct message ${member.displayName}`}
            >
              💬
            </button>

            {isAdmin && (
              <button
                type="button"
                className="member-panel__remove-btn"
                onClick={(e) => handleRemoveMember(e, member.id, member.displayName)}
                title={`Remove ${member.displayName} from channel`}
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        className="member-panel-backdrop"
        onClick={handleClose}
        aria-hidden="true"
      />
      <aside className="member-panel" aria-label="Channel Details & Members">
        {/* iOS-Style Top Navigation Bar */}
        <div className="member-panel__header">
          <button
            type="button"
            className="member-panel__mobile-back"
            onClick={handleClose}
            aria-label="Back to chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Back</span>
          </button>

          <div className="member-panel__header-title-wrap">
            <h3 className="member-panel__header-title">
              {isDirect ? 'User Info' : 'Group Info'}
            </h3>
            {!isDirect && (
              <span className="member-panel__header-sub">
                {safeMembers.length} {safeMembers.length === 1 ? 'member' : 'members'}
              </span>
            )}
          </div>

          <button
            type="button"
            className="member-panel__close"
            onClick={handleClose}
            aria-label="Close panel"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Main Body */}
        <div className="member-panel__scroll-container">
          {/* Hero Profile View */}
          <div className="member-panel__hero">
            <div className="member-panel__hero-avatar">
              {isDirect ? (
                <UserAvatar
                  src={avatarUrl}
                  displayName={channel?.name || 'User'}
                  size="lg"
                  isOnline={isOtherUserOnline}
                  showStatus
                />
              ) : (
                <div className="member-panel__hash-lg" aria-hidden="true">
                  #
                </div>
              )}
            </div>

            <div className="member-panel__hero-title-row">
              <h2 className="member-panel__hero-name">
                {isDirect ? (channel?.name || 'Direct Chat') : `#${channel?.name || 'Channel'}`}
              </h2>
              {!isDirect && (
                <button
                  type="button"
                  className="member-panel__copy-badge"
                  onClick={handleCopyName}
                  title="Copy channel name"
                >
                  📋
                </button>
              )}
            </div>

            <div className="member-panel__channel-pill-row">
              <span className="member-panel__type-pill">
                {isDirect
                  ? '👤 Direct Chat'
                  : channel?.type === 'PRIVATE'
                    ? '🔒 Private Group'
                    : '🌐 Public Channel'}
              </span>
              {!isDirect && (
                <span className="member-panel__online-pill">
                  <span className="member-panel__green-dot" />
                  {onlineCount} Online
                </span>
              )}
            </div>

            {isDirect && (
              <span className="member-panel__hero-presence">
                {formatLastSeenText(isOtherUserOnline, lastSeenAt)}
              </span>
            )}

            {/* Description / About Card */}
            <div className="member-panel__desc-card">
              <span className="member-panel__desc-label">ABOUT</span>
              <p className="member-panel__channel-desc">
                {channel?.description || 'No description provided for this channel.'}
              </p>
              {formattedCreatedDate && (
                <div className="member-panel__meta-info">
                  Created by <span className="member-panel__meta-highlight">{creatorName}</span> on {formattedCreatedDate}
                </div>
              )}
            </div>
          </div>

          {/* Quick Action Grid (WhatsApp / Telegram 4-button pill bar) */}
          <div className="member-panel__actions-grid">
            {!isDirect ? (
              <button
                type="button"
                className="member-panel__action-card"
                onClick={() => setIsAddMemberModalOpen(true)}
                title="Add members to channel"
              >
                <div className="member-panel__action-icon-circle">➕</div>
                <span className="member-panel__action-label">Add</span>
              </button>
            ) : (
              <button
                type="button"
                className="member-panel__action-card"
                onClick={() => {
                  if (otherUserId && otherUserObj) {
                    openDM(otherUserId, otherUserObj);
                    handleClose();
                  }
                }}
                title="Direct Message"
              >
                <div className="member-panel__action-icon-circle">💬</div>
                <span className="member-panel__action-label">Message</span>
              </button>
            )}

            <button
              type="button"
              className={`member-panel__action-card ${isMuted ? 'member-panel__action-card--active' : ''}`}
              onClick={() => {
                setIsMuted(!isMuted);
                useToastStore.getState().addToast({
                  type: 'info',
                  title: isMuted ? 'Notifications Unmuted' : 'Notifications Muted',
                  message: isMuted ? 'You will get alerts' : 'Notifications muted for this channel',
                });
              }}
              title={isMuted ? 'Unmute alerts' : 'Mute alerts'}
            >
              <div className="member-panel__action-icon-circle">
                {isMuted ? '🔕' : '🔔'}
              </div>
              <span className="member-panel__action-label">{isMuted ? 'Muted' : 'Mute'}</span>
            </button>

            <button
              type="button"
              className="member-panel__action-card"
              onClick={handleOpenSearch}
              title="Search conversation (Ctrl+K)"
            >
              <div className="member-panel__action-icon-circle">🔍</div>
              <span className="member-panel__action-label">Search</span>
            </button>

            <button
              type="button"
              className="member-panel__action-card"
              onClick={handleShare}
              title="Share / Copy Link"
            >
              <div className="member-panel__action-icon-circle">🔗</div>
              <span className="member-panel__action-label">Share</span>
            </button>
          </div>

          {/* Members Section */}
          <div className="member-panel__content">
            {!isDirect && (
              <div className="member-panel__members-header">
                <div className="member-panel__search-bar">
                  <span className="member-panel__search-icon">🔍</span>
                  <input
                    type="text"
                    className="member-panel__search-input"
                    placeholder="Search members..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="member-panel__clear-search"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="member-panel__filter-tabs">
                  <button
                    type="button"
                    className={`member-panel__tab-btn ${filterTab === 'all' ? 'member-panel__tab-btn--active' : ''}`}
                    onClick={() => setFilterTab('all')}
                  >
                    All ({safeMembers.length})
                  </button>
                  <button
                    type="button"
                    className={`member-panel__tab-btn ${filterTab === 'online' ? 'member-panel__tab-btn--active' : ''}`}
                    onClick={() => setFilterTab('online')}
                  >
                    🟢 Online ({onlineCount})
                  </button>
                  <button
                    type="button"
                    className={`member-panel__tab-btn ${filterTab === 'admins' ? 'member-panel__tab-btn--active' : ''}`}
                    onClick={() => setFilterTab('admins')}
                  >
                    👑 Admins ({adminCount})
                  </button>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="member-panel__loading">
                <div className="member-panel__spinner" />
                <span>Loading channel members...</span>
              </div>
            ) : (
              <>
                {filteredMembers.length === 0 && (
                  <div className="member-panel__empty-state">
                    <div className="member-panel__empty-icon">👥</div>
                    <p className="member-panel__empty-title">
                      {searchQuery ? `No members found matching "${searchQuery}"` : 'No members loaded'}
                    </p>
                    <div className="member-panel__empty-actions">
                      <button
                        type="button"
                        className="member-panel__refresh-btn"
                        onClick={() => {
                          setSearchQuery('');
                          fetchMembers();
                        }}
                      >
                        ↻ Refresh List
                      </button>
                      {!isDirect && (
                        <button
                          type="button"
                          className="member-panel__add-btn-cta"
                          onClick={() => setIsAddMemberModalOpen(true)}
                        >
                          + Add Members
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {filteredMembers.length > 0 && (
                  <div className="member-panel__list" role="list">
                    {filteredMembers.map(renderMemberRow)}
                  </div>
                )}
              </>
            )}

            {/* Channel Management Danger Zone */}
            {!isDirect && (
              <div className="member-panel__danger-zone">
                {isAdmin ? (
                  <button
                    type="button"
                    className="member-panel__danger-btn"
                    onClick={handleDeleteChannel}
                    title="Delete channel permanently"
                  >
                    <span className="member-panel__danger-icon">🗑️</span>
                    <span>Delete Channel</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="member-panel__leave-btn"
                    onClick={handleLeaveChannel}
                    title="Leave this channel"
                  >
                    <span className="member-panel__danger-icon">🚪</span>
                    <span>Leave Channel</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {activeChannel && (
        <AddMemberModal
          isOpen={isAddMemberModalOpen}
          onClose={() => {
            setIsAddMemberModalOpen(false);
            fetchMembers();
          }}
          channelId={activeChannel.id}
          channelName={activeChannel.name}
        />
      )}
    </>
  );
}
