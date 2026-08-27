import { useState, useRef, useEffect } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useToastStore } from '../../stores/toastStore';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import { JoinWorkspaceModal } from './JoinWorkspaceModal';
import { WorkspaceSettingsModal } from './WorkspaceSettingsModal';
import './WorkspaceSelector.css';

export function WorkspaceSelector() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);

  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyInvite = () => {
    if (!activeWorkspace) return;
    const code = activeWorkspace.inviteCode;
    navigator.clipboard.writeText(code);
    useToastStore.getState().addToast({
      type: 'success',
      title: 'Invite Code Copied!',
      message: `Code "${code}" copied to clipboard`,
    });
    setIsOpen(false);
  };

  return (
    <>
      <div className="workspace-selector" ref={dropdownRef}>
        <button
          type="button"
          className="workspace-selector__trigger"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <div className="workspace-selector__logo">
            {activeWorkspace?.logoUrl ? (
              <img src={activeWorkspace.logoUrl} alt={activeWorkspace.name} />
            ) : (
              <span>💬</span>
            )}
          </div>
          <div className="workspace-selector__info">
            <span className="workspace-selector__name">
              {activeWorkspace?.name || 'DevChat Workspace'}
            </span>
            <span className="workspace-selector__role">
              {activeWorkspace?.myRole || 'MEMBER'}
            </span>
          </div>
          <span className={`workspace-selector__arrow ${isOpen ? 'workspace-selector__arrow--open' : ''}`}>
            ▾
          </span>
        </button>

        {isOpen && (
          <div className="workspace-selector__dropdown">
            <div className="workspace-selector__dropdown-header">
              <span>Workspaces ({workspaces.length})</span>
            </div>

            <div className="workspace-selector__list">
              {workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspace?.id;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    className={`workspace-selector__item ${isActive ? 'workspace-selector__item--active' : ''}`}
                    onClick={() => {
                      setActiveWorkspace(ws.id);
                      setIsOpen(false);
                    }}
                  >
                    <div className="workspace-selector__item-logo">
                      {ws.logoUrl ? <img src={ws.logoUrl} alt={ws.name} /> : <span>💬</span>}
                    </div>
                    <div className="workspace-selector__item-info">
                      <span className="workspace-selector__item-name">{ws.name}</span>
                      <span className="workspace-selector__item-role">{ws.myRole}</span>
                    </div>
                    {isActive && <span className="workspace-selector__active-check">✓</span>}
                  </button>
                );
              })}
            </div>

            <div className="workspace-selector__divider" />

            <div className="workspace-selector__actions">
              <button
                type="button"
                className="workspace-selector__action-btn"
                onClick={() => {
                  setIsOpen(false);
                  setIsSettingsOpen(true);
                }}
              >
                <span>⚙️ Manage Workspace &amp; Members</span>
              </button>

              <button
                type="button"
                className="workspace-selector__action-btn"
                onClick={handleCopyInvite}
              >
                <span>📋 Copy Invite Code</span>
              </button>

              <button
                type="button"
                className="workspace-selector__action-btn"
                onClick={() => {
                  setIsOpen(false);
                  setIsCreateOpen(true);
                }}
              >
                <span>➕ Create New Workspace</span>
              </button>

              <button
                type="button"
                className="workspace-selector__action-btn"
                onClick={() => {
                  setIsOpen(false);
                  setIsJoinOpen(true);
                }}
              >
                <span>🔗 Join via Invite Code</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateWorkspaceModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      <JoinWorkspaceModal isOpen={isJoinOpen} onClose={() => setIsJoinOpen(false)} />
      <WorkspaceSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}
