import React, { useState, useRef, useEffect, memo } from 'react';
import { DevChatLogo } from './DevChatLogo';
import './DevChatImage.css';

interface DevChatImageProps {
  src: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  title?: string;
  style?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  logoSize?: number;
  loading?: 'lazy' | 'eager';
}

export const DevChatImage = memo(function DevChatImage({
  src,
  alt = 'Image',
  className = '',
  containerClassName = '',
  onClick,
  title,
  style,
  containerStyle,
  logoSize = 34,
  loading = 'lazy',
}: DevChatImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // Check if image is already cached in browser memory on mount or src change
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);

    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [src, retryKey]);

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoaded(false);
    setHasError(true);
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHasError(false);
    setIsLoaded(false);
    setRetryKey((k) => k + 1);
  };

  const effectiveSrc = retryKey > 0 ? `${src}${src.includes('?') ? '&' : '?'}retry=${retryKey}` : src;

  return (
    <div
      className={`devchat-image-container ${containerClassName}`}
      style={containerStyle}
      onClick={onClick}
      title={title}
    >
      {/* DevChat Branded Skeleton Loader Layer */}
      <div
        className={`devchat-image-skeleton ${isLoaded ? 'devchat-image-skeleton--hidden' : ''}`}
        aria-hidden={isLoaded}
      >
        <div className="devchat-image-skeleton__shimmer" />
        <div className="devchat-image-skeleton__badge">
          <div className="devchat-image-skeleton__logo-wrapper">
            <DevChatLogo size={logoSize} glow />
          </div>
          <div className="devchat-image-skeleton__label">
            <span>DevChat</span>
            <span className="devchat-image-skeleton__dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </div>
        </div>
      </div>

      {/* Actual Image */}
      {!hasError && (
        <img
          ref={imgRef}
          src={effectiveSrc}
          alt={alt}
          loading={loading}
          decoding="async"
          className={`devchat-image__img ${isLoaded ? 'devchat-image__img--loaded' : ''} ${className}`}
          style={style}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* Error Fallback Card */}
      {hasError && (
        <div className="devchat-image-error">
          <span className="devchat-image-error__icon">⚠️</span>
          <p className="devchat-image-error__text">Unable to load image</p>
          <button
            type="button"
            className="devchat-image-error__retry-btn"
            onClick={handleRetry}
          >
            ↻ Retry
          </button>
        </div>
      )}
    </div>
  );
});
