import React from 'react';

interface AILogoIconProps {
  size?: number;
  className?: string;
}

export function AILogoIcon({ size = 24, className = '' }: AILogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <defs>
        <linearGradient id="devchatAiGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6c5ce7" />
          <stop offset="50%" stopColor="#a29bfe" />
          <stop offset="100%" stopColor="#00cec9" />
        </linearGradient>
        <linearGradient id="sparkleGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e0e7ff" />
        </linearGradient>
        <filter id="aiGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Hexagonal Outer Shield */}
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#devchatAiGrad)" />

      {/* Subtle Inner Glow Border */}
      <rect x="3" y="3" width="26" height="26" rx="7" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />

      {/* Center AI Brain Chip / Robot Face Icon */}
      <g filter="url(#aiGlow)">
        {/* Robot Head Frame */}
        <rect x="9" y="10" width="14" height="11" rx="3.5" stroke="#ffffff" strokeWidth="1.8" fill="rgba(15, 16, 21, 0.3)" />

        {/* Eyes (Glowing LEDs) */}
        <circle cx="12.5" cy="14.5" r="1.5" fill="#55efc4" />
        <circle cx="19.5" cy="14.5" r="1.5" fill="#55efc4" />

        {/* Mouth/Equalizer line */}
        <path d="M13.5 18H18.5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />

        {/* Antenna / AI Sparkle Star on top right */}
        <path d="M22 6L22.8 8.2L25 9L22.8 9.8L22 12L21.2 9.8L19 9L21.2 8.2L22 6Z" fill="url(#sparkleGrad)" />
        <circle cx="16" cy="7.5" r="1" fill="#ffffff" />
        <line x1="16" y1="8.5" x2="16" y2="10" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
