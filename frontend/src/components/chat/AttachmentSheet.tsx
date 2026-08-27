import React from 'react';
import './AttachmentSheet.css';

interface AttachmentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPhoto: () => void;
  onSelectDocument: () => void;
  onStartVoiceRecord?: () => void;
}

export function AttachmentSheet({
  isOpen,
  onClose,
  onSelectPhoto,
  onSelectDocument,
  onStartVoiceRecord,
}: AttachmentSheetProps) {
  if (!isOpen) return null;

  return (
    <div className="attachment-overlay" onClick={onClose}>
      <div className="attachment-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="attachment-sheet__drag-handle" />

        <div className="attachment-sheet__header">
          <div>
            <h4 className="attachment-sheet__title">Share Media &amp; Content</h4>
            <span className="attachment-sheet__sub">Select a file type to attach to message</span>
          </div>
          <button type="button" className="attachment-sheet__close-btn" onClick={onClose} title="Close menu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="attachment-sheet__list">
          {/* Photos & Videos */}
          <button
            type="button"
            className="attachment-sheet__action-card"
            onClick={() => {
              onSelectPhoto();
              onClose();
            }}
          >
            <div className="attachment-sheet__icon-box attachment-sheet__icon-box--media">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" ry="4" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <div className="attachment-sheet__action-info">
              <strong>Photos &amp; Videos</strong>
              <span>Upload images, GIFs, screenshots, or MP4 clips</span>
            </div>
            <span className="attachment-sheet__arrow">➔</span>
          </button>

          {/* Document */}
          <button
            type="button"
            className="attachment-sheet__action-card"
            onClick={() => {
              onSelectDocument();
              onClose();
            }}
          >
            <div className="attachment-sheet__icon-box attachment-sheet__icon-box--doc">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="attachment-sheet__action-info">
              <strong>Document &amp; Code Files</strong>
              <span>Attach PDF, DOCX, ZIP, TXT, JS, JSON files</span>
            </div>
            <span className="attachment-sheet__arrow">➔</span>
          </button>

          {/* Voice Note */}
          {onStartVoiceRecord && (
            <button
              type="button"
              className="attachment-sheet__action-card"
              onClick={() => {
                onStartVoiceRecord();
                onClose();
              }}
            >
              <div className="attachment-sheet__icon-box attachment-sheet__icon-box--voice">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </div>
              <div className="attachment-sheet__action-info">
                <strong>Record Voice Note</strong>
                <span>Send live high-quality voice audio message</span>
              </div>
              <span className="attachment-sheet__arrow">➔</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
