import React, { useEffect, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import { channelApi } from '../../services/channelApi';
import { UserAvatar } from '../user/UserAvatar';
import { usePresenceStore, useIsUserOnline } from '../../stores/presenceStore';
import { formatLastSeenText } from './Header';
import type { UserWithRole } from '../../types/user';
import './MemberPanel.css';

export function MemberPanel() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activeChannel = useChatStore((s) => s.activeChannel);
  const dmChannels = useChatStore((s) => s.dmChannels);
  const openDM = useChatStore((s) => s.openDM);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isMemberPanelOpen = useUIStore((s) => s.isMemberPanelOpen);
  const toggleMemberPanel = useUIStore((s) => s.toggleMemberPanel);
  const setMobileView = useUIStore((s) => s.setMobileView);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);

  const [members, setMembers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const mobileView = useUIStore((s) => s.mobileView);

  useEffect(() => {
    if (!activeChannelId) return;

    setIsLoading(true);
    channelApi
      .getMembers(activeChannelId)
      .then(setMembers)
      .catch((err) => console.error('Failed to load members:', err))
      .finally(() => setIsLoading(false));
  }, [activeChannelId]);

  const dmInfo = dmChannels.find((d) => d.id === activeChannel?.id);
  const otherUserId = activeChannel?.type === 'DIRECT' ? (dmInfo?.otherUser?.id || activeChannel?.createdBy?.id) : undefined;
  const isOtherUserOnline = useIsUserOnline(otherUserId) || Boolean(dmInfo?.otherUser?.isOnline);
  const avatarUrl = dmInfo?.otherUser?.avatarUrl || activeChannel?.createdBy?.avatarUrl;
  const lastSeenAt = dmInfo?.otherUser?.lastSeenAt || (activeChannel?.createdBy as any)?.lastSeenAt;

  if (!activeChannelId) return null;
  if (!isMemberPanelOpen && mobileView !== 'details') return null;

  const safeMembers = Array.isArray(members) ? members : [];
  const isAdmin = activeChannel?.myRole === 'ADMIN' || activeChannel?.createdById === currentUserId;
  const isMemberOnline = (m: UserWithRole) => onlineUsers.has(m.id) || Boolean(m.isOnline);
  const onlineMembers = safeMembers.filter(isMemberOnline);
  const offlineMembers = safeMembers.filter((m) => !isMemberOnline(m));

  const handleClose = () => {
    toggleMemberPanel();
    setMobileView('chat');
  };

  const handleRemoveMember = async (e: React.MouseEvent, memberId: string, displayName: string) => {
    e.stopPropagation();
    if (!activeChannelId || !activeChannel) return;

    if (!confirm(`Are you sure you want to remove ${displayName} from #${activeChannel.name}?`)) {
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
        message: `Removed ${displayName} from #${activeChannel.name}`,
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

  const renderMemberRow = (member: UserWithRole, isOnline: boolean) => (
    <div key={member.id} className="member-panel__item-wrapper">
      <button
        className={`member-panel__item ${!isOnline ? 'member-panel__item--offline' : ''}`}
        onClick={() => {
          if (member.id !== currentUserId) {
            openDM(member.id);
            setMobileView('chat');
          }
        }}
        title={member.id === currentUserId ? 'You' : `Message ${member.displayName}`}
      >
        <UserAvatar
          src={member.avatarUrl}
          displayName={member.displayName}
          size="sm"
          isOnline={isOnline}
          showStatus
        />
        <div className="member-panel__user-info">
          <span className="member-panel__user-name">{member.displayName}</span>
          {member.role === 'ADMIN' && (
            <span className="member-panel__admin-badge">Admin</span>
          )}
        </div>
      </button>

      {isAdmin && member.id !== currentUserId && member.role !== 'ADMIN' && (
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
  );

  return (
    <aside className="member-panel">
      {/* Top Mobile/Desktop Navigation Header */}
      <div className="member-panel__header">
        <button type="button" className="member-panel__mobile-back" onClick={handleClose}>
          ← Back to Chat
        </button>
        <h3>{activeChannel?.type === 'DIRECT' ? 'User Info' : 'Group Details'}</h3>
        <button className="member-panel__close" onClick={handleClose} aria-label="Close">
          ✕
        </button>
      </div>

      {/* Hero Profile View */}
      <div className="member-panel__hero">
        <div className="member-panel__hero-avatar">
          {activeChannel?.type === 'DIRECT' ? (
            <UserAvatar
              src={avatarUrl}
              displayName={activeChannel.name}
              size="lg"
              isOnline={isOtherUserOnline}
              showStatus
            />
          ) : (
            <div className="member-panel__hash-lg">#</div>
          )}
        </div>
        <h2 className="member-panel__hero-name">{activeChannel?.name || 'Channel'}</h2>
        <span className="member-panel__hero-type">
          {activeChannel?.type === 'DIRECT'
            ? formatLastSeenText(isOtherUserOnline, lastSeenAt)
            : `${safeMembers.length} Members`}
        </span>

        {activeChannel?.description && (
          <p className="member-panel__channel-desc">{activeChannel.description}</p>
        )}
      </div>

      {/* Quick Action Grid */}
      <div className="member-panel__actions-grid">
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
        >
          <span className="member-panel__action-icon">{isMuted ? '🔕' : '🔔'}</span>
          <span className="member-panel__action-label">{isMuted ? 'Muted' : 'Mute'}</span>
        </button>

        <button
          type="button"
          className="member-panel__action-card"
          onClick={() => {
            useToastStore.getState().addToast({
              type: 'info',
              title: 'Media & Docs',
              message: 'Showing shared attachments...',
            });
          }}
        >
          <span className="member-panel__action-icon">📁</span>
          <span className="member-panel__action-label">Media & Docs</span>
        </button>

        <button
          type="button"
          className="member-panel__action-card"
          onClick={() => {
            useToastStore.getState().addToast({
              type: 'warning',
              title: 'Report Channel',
              message: 'Report submitted for review',
            });
          }}
        >
          <span className="member-panel__action-icon">🚩</span>
          <span className="member-panel__action-label">Report</span>
        </button>
      </div>

      {/* Members List Section */}
      <div className="member-panel__content">
        {isLoading ? (
          <div className="member-panel__loading">Loading details...</div>
        ) : (
          <>
            {onlineMembers.length > 0 && (
              <div className="member-panel__section">
                <h4 className="member-panel__section-title">
                  Online — {onlineMembers.length}
                </h4>
                <div className="member-panel__list">
                  {onlineMembers.map((m) => renderMemberRow(m, true))}
                </div>
              </div>
            )}

            {offlineMembers.length > 0 && (
              <div className="member-panel__section">
                <h4 className="member-panel__section-title">
                  Offline — {offlineMembers.length}
                </h4>
                <div className="member-panel__list">
                  {offlineMembers.map((m) => renderMemberRow(m, false))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
