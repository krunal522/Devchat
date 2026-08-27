import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'var(--bg-deepest, #16171d)',
            color: 'var(--text-primary, #ffffff)',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '3rem' }}>⚠️</span>
          <h2>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary, #9ca3af)', maxWidth: '400px' }}>
            {this.state.error?.message || 'An unexpected error occurred in DevChat'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent, #6c5ce7)',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload DevChat
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
