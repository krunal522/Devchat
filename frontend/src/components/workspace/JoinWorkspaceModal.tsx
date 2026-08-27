import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useToastStore } from '../../stores/toastStore';
import './CreateWorkspaceModal.css'; // Shared enterprise modal styles

interface JoinWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JoinWorkspaceModal({ isOpen, onClose }: JoinWorkspaceModalProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joinWorkspace = useWorkspaceStore((s) => s.joinWorkspace);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setError('Invite code is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const ws = await joinWorkspace(inviteCode.trim());
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Joined Workspace!',
        message: `Welcome to "${ws.name}"`,
      });
      setInviteCode('');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Invalid invite code or failed to join');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="ws-modal-backdrop" onClick={onClose}>
      <div className="ws-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="ws-modal-header">
          <div className="ws-modal-title">
            <span className="ws-modal-title-icon">🔗</span>
            <h2>Join Workspace via Invite Link</h2>
          </div>
          <button type="button" className="ws-modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="ws-modal-body">
            <p className="ws-modal-subtitle">
              Enter the invite code or secret link shared by your workspace administrator.
            </p>

            <div className="ws-modal-field">
              <label htmlFor="invite-code" className="ws-modal-label">Workspace Invite Code</label>
              <input
                id="invite-code"
                type="text"
                className="ws-modal-input"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. DEVCHAT-2026-INVITE"
                autoFocus
              />
              {error && <span className="ws-modal-error">⚠️ {error}</span>}
            </div>
          </div>

          <div className="ws-modal-footer">
            <button type="button" className="ws-modal-btn ws-modal-btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="ws-modal-btn ws-modal-btn--submit" disabled={isSubmitting}>
              {isSubmitting ? 'Joining...' : 'Join Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
