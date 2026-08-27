import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useToastStore } from '../../stores/toastStore';
import './CreateWorkspaceModal.css';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateWorkspaceModal({ isOpen, onClose }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workspace name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const ws = await createWorkspace({
        name: name.trim(),
        logoUrl: logoUrl.trim() || undefined,
        description: description.trim() || undefined,
      });
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Workspace Created!',
        message: `Created workspace "${ws.name}"`,
      });
      setName('');
      setLogoUrl('');
      setDescription('');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="ws-modal-backdrop" onClick={onClose}>
      <div className="ws-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="ws-modal-header">
          <div className="ws-modal-title">
            <span className="ws-modal-title-icon">🏢</span>
            <h2>Create New Workspace</h2>
          </div>
          <button type="button" className="ws-modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="ws-modal-body">
            <p className="ws-modal-subtitle">
              Workspaces are shared organization hubs where your team collaborates securely.
            </p>

            <div className="ws-modal-field">
              <label htmlFor="ws-name" className="ws-modal-label">Workspace Name *</label>
              <input
                id="ws-name"
                type="text"
                className="ws-modal-input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. Acme Corp Engineering"
                autoFocus
              />
              {error && <span className="ws-modal-error">⚠️ {error}</span>}
            </div>

            <div className="ws-modal-field">
              <label htmlFor="ws-logo" className="ws-modal-label">Logo Image URL (Optional)</label>
              <input
                id="ws-logo"
                type="url"
                className="ws-modal-input"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="ws-modal-field">
              <label htmlFor="ws-desc" className="ws-modal-label">Description (Optional)</label>
              <textarea
                id="ws-desc"
                className="ws-modal-input ws-modal-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of your company or engineering group..."
                rows={3}
              />
            </div>
          </div>

          <div className="ws-modal-footer">
            <button type="button" className="ws-modal-btn ws-modal-btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="ws-modal-btn ws-modal-btn--submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
