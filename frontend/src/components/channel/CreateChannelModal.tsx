import React, { useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import './CreateChannelModal.css';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateChannelModal({ isOpen, onClose }: CreateChannelModalProps) {
  const createChannel = useChatStore((s) => s.createChannel);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const channel = await createChannel({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
      });

      setName('');
      setDescription('');
      setType('PUBLIC');
      onClose();
      await setActiveChannel(channel.id);
    } catch (err: any) {
      const errData = err.response?.data?.error;
      let errorMessage = 'Failed to create channel';
      if (errData?.details && Array.isArray(errData.details) && errData.details.length > 0) {
        errorMessage = errData.details.map((d: any) => d.message).join(', ');
      } else if (errData?.message) {
        errorMessage = errData.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create a Channel" size="md">
      <form onSubmit={handleSubmit} className="create-channel-form">
        {error && <div className="create-channel-form__error">{error}</div>}

        <Input
          label="Channel Name"
          placeholder="e.g. project-updates"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />

        <div className="input-group">
          <label className="input-group__label">Description (optional)</label>
          <textarea
            className="create-channel-form__textarea"
            placeholder="What is this channel about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="create-channel-form__type-selector">
          <label className="input-group__label">Channel Type</label>
          <div className="create-channel-form__type-options">
            <button
              type="button"
              className={`create-channel-form__type-btn ${type === 'PUBLIC' ? 'create-channel-form__type-btn--active' : ''}`}
              onClick={() => setType('PUBLIC')}
            >
              <span className="create-channel-form__type-icon">🌐</span>
              <div className="create-channel-form__type-info">
                <strong>Public</strong>
                <span>Anyone in the workspace can join</span>
              </div>
            </button>

            <button
              type="button"
              className={`create-channel-form__type-btn ${type === 'PRIVATE' ? 'create-channel-form__type-btn--active' : ''}`}
              onClick={() => setType('PRIVATE')}
            >
              <span className="create-channel-form__type-icon">🔒</span>
              <div className="create-channel-form__type-info">
                <strong>Private</strong>
                <span>Only invited members can view</span>
              </div>
            </button>
          </div>
        </div>

        <div className="create-channel-form__actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={!name.trim()}>
            Create Channel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
