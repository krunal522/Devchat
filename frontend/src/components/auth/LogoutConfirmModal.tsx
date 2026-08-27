import { useAuthStore } from '../../stores/authStore';
import { Modal } from '../ui/Modal';
import { UserAvatar } from '../user/UserAvatar';
import './LogoutConfirmModal.css';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LogoutConfirmModal({ isOpen, onClose }: LogoutConfirmModalProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sign Out">
      <div className="logout-confirm-modal">
        <div className="logout-confirm-modal__user">
          <UserAvatar
            src={user?.avatarUrl}
            displayName={user?.displayName || ''}
            size="lg"
            isOnline
            showStatus
          />
          <div className="logout-confirm-modal__user-info">
            <span className="logout-confirm-modal__name">{user?.displayName}</span>
            <span className="logout-confirm-modal__email">{user?.email}</span>
          </div>
        </div>

        <p className="logout-confirm-modal__message">
          Are you sure you want to sign out of <strong>DevChat</strong>? You will need to log back in to access your messages and channels.
        </p>

        <div className="logout-confirm-modal__actions">
          <button
            type="button"
            className="logout-confirm-modal__btn logout-confirm-modal__btn--cancel"
            onClick={onClose}
          >
            Stay Signed In
          </button>
          <button
            type="button"
            className="logout-confirm-modal__btn logout-confirm-modal__btn--logout"
            onClick={handleLogout}
          >
            Sign Out Now
          </button>
        </div>
      </div>
    </Modal>
  );
}
