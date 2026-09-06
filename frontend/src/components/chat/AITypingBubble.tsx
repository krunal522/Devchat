import React, { useEffect, useState } from 'react';
import { AILogoIcon } from '../ui/AILogoIcon';
import { useUIStore } from '../../stores/uiStore';
import './MarkdownRenderer.css';

const IMAGE_PHASES = [
  'Refining visual prompt & geometry...',
  'Synthesizing 1024×1024 pixels with FLUX.1...',
  'Applying lighting, reflections & textures...',
  'Finalizing high-definition render...',
];

export const AITypingBubble = React.memo(function AITypingBubble() {
  const aiTypingMode = useUIStore((s) => s.aiTypingMode);
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (aiTypingMode !== 'image') return;
    const interval = setInterval(() => {
      setPhaseIndex((prev) => (prev + 1) % IMAGE_PHASES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [aiTypingMode]);

  if (aiTypingMode === 'image') {
    return (
      <div className="ai-image-loader-card" key="ai-image-loader-card">
        <div className="ai-image-loader-header">
          <div className="ai-typing-bubble__avatar ai-avatar-pulse">
            <AILogoIcon size={26} />
          </div>
          <div className="ai-image-loader-meta">
            <div className="ai-image-loader-title-row">
              <span className="ai-typing-bubble__name">DevChat AI</span>
              <span className="ai-loader-badge">⚡ FLUX.1 Ultra-HD</span>
            </div>
            <span className="ai-image-loader-status">{IMAGE_PHASES[phaseIndex]}</span>
          </div>
        </div>

        <div className="ai-image-loader-canvas">
          <div className="ai-image-loader-shimmer" />
          <div className="ai-image-loader-center">
            <div className="ai-image-spinner-ring" />
            <span className="ai-image-spinner-icon">🎨</span>
          </div>
          <div className="ai-image-loader-bottom-bar">
            <span className="ai-image-loader-hint">Generating with Black Forest Labs FLUX.1 (~3-5s)</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-typing-bubble" key="ai-typing-bubble-container">
      <div className="ai-typing-bubble__avatar ai-avatar-pulse">
        <AILogoIcon size={26} />
      </div>
      <div className="ai-typing-bubble__content">
        <div className="ai-image-loader-title-row">
          <span className="ai-typing-bubble__name">DevChat AI</span>
          <span className="ai-loader-badge-text">Thinking...</span>
        </div>
        <div className="ai-typing-bubble__dots">
          <span className="ai-typing-bubble__dot" />
          <span className="ai-typing-bubble__dot" />
          <span className="ai-typing-bubble__dot" />
        </div>
      </div>
    </div>
  );
});
