import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { UserAvatar } from '../user/UserAvatar';
import './AuthForm.css';

const DEMO_USERS = [
  {
    name: 'Abhishek Shah',
    email: 'abhishekhshah@gmail.com',
    role: 'Full Stack Developer',
    avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Abhishek&backgroundColor=6c5ce7',
  },
  {
    name: 'Sarah Chen',
    email: 'sarah@devchat.io',
    role: 'Lead Architect',
    avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Sarah&backgroundColor=6c5ce7',
  },
  {
    name: 'Alex Rivera',
    email: 'alex@devchat.io',
    role: 'DevOps Lead',
    avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Alex&backgroundColor=00b894',
  },
];

export function LoginForm() {
  const { login } = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Per-field validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);

  const handleIdentifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIdentifier(e.target.value);
    if (errors.identifier) {
      setErrors((prev) => ({ ...prev, identifier: '' }));
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (errors.password) {
      setErrors((prev) => ({ ...prev, password: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: Record<string, string> = {};

    if (!identifier.trim()) {
      newErrors.identifier = 'Email or username is required';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || '';
      if (msg.toLowerCase().includes('password')) {
        setErrors({
          password: 'Incorrect password. Please verify your password.',
        });
      } else {
        setErrors({
          identifier: msg || 'Invalid email or password. Please try again.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async (userEmail: string) => {
    setErrors({});
    setDemoLoading(userEmail);
    try {
      await login(userEmail, 'Password123');
    } catch (err: any) {
      setErrors({
        identifier: 'Demo login failed. Please try again.',
      });
    } finally {
      setDemoLoading(null);
    }
  };

  return (
    <div className="auth-page">
      {/* Background Animated Orbs */}
      <div className="auth-bg-effects">
        <div className="auth-bg-effects__orb auth-bg-effects__orb--1" />
        <div className="auth-bg-effects__orb auth-bg-effects__orb--2" />
        <div className="auth-bg-effects__orb auth-bg-effects__orb--3" />
      </div>

      <div className="auth-wrapper">
        {/* Brand Side Hero */}
        <div className="auth-hero">
          <div className="auth-hero__brand">
            <div className="auth-hero__logo">💬</div>
            <h1 className="auth-hero__title">DevChat</h1>
          </div>
          <p className="auth-hero__tagline">
            Fast, real-time messaging built for seamless team collaboration.
          </p>

          <div className="auth-hero__features">
            <div className="auth-hero__feature">
              <span className="auth-hero__feature-icon">⚡</span>
              <div>
                <strong>Instant Live Messaging</strong>
                <p>Real-time chat delivery &amp; typing indicators</p>
              </div>
            </div>

            <div className="auth-hero__feature">
              <span className="auth-hero__feature-icon">💬</span>
              <div>
                <strong>Direct &amp; Group Channels</strong>
                <p>1-on-1 private messages &amp; topic-based team channels</p>
              </div>
            </div>

            <div className="auth-hero__feature">
              <span className="auth-hero__feature-icon">🛡️</span>
              <div>
                <strong>Organized Workspace</strong>
                <p>Channel management, moderation &amp; member controls</p>
              </div>
            </div>
          </div>
        </div>

        {/* Auth Card Container */}
        <div className="auth-card">
          <div className="auth-card__header">
            <h2 className="auth-card__title">Welcome Back</h2>
            <p className="auth-card__subtitle">Sign in to your DevChat account</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {/* Email / Username Field */}
            <div className="auth-field">
              <label className="auth-field__label">Email or Username</label>
              <div className="auth-field__input-wrapper">
                <span className="auth-field__icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  type="text"
                  className={`auth-field__input ${errors.identifier ? 'auth-field__input--error' : ''}`}
                  value={identifier}
                  onChange={handleIdentifierChange}
                  placeholder="name@devchat.io or @username"
                  autoFocus
                />
              </div>
              {errors.identifier && (
                <span className="auth-field__error">{errors.identifier}</span>
              )}
            </div>

            {/* Password Field with Show/Hide Toggle */}
            <div className="auth-field">
              <label className="auth-field__label">Password</label>
              <div className="auth-field__input-wrapper">
                <span className="auth-field__icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={`auth-field__input ${errors.password ? 'auth-field__input--error' : ''}`}
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="auth-field__toggle-pw"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && (
                <span className="auth-field__error">{errors.password}</span>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isSubmitting || !!demoLoading}
            >
              {isSubmitting ? (
                <span className="auth-submit-btn__spinner">Signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Quick 1-Click Demo Login */}
          <div className="auth-demo-section">
            <div className="auth-demo-section__divider">
              <span>Quick 1-Click Demo Accounts</span>
            </div>

            <div className="auth-demo-grid">
              {DEMO_USERS.map((user) => (
                <button
                  key={user.email}
                  type="button"
                  className={`auth-demo-card ${demoLoading === user.email ? 'auth-demo-card--loading' : ''}`}
                  onClick={() => handleDemoLogin(user.email)}
                  disabled={isSubmitting || !!demoLoading}
                >
                  <UserAvatar src={user.avatar} displayName={user.name} size="sm" isOnline showStatus />
                  <div className="auth-demo-card__info">
                    <span className="auth-demo-card__name">{user.name}</span>
                    <span className="auth-demo-card__role">{user.role}</span>
                  </div>
                  <span className="auth-demo-card__badge">
                    {demoLoading === user.email ? 'Signing in...' : '1-Click Sign In ➔'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="auth-card__footer">
            <p>
              Don't have an account yet?{' '}
              <Link to="/register" className="auth-link">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
