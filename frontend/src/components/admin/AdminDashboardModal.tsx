import React, { useState, useEffect } from 'react';
import { adminApi, type AdminStats, type AuditLogItem } from '../../services/adminApi';
import { UserAvatar } from '../user/UserAvatar';
import { useToastStore } from '../../stores/toastStore';
import './AdminDashboardModal.css';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminDashboardModal({ isOpen, onClose }: AdminDashboardModalProps) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'audit'>('analytics');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [statsRes, auditRes] = await Promise.all([
          adminApi.getStats(),
          adminApi.getAuditLogs(1, 50),
        ]);
        setStats(statsRes);
        setLogs(auditRes.logs);
      } catch (err: any) {
        useToastStore.getState().addToast({
          type: 'danger',
          title: 'Admin Error',
          message: 'Failed to load admin stats or audit logs',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getActionBadgeClass = (action: string) => {
    if (action.includes('JOINED') || action.includes('CREATED')) return 'audit-badge--success';
    if (action.includes('DELETED') || action.includes('REMOVED')) return 'audit-badge--danger';
    if (action.includes('ROLE')) return 'audit-badge--warning';
    return 'audit-badge--info';
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="admin-modal__header">
          <div className="admin-modal__title-group">
            <span className="admin-modal__icon">🛡️</span>
            <div>
              <h2 className="admin-modal__title">Workspace Admin Console</h2>
              <p className="admin-modal__subtitle">System metrics, security audit logs, & organization overview</p>
            </div>
          </div>
          <button className="admin-modal__close-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="admin-modal__tabs">
          <button
            className={`admin-modal__tab ${activeTab === 'analytics' ? 'admin-modal__tab--active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            📊 Analytics & Metrics
          </button>
          <button
            className={`admin-modal__tab ${activeTab === 'audit' ? 'admin-modal__tab--active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            📋 Security Audit Logs
          </button>
        </div>

        {/* Body Content */}
        <div className="admin-modal__body">
          {isLoading ? (
            <div className="admin-modal__loading">
              <div className="admin-modal__spinner" />
              <span>Loading admin data...</span>
            </div>
          ) : activeTab === 'analytics' ? (
            <div className="admin-analytics">
              {/* KPI Cards Grid */}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-card__header">
                    <span className="kpi-card__title">Total Members</span>
                    <span className="kpi-card__icon">👥</span>
                  </div>
                  <div className="kpi-card__value">{stats?.totalUsers || 0}</div>
                  <div className="kpi-card__footer">
                    <span className="kpi-card__status-dot" />
                    <span>{stats?.onlineCount || 0} Currently Online</span>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-card__header">
                    <span className="kpi-card__title">Active Channels</span>
                    <span className="kpi-card__icon">💬</span>
                  </div>
                  <div className="kpi-card__value">{stats?.totalChannels || 0}</div>
                  <div className="kpi-card__footer">
                    <span>Public & Private Channels</span>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-card__header">
                    <span className="kpi-card__title">Messages Sent</span>
                    <span className="kpi-card__icon">📝</span>
                  </div>
                  <div className="kpi-card__value">{stats?.totalMessages || 0}</div>
                  <div className="kpi-card__footer">
                    <span>Real-time chat history</span>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-card__header">
                    <span className="kpi-card__title">Storage Used</span>
                    <span className="kpi-card__icon">📁</span>
                  </div>
                  <div className="kpi-card__value">{stats?.totalStorageMB || 0} MB</div>
                  <div className="kpi-card__footer">
                    <span>{stats?.totalFiles || 0} Uploaded Attachments</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="admin-audit">
              <div className="audit-table-wrapper">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Action</th>
                      <th>Details</th>
                      <th>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="audit-table__empty">
                          No audit events recorded yet
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <div className="audit-user">
                              <UserAvatar src={log.user.avatarUrl} displayName={log.user.displayName} size="xs" />
                              <div className="audit-user__info">
                                <span className="audit-user__name">{log.user.displayName}</span>
                                <span className="audit-user__handle">@{log.user.username}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`audit-badge ${getActionBadgeClass(log.action)}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="audit-details">{log.details}</td>
                          <td className="audit-date">
                            {new Date(log.createdAt).toLocaleString([], {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
