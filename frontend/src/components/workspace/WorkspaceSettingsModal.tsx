import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { UserAvatar } from '../user/UserAvatar';
import { workspaceApi } from '../../services/workspaceApi';
import './WorkspaceSettingsModal.css';

interface WorkspaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'general' | 'members' | 'invitations' | 'danger';
}

export function WorkspaceSettingsModal({ isOpen, onClose, defaultTab = 'general' }: WorkspaceSettingsModalProps) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const members = useWorkspaceStore((s) => s.members);
  const invitations = useWorkspaceStore((s) => s.invitations);
  const isMembersLoading = useWorkspaceStore((s) => s.isMembersLoading);
  const isInvitationsLoading = useWorkspaceStore((s) => s.isInvitationsLoading);

  const loadMembers = useWorkspaceStore((s) => s.loadMembers);
  const loadInvitations = useWorkspaceStore((s) => s.loadInvitations);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const leaveWorkspace = useWorkspaceStore((s) => s.leaveWorkspace);
  const updateMemberRole = useWorkspaceStore((s) => s.updateMemberRole);
  const removeMember = useWorkspaceStore((s) => s.removeMember);
  const createInvitation = useWorkspaceStore((s) => s.createInvitation);
  const cancelInvitation = useWorkspaceStore((s) => s.cancelInvitation);

  const currentUserId = useAuthStore((s) => s.user?.id);

  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'invitations' | 'danger'>(defaultTab);

  // Form states
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Member search
  const [memberSearch, setMemberSearch] = useState('');

  // Email invitation state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [isInviting, setIsInviting] = useState(false);

  // Delete/Leave confirm state
  const [confirmText, setConfirmText] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name);
      setLogoUrl(activeWorkspace.logoUrl || '');
      setDescription(activeWorkspace.description || '');
      if (isOpen) {
        loadMembers(activeWorkspace.id);
        if (['OWNER', 'ADMIN'].includes(activeWorkspace.myRole)) {
          loadInvitations(activeWorkspace.id);
        }
      }
    }
  }, [activeWorkspace?.id, isOpen]);

  if (!isOpen || !activeWorkspace) return null;

  const isOwner = activeWorkspace.myRole === 'OWNER';
  const isAdmin = ['OWNER', 'ADMIN'].includes(activeWorkspace.myRole);

  const handleUpdateGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsUpdating(true);
    try {
      await updateWorkspace(activeWorkspace.id, {
        name: name.trim(),
        logoUrl: logoUrl.trim() || null,
        description: description.trim() || null,
      });
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Settings Saved',
        message: 'Workspace settings updated successfully',
      });
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Update Failed',
        message: err.response?.data?.error?.message || 'Failed to update workspace',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyInviteCode = () => {
    navigator.clipboard.writeText(activeWorkspace.inviteCode);
    useToastStore.getState().addToast({
      type: 'info',
      title: 'Copied!',
      message: 'Workspace invite code copied to clipboard',
    });
  };

  const handleExportBackup = async () => {
    if (!activeWorkspace) return;
    setIsExporting(true);
    try {
      await workspaceApi.exportWorkspace(activeWorkspace.id, activeWorkspace.slug);
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Backup Downloaded',
        message: 'Workspace data and backup exported successfully!',
      });
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Export Failed',
        message: err.response?.data?.error?.message || 'Failed to export workspace backup',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      const inv = await createInvitation(activeWorkspace.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Invitation Sent',
        message: `Invitation generated for ${inv.email}`,
      });
      setInviteEmail('');
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Invite Failed',
        message: err.response?.data?.error?.message || 'Failed to send invitation',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: 'OWNER' | 'ADMIN' | 'MEMBER') => {
    try {
      await updateMemberRole(activeWorkspace.id, targetUserId, newRole);
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Role Updated',
        message: `Member role changed to ${newRole}`,
      });
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Role Update Failed',
        message: err.response?.data?.error?.message || 'Failed to update member role',
      });
    }
  };

  const handleRemoveMember = async (targetUserId: string, targetName: string) => {
    if (!confirm(`Are you sure you want to remove "${targetName}" from this workspace?`)) return;

    try {
      await removeMember(activeWorkspace.id, targetUserId);
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Member Removed',
        message: `${targetName} has been removed from workspace`,
      });
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Failed to Remove',
        message: err.response?.data?.error?.message || 'Failed to remove member',
      });
    }
  };

  const handleCancelInvite = async (invitationId: string) => {
    try {
      await cancelInvitation(activeWorkspace.id, invitationId);
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Invitation Cancelled',
        message: 'Pending invitation has been revoked',
      });
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Action Failed',
        message: 'Failed to cancel invitation',
      });
    }
  };

  const handleDeleteWorkspace = async () => {
    if (confirmText !== activeWorkspace.name) return;

    setIsActionLoading(true);
    try {
      await deleteWorkspace(activeWorkspace.id);
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Workspace Deleted',
        message: `Workspace "${activeWorkspace.name}" was permanently deleted`,
      });
      onClose();
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Deletion Failed',
        message: err.response?.data?.error?.message || 'Failed to delete workspace',
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLeaveWorkspace = async () => {
    setIsActionLoading(true);
    try {
      await leaveWorkspace(activeWorkspace.id);
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Left Workspace',
        message: `You left "${activeWorkspace.name}"`,
      });
      onClose();
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Failed to Leave',
        message: err.response?.data?.error?.message || 'Failed to leave workspace',
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const filteredMembers = memberSearch
    ? members.filter(
        (m) =>
          m.displayName.toLowerCase().includes(memberSearch.toLowerCase()) ||
          m.username.toLowerCase().includes(memberSearch.toLowerCase()) ||
          m.email?.toLowerCase().includes(memberSearch.toLowerCase())
      )
    : members;

  return createPortal(
    <div className="ws-settings-backdrop" onClick={onClose}>
      <div className="ws-settings-card" onClick={(e) => e.stopPropagation()}>
        {/* Sidebar Nav */}
        <div className="ws-settings-sidebar">
          <div className="ws-settings-sidebar-header">
            <UserAvatar
              src={activeWorkspace.logoUrl}
              displayName={activeWorkspace.name}
              size="md"
            />
            <div className="ws-settings-sidebar-info">
              <h3>{activeWorkspace.name}</h3>
              <span className="ws-settings-sidebar-role">Role: {activeWorkspace.myRole}</span>
            </div>
          </div>

          <nav className="ws-settings-nav">
            <button
              type="button"
              className={`ws-settings-nav-item ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              ⚙️ General &amp; Info
            </button>
            <button
              type="button"
              className={`ws-settings-nav-item ${activeTab === 'members' ? 'active' : ''}`}
              onClick={() => setActiveTab('members')}
            >
              👥 Members ({members.length})
            </button>
            {isAdmin && (
              <button
                type="button"
                className={`ws-settings-nav-item ${activeTab === 'invitations' ? 'active' : ''}`}
                onClick={() => setActiveTab('invitations')}
              >
                ✉️ Invitations ({invitations.length})
              </button>
            )}
            <button
              type="button"
              className={`ws-settings-nav-item ws-settings-nav-item--danger ${activeTab === 'danger' ? 'active' : ''}`}
              onClick={() => setActiveTab('danger')}
            >
              ⚠️ Settings &amp; Danger Zone
            </button>
          </nav>
        </div>

        {/* Content Area */}
        <div className="ws-settings-content">
          <div className="ws-settings-header">
            <h2>
              {activeTab === 'general' && 'General Workspace Settings'}
              {activeTab === 'members' && 'Workspace Member Directory'}
              {activeTab === 'invitations' && 'Email Invitations & Access Tokens'}
              {activeTab === 'danger' && 'Permissions & Danger Zone'}
            </h2>
            <button type="button" className="ws-settings-close" onClick={onClose}>×</button>
          </div>

          <div className="ws-settings-body">
            {/* TAB 1: GENERAL */}
            {activeTab === 'general' && (
              <form onSubmit={handleUpdateGeneral} className="ws-settings-form">
                <div className="ws-settings-field">
                  <label>Workspace Name</label>
                  <input
                    type="text"
                    className="ws-settings-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isAdmin}
                    required
                  />
                </div>

                <div className="ws-settings-field">
                  <label>Logo Image URL</label>
                  <input
                    type="url"
                    className="ws-settings-input"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    disabled={!isAdmin}
                  />
                </div>

                <div className="ws-settings-field">
                  <label>Description</label>
                  <textarea
                    className="ws-settings-input ws-settings-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Summary of this organization or group..."
                    disabled={!isAdmin}
                    rows={3}
                  />
                </div>

                <div className="ws-settings-field">
                  <label>Workspace Invite Code</label>
                  <div className="ws-settings-code-box">
                    <code>{activeWorkspace.inviteCode}</code>
                    <button type="button" className="ws-settings-btn-secondary" onClick={handleCopyInviteCode}>
                      📋 Copy Code
                    </button>
                  </div>
                </div>

                <div className="ws-settings-field">
                  <label>Export Workspace Data &amp; Backup</label>
                  <div className="ws-settings-code-box">
                    <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #94a3b8)' }}>
                      Download a full backup JSON of all channels, members, and messages.
                    </span>
                    <button
                      type="button"
                      className="ws-settings-btn-secondary"
                      onClick={handleExportBackup}
                      disabled={isExporting}
                    >
                      {isExporting ? '⏳ Exporting...' : '📥 Download Backup'}
                    </button>
                  </div>
                </div>

                {isAdmin && (
                  <div className="ws-settings-footer">
                    <button type="submit" className="ws-settings-btn-primary" disabled={isUpdating}>
                      {isUpdating ? 'Saving...' : 'Save Workspace Changes'}
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* TAB 2: MEMBERS */}
            {activeTab === 'members' && (
              <div className="ws-settings-members-tab">
                <div className="ws-settings-search-bar">
                  <input
                    type="text"
                    className="ws-settings-input"
                    placeholder="🔍 Search members by name, username, or email..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                </div>

                {isMembersLoading ? (
                  <div className="ws-settings-loading">Loading workspace members...</div>
                ) : (
                  <div className="ws-settings-members-list">
                    {filteredMembers.map((m) => (
                      <div key={m.id} className="ws-member-item">
                        <UserAvatar src={m.avatarUrl} displayName={m.displayName} size="md" isOnline={m.isOnline} showStatus />
                        <div className="ws-member-info">
                          <div className="ws-member-name-row">
                            <span className="ws-member-name">{m.displayName}</span>
                            <span className="ws-member-username">@{m.username}</span>
                            {m.id === currentUserId && <span className="ws-member-you-tag">You</span>}
                          </div>
                          <span className="ws-member-status">{m.statusText || 'Workspace Member'}</span>
                        </div>

                        <div className="ws-member-actions">
                          {isOwner && m.id !== currentUserId ? (
                            <select
                              className="ws-member-role-select"
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.id, e.target.value as any)}
                            >
                              <option value="MEMBER">Member</option>
                              <option value="ADMIN">Admin</option>
                              <option value="OWNER">Transfer Owner</option>
                            </select>
                          ) : (
                            <span className={`ws-member-role-badge ws-member-role-badge--${m.role.toLowerCase()}`}>
                              {m.role}
                            </span>
                          )}

                          {isAdmin && m.role !== 'OWNER' && m.id !== currentUserId && (
                            <button
                              type="button"
                              className="ws-member-remove-btn"
                              onClick={() => handleRemoveMember(m.id, m.displayName)}
                              title="Remove Member"
                            >
                              ❌
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: INVITATIONS */}
            {activeTab === 'invitations' && isAdmin && (
              <div className="ws-settings-invites-tab">
                <form onSubmit={handleSendInvite} className="ws-invite-form">
                  <div className="ws-invite-form-grid">
                    <input
                      type="email"
                      className="ws-settings-input"
                      placeholder="Enter colleague's email address (e.g. alex@company.com)..."
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                    <select
                      className="ws-settings-input"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                    >
                      <option value="MEMBER">Member Role</option>
                      <option value="ADMIN">Admin Role</option>
                    </select>
                    <button type="submit" className="ws-settings-btn-primary" disabled={isInviting}>
                      {isInviting ? 'Inviting...' : '✉️ Invite'}
                    </button>
                  </div>
                </form>

                <h3 className="ws-settings-section-heading">Pending Email Invitations</h3>

                {isInvitationsLoading ? (
                  <div className="ws-settings-loading">Loading pending invitations...</div>
                ) : invitations.length === 0 ? (
                  <p className="ws-settings-empty">No pending email invitations.</p>
                ) : (
                  <div className="ws-invites-list">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="ws-invite-item">
                        <div className="ws-invite-info">
                          <span className="ws-invite-email">✉️ {inv.email}</span>
                          <span className="ws-invite-meta">
                            Role: {inv.role} • Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="ws-invite-actions">
                          <button
                            type="button"
                            className="ws-settings-btn-secondary"
                            onClick={() => {
                              const link = `${window.location.origin}/invite/${inv.token}`;
                              navigator.clipboard.writeText(link);
                              useToastStore.getState().addToast({
                                type: 'info',
                                title: 'Copied Token Link!',
                                message: link,
                              });
                            }}
                          >
                            🔗 Copy Link
                          </button>
                          <button
                            type="button"
                            className="ws-invite-cancel-btn"
                            onClick={() => handleCancelInvite(inv.id)}
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: DANGER ZONE */}
            {activeTab === 'danger' && (
              <div className="ws-settings-danger-tab">
                <div className="ws-danger-box">
                  <h4>🚪 Leave Workspace</h4>
                  <p>Leave <strong>{activeWorkspace.name}</strong>. You will lose access to all channels and messages.</p>
                  <button
                    type="button"
                    className="ws-settings-btn-danger"
                    onClick={handleLeaveWorkspace}
                    disabled={isActionLoading}
                  >
                    Leave Workspace
                  </button>
                </div>

                {isOwner && (
                  <div className="ws-danger-box ws-danger-box--delete">
                    <h4>🔥 Delete Workspace</h4>
                    <p>Permanently delete <strong>{activeWorkspace.name}</strong>, all channels, messages, and files. This action CANNOT be undone.</p>

                    <div className="ws-danger-confirm-field">
                      <label>Type <strong>{activeWorkspace.name}</strong> to confirm deletion:</label>
                      <input
                        type="text"
                        className="ws-settings-input"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={activeWorkspace.name}
                      />
                    </div>

                    <button
                      type="button"
                      className="ws-settings-btn-danger-confirm"
                      disabled={confirmText !== activeWorkspace.name || isActionLoading}
                      onClick={handleDeleteWorkspace}
                    >
                      {isActionLoading ? 'Deleting...' : 'Permanently Delete Workspace'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
