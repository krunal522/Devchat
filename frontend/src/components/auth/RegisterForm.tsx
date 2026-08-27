import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import './AuthForm.css';

export function RegisterForm() {
  const { register, isLoading } = useAuthStore();
  const [form, setForm] = useState({
    email: '',
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredName, setRegisteredName] = useState('');

  // Per-field error messages
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [field]: e.target.value });
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
    if (formError) setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const newErrors: Record<string, string> = {};

    if (!form.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!form.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (form.username.trim().length < 2) {
      newErrors.username = 'Username must be at least 2 characters';
    }

    if (!form.displayName.trim()) {
      newErrors.displayName = 'Display name is required';
    }

    if (!form.password) {
      newErrors.password = 'Password is required';
    } else if (form.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!form.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (form.password && form.password !== form.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const name = form.displayName.trim();
      await register({
        email: form.email.trim(),
        username: form.username.trim(),
        displayName: name,
        password: form.password,
      });
      setRegisteredName(name);
      setRegistered(true);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Failed to create account. Please try again.';
      setFormError(msg);
    }
  };

  return (
    <div className="auth-page">
      {/* Ambient Glow Orbs */}
      <div className="auth-bg-effects">
        <div className="auth-bg-effects__orb auth-bg-effects__orb--1" />
        <div className="auth-bg-effects__orb auth-bg-effects__orb--2" />
        <div className="auth-bg-effects__orb auth-bg-effects__orb--3" />
      </div>

      <div className="auth-wrapper auth-wrapper--register">
        {/* Brand Side Hero */}
        <div className="auth-hero">
          <div className="auth-hero__brand">
            <div className="auth-hero__logo">💬</div>
            <h1 className="auth-hero__title">DevChat</h1>
          </div>
          <p className="auth-hero__tagline">
            Join thousands of teams collaborating in real-time.
          </p>

          <div className="auth-hero__features">
            <div className="auth-hero__feature">
              <span className="auth-hero__feature-icon">⚡</span>
              <div>
                <strong>Instant Team Access</strong>
                <p>Join team channels &amp; start chatting in seconds</p>
              </div>
            </div>

            <div className="auth-hero__feature">
              <span className="auth-hero__feature-icon">🚀</span>
              <div>
                <strong>Rich Communication</strong>
                <p>Emoji reactions, message updates &amp; direct messaging</p>
              </div>
            </div>

            <div className="auth-hero__feature">
              <span className="auth-hero__feature-icon">🛡️</span>
              <div>
                <strong>Secure &amp; Organized</strong>
                <p>Role-based controls &amp; private direct messaging</p>
              </div>
            </div>
          </div>
        </div>

        {/* Register Card */}
        <div className="auth-card auth-card--scrollable">
          {registered ? (
            /* ── SUCCESS STATE ──────────────────── */
            <div className="auth-success">
              <div className="auth-success__icon-ring">
                <div className="auth-success__checkmark">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
              <h2 className="auth-success__title">Welcome, {registeredName}! 🎉</h2>
              <p className="auth-success__subtitle">
                Your DevChat account has been created successfully. You're all set to start collaborating!
              </p>
              <div className="auth-success__features">
                <div className="auth-success__feature-item">
                  <span>💬</span>
                  <span>Jump into team channels</span>
                </div>
                <div className="auth-success__feature-item">
                  <span>🤝</span>
                  <span>Send direct messages</span>
                </div>
                <div className="auth-success__feature-item">
                  <span>⚡</span>
                  <span>Real-time collaboration</span>
                </div>
              </div>
              <p className="auth-success__redirecting">
                Redirecting you to DevChat...
              </p>
            </div>
          ) : (
            /* ── REGISTER FORM ──────────────────── */
            <>
              <div className="auth-card__header">
                <h2 className="auth-card__title">Create Your Account</h2>
                <p className="auth-card__subtitle">Get started with DevChat in seconds</p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                {/* Email */}
                <div className="auth-field">
                  <label className="auth-field__label">Email Address</label>
                  <div className="auth-field__input-wrapper">
                    <span className="auth-field__icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </span>
                    <input
                      type="email"
                      className={`auth-field__input ${errors.email ? 'auth-field__input--error' : ''}`}
                      value={form.email}
                      onChange={handleChange('email')}
                      placeholder="name@example.com"
                      autoFocus
                    />
                  </div>
                  {errors.email && <span className="auth-field__error">{errors.email}</span>}
                </div>

                {/* Username + Display Name grid */}
                <div className="auth-form__grid">
                  <div className="auth-field">
                    <label className="auth-field__label">Username</label>
                    <div className="auth-field__input-wrapper">
                      <span className="auth-field__icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="4" />
                          <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        className={`auth-field__input ${errors.username ? 'auth-field__input--error' : ''}`}
                        value={form.username}
                        onChange={handleChange('username')}
                        placeholder="john_dev"
                      />
                    </div>
                    {errors.username && <span className="auth-field__error">{errors.username}</span>}
                  </div>

                  <div className="auth-field">
                    <label className="auth-field__label">Display Name</label>
                    <div className="auth-field__input-wrapper">
                      <span className="auth-field__icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        className={`auth-field__input ${errors.displayName ? 'auth-field__input--error' : ''}`}
                        value={form.displayName}
                        onChange={handleChange('displayName')}
                        placeholder="John Doe"
                      />
                    </div>
                    {errors.displayName && <span className="auth-field__error">{errors.displayName}</span>}
                  </div>
                </div>

                {/* Password */}
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
                      value={form.password}
                      onChange={handleChange('password')}
                      placeholder="At least 6 characters"
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
                  {errors.password && <span className="auth-field__error">{errors.password}</span>}
                </div>

                {/* Confirm Password */}
                <div className="auth-field">
                  <label className="auth-field__label">Confirm Password</label>
                  <div className="auth-field__input-wrapper">
                    <span className="auth-field__icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className={`auth-field__input ${errors.confirmPassword ? 'auth-field__input--error' : ''}`}
                      value={form.confirmPassword}
                      onChange={handleChange('confirmPassword')}
                      placeholder="Repeat password"
                    />
                  </div>
                  {errors.confirmPassword && <span className="auth-field__error">{errors.confirmPassword}</span>}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="auth-submit-btn__spinner">Creating account...</span>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </>
                  )}
                </button>

                {/* API Error */}
                {formError && (
                  <p className="auth-form__error-line">
                    ⚠️ {formError}
                  </p>
                )}
              </form>

              <div className="auth-card__footer">
                <p>
                  Already have an account?{' '}
                  <Link to="/login" className="auth-link">
                    Sign in
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
