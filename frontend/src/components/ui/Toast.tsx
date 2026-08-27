import { useToastStore } from '../../stores/toastStore';
import './Toast.css';

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          <div className="toast__content">
            {toast.title && <strong className="toast__title">{toast.title}</strong>}
            <span className="toast__message">{toast.message}</span>
          </div>
          <button className="toast__close" onClick={() => removeToast(toast.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
