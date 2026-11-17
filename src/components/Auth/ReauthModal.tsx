import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { CloseButton } from '../Common/CloseButton';
import {
  LinkedProviderStatus,
  mapAuthSecurityError,
  reauthenticateCurrentUser,
  sendAccountPasswordReset,
} from '../../services/accountSecurityService';

export interface ReauthModalProps {
  isOpen: boolean;
  user: User;
  providerStatus: LinkedProviderStatus;
  actionDescription: string;
  onClose: () => void;
  onReauthenticated: () => void | Promise<void>;
}

const GoogleMark: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z"
    />
  </svg>
);

export const ReauthModal: React.FC<ReauthModalProps> = ({
  isOpen,
  user,
  providerStatus,
  actionDescription,
  onClose,
  onReauthenticated,
}) => {
  const defaultMethod: 'password' | 'google' = providerStatus.hasPassword ? 'password' : 'google';
  const [method, setMethod] = useState<'password' | 'google'>(defaultMethod);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMethod(providerStatus.hasPassword ? 'password' : 'google');
      setPassword('');
      setShowPassword(false);
      setIsSubmitting(false);
      setErrorMessage(null);
      setResetSent(false);
    }
  }, [isOpen, providerStatus.hasPassword, providerStatus.hasGoogle]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const bothLinked = providerStatus.hasGoogle && providerStatus.hasPassword;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await reauthenticateCurrentUser(user, 'password', password);
      setPassword('');
      await onReauthenticated();
    } catch (err) {
      const mapped = mapAuthSecurityError(err);
      setErrorMessage(mapped.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleVerify = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await reauthenticateCurrentUser(user, 'google');
      await onReauthenticated();
    } catch (err) {
      const mapped = mapAuthSecurityError(err);
      setErrorMessage(mapped.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (isSubmitting) return;
    setErrorMessage(null);
    try {
      await sendAccountPasswordReset(user);
      setResetSent(true);
    } catch (err) {
      const mapped = mapAuthSecurityError(err);
      setErrorMessage(mapped.message);
    }
  };

  const modalContent = (
    <div
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      className="liquid-glass-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        id="heyroq-reauth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-modal rounded-[28px] w-full max-w-md p-5 sm:p-6 text-slate-900 dark:text-white relative shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[var(--brand-primary)]/12 border border-[var(--brand-primary)]/25 flex items-center justify-center text-[var(--brand-primary)] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="reauth-modal-title"
                className="font-heading text-lg font-bold tracking-tight text-slate-900 dark:text-white"
              >
                Verify your identity
              </h3>
              <p className="text-xs text-slate-500 dark:text-white/55">
                Security confirmation required
              </p>
            </div>
          </div>

          <CloseButton
            onClick={onClose}
            disabled={isSubmitting}
            ariaLabel="Close Identity Verification"
          />
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-white/75 leading-relaxed mb-4">
          To {actionDescription}, please confirm you are the owner of{' '}
          <strong className="font-semibold text-slate-900 dark:text-white">
            {providerStatus.primaryEmail || 'this Heyroq account'}
          </strong>
          .
        </p>

        {/* Multi-provider method selector when both Password and Google are linked */}
        {bothLinked && (
          <div
            role="tablist"
            aria-label="Verification method"
            className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900/[0.06] dark:bg-white/[0.06] mb-4"
          >
            <button
              type="button"
              role="tab"
              aria-selected={method === 'password'}
              onClick={() => {
                setMethod('password');
                setErrorMessage(null);
              }}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                method === 'password'
                  ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-white/65 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Password</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={method === 'google'}
              onClick={() => {
                setMethod('google');
                setErrorMessage(null);
              }}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                method === 'google'
                  ? 'bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-white/65 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <GoogleMark />
              <span>Google</span>
            </button>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {resetSent && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              Password reset link sent to <strong>{providerStatus.primaryEmail}</strong>.
            </span>
          </div>
        )}

        {method === 'password' && providerStatus.hasPassword ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="reauth-current-password"
                className="block text-xs font-semibold text-slate-700 dark:text-white/80 mb-1.5"
              >
                Current Heyroq Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 dark:text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="reauth-current-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your current password"
                  disabled={isSubmitting}
                  autoFocus
                  className="liquid-glass-input w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-[var(--brand-primary)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={handleSendResetEmail}
                  className="text-[11px] font-semibold text-[var(--heyroq-accent-text)] hover:underline cursor-pointer"
                >
                  Forgot password? Send reset link
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="liquid-glass-pill min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-white/85 hover:text-slate-950 dark:hover:text-white transition cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!password || isSubmitting}
                className="heyroq-btn-primary min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify &amp; Continue</span>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3.5">
            <div className="liquid-glass-card rounded-2xl p-3.5 text-xs text-slate-600 dark:text-white/70 leading-relaxed">
              Continue with Google in the secure popup window. Heyroq never asks you to type your
              Google password.
              {providerStatus.googleEmail && (
                <span className="block mt-1 font-semibold text-slate-800 dark:text-white/90">
                  Connected Google account: {providerStatus.googleEmail}
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="liquid-glass-pill min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-white/85 hover:text-slate-950 dark:hover:text-white transition cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGoogleVerify}
                disabled={isSubmitting}
                className="heyroq-btn-primary min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Waiting for Google...</span>
                  </>
                ) : (
                  <>
                    <GoogleMark />
                    <span>Continue with Google</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
