import { useState, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { formatMessageTime } from '../../utils/formatDate';
import './SearchModal.css';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const setMobileView = useUIStore((s) => s.setMobileView);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await api.get(`/messages/search?q=${encodeURIComponent(query)}`);
        setResults(res.data.data || []);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectMessage = (channelId: string) => {
    setActiveChannel(channelId);
    setMobileView('chat');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Search Messages" size="lg">
      <div className="search-modal">
        <div className="search-modal__input-wrapper">
          <span className="search-modal__icon">🔍</span>
          <input
            type="text"
            className="search-modal__input"
            placeholder="Search across all messages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button
              type="button"
              className="search-modal__clear-btn"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="search-modal__results">
          {isLoading ? (
            <div className="search-modal__status">Searching messages...</div>
          ) : results.length > 0 ? (
            results.map((msg) => (
              <div
                key={msg.id}
                className="search-modal__result-item"
                onClick={() => handleSelectMessage(msg.channelId)}
              >
                <div className="search-modal__result-header">
                  <span className="search-modal__result-channel">#{msg.channel?.name || 'channel'}</span>
                  <span className="search-modal__result-author">{msg.user?.displayName || 'User'}</span>
                  <span className="search-modal__result-time">{formatMessageTime(msg.createdAt)}</span>
                </div>
                <p className="search-modal__result-content">{msg.content}</p>
              </div>
            ))
          ) : query.trim() ? (
            <div className="search-modal__status">No matching messages found</div>
          ) : (
            <div className="search-modal__hint">Type to search for text or keywords</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
