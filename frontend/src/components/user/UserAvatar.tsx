import { memo, useState } from 'react';
import { AILogoIcon } from '../ui/AILogoIcon';
import './UserAvatar.css';

interface UserAvatarProps {
  src?: string | null;
  displayName: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isOnline?: boolean;
  showStatus?: boolean;
  isAI?: boolean;
}

const SIZE_PX_MAP = {
  xs: 20,
  sm: 26,
  md: 36,
  lg: 44,
};

export const UserAvatar = memo(function UserAvatar({
  src,
  displayName,
  size = 'md',
  isOnline,
  showStatus = false,
  isAI,
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const isAIBot = isAI || displayName?.toLowerCase().includes('devchat ai') || displayName?.toLowerCase().includes('devchat_ai');

  if (isAIBot) {
    const pixelSize = SIZE_PX_MAP[size] || 36;
    return (
      <div className={`avatar avatar--${size}`} title="DevChat AI Assistant">
        <AILogoIcon size={pixelSize} />
        {showStatus && (
          <span className="avatar__status avatar__status--online" aria-label="AI Online" />
        )}
      </div>
    );
  }

  const initials = (displayName || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <div className={`avatar avatar--${size}`}>
      {src && !imgError ? (
        <img src={src} alt={displayName} className="avatar__image" onError={() => setImgError(true)} />
      ) : (
        <div className="avatar__fallback">{initials}</div>
      )}
      {showStatus && isOnline && (
        <span
          className="avatar__status avatar__status--online"
          aria-label="Online"
        />
      )}
    </div>
  );
});
