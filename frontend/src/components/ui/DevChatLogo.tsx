import React from 'react';

interface DevChatLogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export function DevChatLogo({ size = 36, className = '', glow = true }: DevChatLogoProps) {
  const filterId = `dcLogoGlow-${size}`;
  const gradId = `dcLogoGrad-${size}`;
  const innerGradId = `dcInnerGrad-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6c5ce7" />
          <stop offset="50%" stopColor="#805ad5" />
          <stop offset="100%" stopColor="#00cec9" />
        </linearGradient>
        <linearGradient id={innerGradId} x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e0e7ff" />
        </linearGradient>
        {glow && (
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        )}
      </defs>

      {/* Outer Squircle Container with DevChat Gradient */}
      <rect
        x="3"
        y="3"
        width="42"
        height="42"
        rx="12"
        fill={`url(#${gradId})`}
        filter={glow ? `url(#${filterId})` : undefined}
      />

      {/* Subtle Inner Highlight Rim */}
      <rect
        x="4"
        y="4"
        width="40"
        height="40"
        rx="11"
        fill="none"
        stroke="rgba(255, 255, 255, 0.3)"
        strokeWidth="1.2"
      />

      {/* DevChat Workspace 4-Square Matrix */}
      <rect x="13" y="13" width="9" height="9" rx="3" fill={`url(#${innerGradId})`} />
      <rect x="26" y="13" width="9" height="9" rx="3" fill="#55efc4" />
      <rect x="13" y="26" width="9" height="9" rx="3" fill="#81ecec" />
      <rect x="26" y="26" width="9" height="9" rx="3" fill={`url(#${innerGradId})`} />

      {/* Center Micro-Hub */}
      <circle cx="24" cy="24" r="2.2" fill="#161822" />
    </svg>
  );
}
