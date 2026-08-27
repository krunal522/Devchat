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
            const isVideo =
              src?.endsWith('.mp4') ||
              src?.endsWith('.webm') ||
              src?.includes('mixkit') ||
              alt?.toLowerCase().includes('video');

            if (isVideo && src) {
              return (
                <div className="markdown-img-container">
                  <video
                    src={src}
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
                    src={src}
                    alt={alt || 'AI Generated Image'}
                    className="markdown-img"
                    loading="eager"
                    onClick={() => src && window.open(src, '_blank')}
                    onLoad={(e: any) => {
                      e.target.classList.add('markdown-img--loaded');
                      const wrapper = e.target.closest('.markdown-img-wrapper');
                      if (wrapper) wrapper.classList.add('markdown-img-wrapper--loaded');
                    }}
                    onError={(e: any) => {
                      if (!e.target.dataset.retry) {
                        e.target.dataset.retry = '1';
                        setTimeout(() => {
                          e.target.src = src + (src?.includes('?') ? '&' : '?') + 'r=' + Date.now();
                        }, 2000);
                      }
                    }}
                    title="Click to open full resolution"
                  />
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
