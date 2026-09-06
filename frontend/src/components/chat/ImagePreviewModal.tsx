import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import './ImagePreviewModal.css';

export function ImagePreviewModal() {
  const previewImage = useUIStore((s) => s.previewImage);
  const closeImagePreview = useUIStore((s) => s.closeImagePreview);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!previewImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeImagePreview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage, closeImagePreview]);

  if (!previewImage) return null;

  const displayTitle = previewImage.title || previewImage.alt || 'AI Generated Image';
  const cleanFileName = displayTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 45) || 'devchat-artwork';

  // 1. Live Download
  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(previewImage.src);
      if (!response.ok) throw new Error('Failed to fetch image stream');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${cleanFileName}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);

      useToastStore.getState().addToast({
        type: 'success',
        title: 'Downloaded!',
        message: `${cleanFileName}.png saved to your device.`,
      });
    } catch {
      // Fallback direct anchor download
      const anchor = document.createElement('a');
      anchor.href = previewImage.src;
      anchor.download = `${cleanFileName}.png`;
      anchor.target = '_blank';
      anchor.click();

      useToastStore.getState().addToast({
        type: 'info',
        title: 'Downloading...',
        message: 'Image download triggered.',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // 2. Copy Link
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(previewImage.src);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Link Copied',
        message: 'Direct image link copied to clipboard.',
      });
    } catch {
      useToastStore.getState().addToast({
        type: 'warning',
        title: 'Copy Failed',
        message: 'Could not access clipboard.',
      });
    }
  };

  // 3. Share on X (Twitter)
  const handleShareX = () => {
    const text = `Created with DevChat AI: "${displayTitle}" 🎨✨`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(previewImage.src)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=450');
  };

  // 4. Share on LinkedIn
  const handleShareLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(previewImage.src)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=550');
  };

  // 5. Share on Reddit
  const handleShareReddit = () => {
    const url = `https://www.reddit.com/submit?url=${encodeURIComponent(previewImage.src)}&title=${encodeURIComponent(displayTitle)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=700,height=600');
  };

  return (
    <div className="img-modal-backdrop" onClick={closeImagePreview}>
      <div className="img-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="img-modal-header">
          <h2 className="img-modal-title" title={displayTitle}>
            {displayTitle}
          </h2>
          <button
            type="button"
            className="img-modal-close-btn"
            onClick={closeImagePreview}
            aria-label="Close dialog"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        {/* Image Preview Canvas */}
        <div className="img-modal-canvas">
          <img
            src={previewImage.src}
            alt={displayTitle}
            className="img-modal-preview-img"
          />
        </div>

        {/* ChatGPT Style Circular Action Bar */}
        <div className="img-modal-actions">
          {/* Copy Link */}
          <div className="img-modal-action-col">
            <button
              type="button"
              className={`img-modal-circle-btn ${isCopied ? 'img-modal-circle-btn--active' : ''}`}
              onClick={handleCopyLink}
              title="Copy image link"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
            <span className="img-modal-action-label">{isCopied ? 'Copied!' : 'Copy link'}</span>
          </div>

          {/* X (Twitter) */}
          <div className="img-modal-action-col">
            <button
              type="button"
              className="img-modal-circle-btn"
              onClick={handleShareX}
              title="Share on X"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </button>
            <span className="img-modal-action-label">X</span>
          </div>

          {/* LinkedIn */}
          <div className="img-modal-action-col">
            <button
              type="button"
              className="img-modal-circle-btn"
              onClick={handleShareLinkedIn}
              title="Share on LinkedIn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
            </button>
            <span className="img-modal-action-label">LinkedIn</span>
          </div>

          {/* Reddit */}
          <div className="img-modal-action-col">
            <button
              type="button"
              className="img-modal-circle-btn"
              onClick={handleShareReddit}
              title="Share on Reddit"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.56 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.702zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
              </svg>
            </button>
            <span className="img-modal-action-label">Reddit</span>
          </div>

          {/* Download */}
          <div className="img-modal-action-col">
            <button
              type="button"
              className={`img-modal-circle-btn img-modal-circle-btn--download ${isDownloading ? 'img-modal-circle-btn--loading' : ''}`}
              onClick={handleDownload}
              title="Download image"
              disabled={isDownloading}
            >
              {isDownloading ? (
                <div className="img-modal-spinner" />
              ) : (
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
            </button>
            <span className="img-modal-action-label">{isDownloading ? 'Saving...' : 'Download'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
