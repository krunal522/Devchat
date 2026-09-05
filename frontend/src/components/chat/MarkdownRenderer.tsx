import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Code block ──────────────────────────────────────
          code({ node, className, children, ...props }) {
            const inline = !className;
            const lang = className?.replace('language-', '') || 'code';
            const codeStr = String(children).replace(/\n$/, '');
            const id = `cb-${codeStr.length}-${lang}`;

            if (inline) {
              return (
                <code className="markdown-inline-code" {...props}>
                  {children}
                </code>
              );
            }

            return (
              <div className="markdown-codeblock">
                <div className="markdown-codeblock__header">
                  <span className="markdown-codeblock__lang">{lang}</span>
                  <button
                    type="button"
                    className="markdown-codeblock__copy-btn"
                    onClick={() => handleCopy(codeStr, id)}
                  >
                    {copiedId === id ? '✓ Copied' : '📋 Copy Code'}
                  </button>
                </div>
                <pre className="markdown-codeblock__pre">
                  <code>{codeStr}</code>
                </pre>
              </div>
            );
          },

          // ── Tables ──────────────────────────────────────────
          table({ children }) {
            return (
              <div className="markdown-table-wrapper">
                <table className="markdown-table">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="markdown-thead">{children}</thead>;
          },
          tbody({ children }) {
            return <tbody>{children}</tbody>;
          },
          tr({ children }) {
            return <tr className="markdown-tr">{children}</tr>;
          },
          th({ children }) {
            return <th className="markdown-th">{children}</th>;
          },
          td({ children }) {
            return <td className="markdown-td">{children}</td>;
          },

          // ── Headings ─────────────────────────────────────────
          h1({ children }) {
            return <h1 className="markdown-h1">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="markdown-h2">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="markdown-h3">{children}</h3>;
          },

          // ── Blockquote ───────────────────────────────────────
          blockquote({ children }) {
            return <blockquote className="markdown-blockquote">{children}</blockquote>;
          },

          // ── Lists ────────────────────────────────────────────
          ul({ children }) {
            return <ul className="markdown-ul">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="markdown-ol">{children}</ol>;
          },
          li({ children }) {
            return <li className="markdown-li">{children}</li>;
          },

          // ── Paragraph ────────────────────────────────────────
          p({ children }) {
            return <p className="markdown-p">{children}</p>;
          },

          // ── Links ────────────────────────────────────────────
          a({ href, children }) {
            return (
              <a
                href={href}
                className="markdown-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },

          // ── Images & AI Generated Media (Images & Videos) ───────
          img({ src, alt }) {
            const rawSrc = src || '';
            const resolvedSrc = (() => {
              if (!rawSrc) return '';
              if (rawSrc.startsWith('http://') || rawSrc.startsWith('https://') || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')) {
                return rawSrc;
              }
              const backendBase = (
                import.meta.env.VITE_API_URL ||
                import.meta.env.VITE_API_BASE_URL ||
                'http://localhost:3001/api'
              ).replace(/\/api\/?$/, '');
              return `${backendBase}${rawSrc.startsWith('/') ? '' : '/'}${rawSrc}`;
            })();

            const isVideo =
              rawSrc.endsWith('.mp4') ||
              rawSrc.endsWith('.webm') ||
              rawSrc.includes('mixkit') ||
              alt?.toLowerCase().includes('video');

            if (isVideo && resolvedSrc) {
              return (
                <div className="markdown-img-container">
                  <video
                    src={resolvedSrc}
                    controls
                    playsInline
                    preload="metadata"
                    className="markdown-img markdown-img--video"
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              );
            }

            return (
              <div className="markdown-img-container">
                <div className="markdown-img-wrapper">
                  <img
                    src={resolvedSrc}
                    alt={alt || 'AI Generated Image'}
                    className="markdown-img"
                    loading="lazy"
                    onClick={() => resolvedSrc && window.open(resolvedSrc, '_blank')}
                    onLoad={(e: any) => {
                      e.target.classList.add('markdown-img--loaded');
                      const wrapper = e.target.closest('.markdown-img-wrapper');
                      if (wrapper) wrapper.classList.add('markdown-img-wrapper--loaded');
                    }}
                    title="Click to open full resolution"
                  />
                  <div className="markdown-img-footer">
                    <span className="markdown-img-alt">{alt || 'Generated Artwork'}</span>
                    <a
                      href={resolvedSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="markdown-img-expand-btn"
                      onClick={(e) => e.stopPropagation()}
                      download
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Full Resolution</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          },

          // ── Horizontal Rule ──────────────────────────────────
          hr() {
            return <hr className="markdown-hr" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
