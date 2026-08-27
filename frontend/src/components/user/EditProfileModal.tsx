import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { Modal } from '../ui/Modal';
import { UserAvatar } from './UserAvatar';
import './EditProfileModal.css';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_AVATARS = [
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Sarah&backgroundColor=6c5ce7',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Alex&backgroundColor=00b894',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Priya&backgroundColor=e17055',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Marcus&backgroundColor=0984e3',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Emma&backgroundColor=fdcb6e',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Star&backgroundColor=a29bfe',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Felix&backgroundColor=74b9ff',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Zoe&backgroundColor=ff7675',
];

export function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [displayName, setDisplayName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setStatusText(user.statusText || '');
      setSelectedAvatar(user.avatarUrl || PRESET_AVATARS[0]);
    }
  }, [user, isOpen]);

  // Handle custom image file upload from user's device
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WEBP, SVG)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size should be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (!src) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 250; // crisp square avatar
        canvas.width = size;
        canvas.height = size;

        // Center crop calculation
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        if (ctx) {
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const resizedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          setSelectedAvatar(resizedBase64);
          setError(null);
        } else {
          setSelectedAvatar(src);
          setError(null);
        }
      };
      img.onerror = () => {
        setSelectedAvatar(src);
        setError(null);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updateProfile({
        displayName: displayName.trim(),
        statusText: statusText.trim() || undefined,
        avatarUrl: selectedAvatar,
      });

      useToastStore.getState().addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your profile and avatar picture have been updated!',
      });

      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to update profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Profile">
      <form onSubmit={handleSubmit} className="edit-profile-form">
        {error && <div className="edit-profile-form__error">{error}</div>}

        {/* Profile Picture & Custom File Upload */}
        <div className="edit-profile-form__group">
          <label className="edit-profile-form__label">Profile Photo</label>
          <div className="edit-profile-form__avatar-section">
            <div className="edit-profile-form__avatar-preview">
              <UserAvatar src={selectedAvatar} displayName={displayName || '?'} size="lg" />
            </div>

            <div className="edit-profile-form__upload-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="edit-profile-form__upload-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                📷 Upload Custom Image
              </button>
              <span className="edit-profile-form__upload-hint">
                Select PNG, JPG, WEBP, or SVG from your device
              </span>
            </div>
          </div>

          <label className="edit-profile-form__sublabel">Or Choose Preset Avatar</label>
          <div className="edit-profile-form__avatar-grid">
            {PRESET_AVATARS.map((avatar, idx) => (
              <button
                key={idx}
                type="button"
                className={`edit-profile-form__avatar-option ${selectedAvatar === avatar ? 'edit-profile-form__avatar-option--selected' : ''}`}
                onClick={() => setSelectedAvatar(avatar)}
              >
                <img src={avatar} alt={`Avatar preset ${idx + 1}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Display Name */}
        <div className="edit-profile-form__group">
          <label htmlFor="displayName" className="edit-profile-form__label">
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            className="edit-profile-form__input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your full name"
            required
          />
        </div>

        {/* Status Text */}
        <div className="edit-profile-form__group">
          <label htmlFor="statusText" className="edit-profile-form__label">
            Status Text
          </label>
          <input
            id="statusText"
            type="text"
            className="edit-profile-form__input"
            value={statusText}
            onChange={(e) => setStatusText(e.target.value)}
            placeholder="e.g. 🚀 Building awesome features"
          />
        </div>

        {/* Form Actions */}
        <div className="edit-profile-form__actions">
          <button
            type="button"
            className="edit-profile-form__btn edit-profile-form__btn--cancel"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="edit-profile-form__btn edit-profile-form__btn--save"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
