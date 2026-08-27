interface FileIconProps {
  fileType: 'IMAGE' | 'DOCUMENT' | 'CODE' | 'AUDIO' | 'VIDEO' | 'OTHER';
  fileName: string;
  mimeType?: string;
}

export function FileIcon({ fileType, fileName, mimeType }: FileIconProps) {
  const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';

  if (fileType === 'IMAGE') {
    return (
      <div className="file-icon-badge file-icon-badge--image" title={fileName}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="4" ry="4" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <span className="file-icon-ext">{ext}</span>
      </div>
    );
  }

  if (fileType === 'CODE') {
    return (
      <div className="file-icon-badge file-icon-badge--code" title={fileName}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        <span className="file-icon-ext">{ext}</span>
      </div>
    );
  }

  if (mimeType?.includes('pdf') || ext === 'PDF') {
    return (
      <div className="file-icon-badge file-icon-badge--pdf" title={fileName}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span className="file-icon-ext">PDF</span>
      </div>
    );
  }

  if (fileType === 'AUDIO') {
    return (
      <div className="file-icon-badge file-icon-badge--audio" title={fileName}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <span className="file-icon-ext">{ext}</span>
      </div>
    );
  }

  if (fileType === 'VIDEO') {
    return (
      <div className="file-icon-badge file-icon-badge--video" title={fileName}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
        </svg>
        <span className="file-icon-ext">{ext}</span>
      </div>
    );
  }

  if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(ext)) {
    return (
      <div className="file-icon-badge file-icon-badge--zip" title={fileName}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        <span className="file-icon-ext">{ext}</span>
      </div>
    );
  }

  return (
    <div className="file-icon-badge file-icon-badge--doc" title={fileName}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
      <span className="file-icon-ext">{ext}</span>
    </div>
  );
}
