import React from 'react';
import { AILogoIcon } from '../ui/AILogoIcon';
import './MarkdownRenderer.css';

export function AITypingBubble() {
  return (
    <div className="ai-typing-bubble">
      <div className="ai-typing-bubble__avatar">
        <AILogoIcon size={26} />
      </div>
      <div className="ai-typing-bubble__content">
        <span className="ai-typing-bubble__name">DevChat AI</span>
        <div className="ai-typing-bubble__dots">
          <span className="ai-typing-bubble__dot" />
          <span className="ai-typing-bubble__dot" />
          <span className="ai-typing-bubble__dot" />
        </div>
      </div>
    </div>
  );
}
