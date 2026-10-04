import React, { useState, useEffect } from 'react';
import './SlashCommandPopup.css';

export interface SlashCommand {
  cmd: string;
  label: string;
  desc: string;
  icon: string;
  example: string;
}

export const AVAILABLE_COMMANDS: SlashCommand[] = [
  {
    cmd: '/summarize',
    label: 'Summarize Channel',
    desc: 'Generate a structured executive AI summary of recent discussion',
    icon: '📋',
    example: '/summarize',
  },
  {
    cmd: '/review',
    label: 'Code Review & Audit',
    desc: 'Deep AI code review: Big-O complexity, security bugs, & refactoring',
    icon: '🔍',
    example: '/review function calculateTotal() { ... }',
  },
  {
    cmd: '/code',
    label: 'Screenshot to Code',
    desc: 'Convert attached UI mockup or screenshot to production React component',
    icon: '💻',
    example: '/code Convert this login screen into React',
  },
  {
    cmd: '/image',
    label: 'Generate Image',
    desc: 'Create ultra-realistic 8k visual artwork with FLUX.1 engine',
    icon: '🎨',
    example: '/image Cyberpunk city street in neon rain',
  },
];

interface SlashCommandPopupProps {
  filterText: string;
  onSelectCommand: (cmd: string) => void;
  onClose: () => void;
}

export function SlashCommandPopup({ filterText, onSelectCommand, onClose }: SlashCommandPopupProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const cleanFilter = filterText.startsWith('/') ? filterText.slice(1).toLowerCase() : filterText.toLowerCase();

  const filtered = AVAILABLE_COMMANDS.filter(
    (c) =>
      c.cmd.toLowerCase().includes(cleanFilter) ||
      c.label.toLowerCase().includes(cleanFilter) ||
      c.desc.toLowerCase().includes(cleanFilter)
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelectCommand(filtered[selectedIndex].cmd);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelectCommand, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div className="slash-popup">
      <div className="slash-popup__header">
        <span className="slash-popup__title">⚡ AI Commands</span>
        <span className="slash-popup__hint">Tab or Enter to select</span>
      </div>
      <div className="slash-popup__list">
        {filtered.map((item, idx) => (
          <div
            key={item.cmd}
            className={`slash-popup__item ${idx === selectedIndex ? 'slash-popup__item--active' : ''}`}
            onClick={() => onSelectCommand(item.cmd)}
            onMouseEnter={() => setSelectedIndex(idx)}
          >
            <div className="slash-popup__icon">{item.icon}</div>
            <div className="slash-popup__info">
              <div className="slash-popup__cmd-row">
                <span className="slash-popup__cmd">{item.cmd}</span>
                <span className="slash-popup__label">{item.label}</span>
              </div>
              <div className="slash-popup__desc">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
