import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  GOOGLE_PROVIDER_ID,
  PASSWORD_PROVIDER_ID,
  SupportedSignInProviderId,
  changeCurrentUserPassword,
  executeDeleteUserAccount,
  isRecentLoginRequiredError,
  linkGoogleToAccount,
  linkPasswordToAccount,
  mapAuthSecurityError,
  reauthenticateCurrentUser,
  requestVerifiedEmailChange,
  sendAccountPasswordReset,
  sendVerificationToCurrentUser,
  unlinkSignInProvider,
  validateHeyroqPassword,
} from '../../services/accountSecurityService';
import { ReauthModal } from '../Auth/ReauthModal';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Link2Off,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

export interface AccountSecuritySectionProps {
  onAccountDeleted?: () => void;
  onBusyStateChange?: (state: { isDeleting: boolean; isReauthing: boolean }) => void;
  resetSignal?: number | boolean;
}

interface PendingReauthTask {
  description: string;
  execute: () => Promise<void>;
}

const GoogleMark: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z"
    />
  </svg>
);

export const AccountSecuritySection: React.FC<AccountSecuritySectionProps> = ({
  onAccountDeleted,
  onBusyStateChange,
  resetSignal,
}) => {
  const { firebaseUser, providerStatus, refreshAuthUser, signOut } = useAuth();

  const [banner, setBanner] = useState<{
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
  } | null>(null);

  // Email state
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isRefreshingEmailStatus, setIsRefreshingEmailStatus] = useState(false);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [pendingNewEmail, setPendingNewEmail] = useState<string | null>(null);
  const [isSubmittingEmailChange, setIsSubmittingEmailChange] = useState(false);

  // Password state
  const passwordSectionRef = useRef<HTMLElement>(null);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isSendingResetLink, setIsSendingResetLink] = useState(false);

  // Sign-in Methods state
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [confirmUnlinkProvider, setConfirmUnlinkProvider] =
    useState<SupportedSignInProviderId | null>(null);
  const [isUnlinkingProvider, setIsUnlinkingProvider] = useState(false);

  // Danger Zone state
  const [isDeleteExpanded, setIsDeleteExpanded] = useState(false);
  const [deleteAcknowledgeChecked, setDeleteAcknowledgeChecked] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Reauth coordinator
  const [pendingReauthTask, setPendingReauthTask] = useState<PendingReauthTask | null>(null);

  useEffect(() => {
    onBusyStateChange?.({
      isDeleting: isDeletingAccount,
      isReauthing: Boolean(pendingReauthTask),
    });
  }, [isDeletingAccount, pendingReauthTask, onBusyStateChange]);

  useEffect(() => {
    if (firebaseUser) {
      refreshAuthUser().catch(() => {});
    }
    setBanner(null);
    setIsChangingEmail(false);
    setNewEmailInput('');
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setConfirmUnlinkProvider(null);
    setIsDeleteExpanded(false);
    setDeleteAcknowledgeChecked(false);
    setDeleteConfirmationText('');
  }, [firebaseUser?.uid, resetSignal]);

  if (!firebaseUser) return null;

  const passwordLengthsMatch =
    newPasswordInput.length >= 8 && newPasswordInput === confirmPasswordInput;

  const runWithReauthFallback = async (description: string, task: () => Promise<void>) => {
    try {
      await task();
    } catch (err) {
      if (isRecentLoginRequiredError(err)) {
        setPendingReauthTask({ description, execute: task });
        return;
      }
      const mapped = mapAuthSecurityError(err);
      if (!mapped.isCancelled) {
        setBanner({
          type: mapped.isCollision ? 'warning' : 'error',
          title: mapped.title,
          message: mapped.message,
        });
      }
    }
  };

  const handleSendVerification = async () => {
    setIsSendingVerification(true);
    setBanner(null);
    try {
      await sendVerificationToCurrentUser(firebaseUser);
      setBanner({
        type: 'success',
        title: 'Verification email sent',
        message: `We sent a verification link to ${providerStatus.primaryEmail}. Open that link and click Refresh Status below.`,
      });
    } catch (err) {
      const mapped = mapAuthSecurityError(err);
      setBanner({ type: 'error', title: mapped.title, message: mapped.message });
    } finally {
      setIsSendingVerification(false);
    }
  };

  const handleRefreshEmailVerification = async () => {
    setIsRefreshingEmailStatus(true);
    setBanner(null);
    try {
      const updated = await refreshAuthUser();
      if (pendingNewEmail && updated.primaryEmail?.toLowerCase() === pendingNewEmail.toLowerCase()) {
        setPendingNewEmail(null);
        setBanner({
          type: 'success',
          title: 'Email address updated',
          message: `Your primary Heyroq email is now ${updated.primaryEmail}.`,
        });
      } else if (updated.emailVerified) {
        setBanner({
          type: 'success',
          title: 'Email verified',
          message: `${updated.primaryEmail} is verified on your Heyroq account.`,
        });
      } else {
        setBanner({
          type: 'warning',
          title: 'Still awaiting verification',
          message:
            'We have not detected the verification click yet. Check your inbox (and spam folder) and click Refresh Status once confirmed.',
        });
      }
    } catch (err) {
      const mapped = mapAuthSecurityError(err);
      setBanner({ type: 'error', title: mapped.title, message: mapped.message });
    } finally {
      setIsRefreshingEmailStatus(false);
    }
  };

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailInput.trim() || isSubmittingEmailChange) return;

    const targetEmail = newEmailInput.trim();
    setBanner(null);

    const performEmailChange = async () => {
      setIsSubmittingEmailChange(true);
      try {
        const result = await requestVerifiedEmailChange(firebaseUser, targetEmail);
        setPendingNewEmail(result.pendingNewEmail);
        setNewEmailInput('');
        setIsChangingEmail(false);
        setBanner({
          type: 'success',
          title: 'Confirm your new email address',
          message: result.message,
        });
      } finally {
        setIsSubmittingEmailChange(false);
      }
    };

    setPendingReauthTask({
      description: `change your email address to ${targetEmail}`,
      execute: async () => {
        try {
          await performEmailChange();
        } catch (err) {
          const mapped = mapAuthSecurityError(err);
          setBanner({
            type: mapped.isCollision ? 'warning' : 'error',
            title: mapped.title,
            message: mapped.message,
          });
        }
      },
    });
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPassword) return;
    setBanner(null);

    const validation = await validateHeyroqPassword(newPasswordInput, confirmPasswordInput);
    if (!validation.isValid) {
      setBanner({
        type: 'error',
        title: 'Check your new password',
        message: validation.errors.join(' '),
      });
      return;
    }

    const performLinkPassword = async () => {
      setIsSubmittingPassword(true);
      try {
        await linkPasswordToAccount(firebaseUser, newPasswordInput, confirmPasswordInput);
        await refreshAuthUser();
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        setBanner({
          type: 'success',
          title: 'Password sign-in enabled',
          message: `You can now sign in with either Google or ${providerStatus.primaryEmail} and your new password. Your Heyroq profile and spots remain unchanged.`,
        });
      } finally {
        setIsSubmittingPassword(false);
      }
    };

    await runWithReauthFallback('enable Email & Password sign-in on your account', performLinkPassword);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPassword) return;
    setBanner(null);

    if (!currentPasswordInput) {
      setBanner({
        type: 'error',
        title: 'Current password required',
        message: 'Please enter your current password to verify your identity.',
      });
      return;
    }

    const validation = await validateHeyroqPassword(newPasswordInput, confirmPasswordInput);
    if (!validation.isValid) {
      setBanner({
        type: 'error',
        title: 'Check your new password',
        message: validation.errors.join(' '),
      });
      return;
    }

    setIsSubmittingPassword(true);
    try {
      await reauthenticateCurrentUser(firebaseUser, 'password', currentPasswordInput);
      await changeCurrentUserPassword(firebaseUser, newPasswordInput, confirmPasswordInput);
      await refreshAuthUser();
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setBanner({
        type: 'success',
        title: 'Password updated',
        message: 'Your Heyroq password has been updated.',
      });
    } catch (err) {
      const mapped = mapAuthSecurityError(err);
      setBanner({ type: 'error', title: mapped.title, message: mapped.message });
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (isSendingResetLink) return;
    setIsSendingResetLink(true);
    setBanner(null);
    try {
      await sendAccountPasswordReset(firebaseUser);
      setBanner({
        type: 'success',
        title: 'Password reset link sent',
        message: `Check ${providerStatus.primaryEmail} for instructions to reset your Heyroq password.`,
      });
    } catch (err) {
      const mapped = mapAuthSecurityError(err);
      setBanner({ type: 'error', title: mapped.title, message: mapped.message });
    } finally {
      setIsSendingResetLink(false);
    }
  };

  const handleConnectGoogle = async () => {
    if (isLinkingGoogle) return;
    setBanner(null);

    const performConnectGoogle = async () => {
      setIsLinkingGoogle(true);
      try {
        const updated = await linkGoogleToAccount(firebaseUser);
        await refreshAuthUser();
        setBanner({
          type: 'success',
          title: 'Google account connected',
          message: `Google (${updated.googleEmail || 'connected'}) is now linked to your Heyroq account. You can sign in using either Google or your password.`,
        });
      } finally {
        setIsLinkingGoogle(false);
      }
    };

    await runWithReauthFallback('connect Google to your Heyroq account', performConnectGoogle);
  };

  const handleConfirmUnlinkProvider = async () => {
    const targetProvider = confirmUnlinkProvider;
    if (!targetProvider || isUnlinkingProvider) return;

    const label = targetProvider === GOOGLE_PROVIDER_ID ? 'Google sign-in' : 'Email & Password sign-in';
    setBanner(null);

    const performUnlink = async () => {
      setIsUnlinkingProvider(true);
      try {
        await unlinkSignInProvider(firebaseUser, targetProvider);
        await refreshAuthUser();
        setConfirmUnlinkProvider(null);
        setBanner({
          type: 'success',
          title: `${label} disconnected`,
          message: `${label} was removed from your Heyroq account. Your remaining sign-in method stays active.`,
        });
      } finally {
        setIsUnlinkingProvider(false);
      }
    };

    setPendingReauthTask({
      description: `remove ${label} from your account`,
      execute: async () => {
        try {
          await performUnlink();
        } catch (err) {
          const mapped = mapAuthSecurityError(err);
          setBanner({ type: 'error', title: mapped.title, message: mapped.message });
        }
      },
    });
  };

  const handleInitiateAccountDeletion = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDeletingAccount) return;

    if (!deleteAcknowledgeChecked || deleteConfirmationText.trim() !== 'DELETE') {
      setBanner({
        type: 'error',
        title: 'Confirmation incomplete',
        message:
          'Please check the permanent deletion acknowledgment box and type DELETE in uppercase.',
      });
      return;
    }

    setBanner(null);

    setPendingReauthTask({
      description: 'permanently delete your Heyroq account',
      execute: async () => {
        setIsDeletingAccount(true);
        try {
          const result = await executeDeleteUserAccount(firebaseUser, deleteConfirmationText);
          if (result.status === 'deleting') {
            setBanner({
              type: 'success',
              title: 'Deletion request received',
              message: result.message,
            });
            return;
          }
          await signOut().catch((error) =>
            console.warn('Could not clear the local session after deletion:', error)
          );
          onAccountDeleted?.();
        } catch (err) {
          const mapped = mapAuthSecurityError(err);
          setBanner({
            type: 'error',
            title: mapped.title,
            message: mapped.message,
          });
        } finally {
          setIsDeletingAccount(false);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          className={`rounded-2xl border p-4 text-xs sm:text-sm flex items-start justify-between gap-3 ${
            banner.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
              : banner.type === 'warning'
                ? 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100'
                : 'border-rose-500/35 bg-rose-500/10 text-rose-900 dark:text-rose-100'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            ) : banner.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            )}
            <div className="space-y-0.5 min-w-0">
              <p className="font-semibold">{banner.title}</p>
              <p className="text-xs opacity-90 leading-relaxed">{banner.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss message"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg opacity-70 hover:opacity-100 cursor-pointer shrink-0 heyroq-focus-ring"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: EMAIL ADDRESS */}
      <section aria-labelledby="sec-email-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3
              id="sec-email-heading"
              className="font-heading text-[15px] sm:text-base font-semibold text-[var(--heyroq-text-primary)] flex items-center gap-2"
            >
              <Mail className="w-4 h-4 text-[var(--brand-primary)] shrink-0" aria-hidden="true" />
              <span>Email Address</span>
            </h3>
            <p className="text-xs text-[var(--heyroq-text-secondary)] mt-0.5">
              Used for sign-in, security notices, and password recovery.
            </p>
          </div>
          <span className="text-xs font-semibold flex items-center gap-1.5">
            {providerStatus.emailVerified ? (
              <span className="text-[var(--heyroq-status-success)] inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Verified</span>
              </span>
            ) : (
              <span className="text-[var(--heyroq-status-warning)] inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Unverified</span>
              </span>
            )}
          </span>
        </div>

        <div className="liquid-glass-card rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-[var(--heyroq-text-muted)]">Primary login email</p>
              <p
                id="account-security-primary-email"
                className="text-sm font-semibold text-[var(--heyroq-text-primary)] truncate mt-0.5"
              >
                {providerStatus.primaryEmail || 'No email set'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!providerStatus.emailVerified && (
                <button
                  id="verify-email-btn"
                  type="button"
                  onClick={handleSendVerification}
                  disabled={isSendingVerification}
                  className="heyroq-btn-primary min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50 heyroq-focus-ring"
                >
                  {isSendingVerification ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Mail className="w-3.5 h-3.5" />
                  )}
                  <span>Verify Email</span>
                </button>
              )}

              {(!providerStatus.emailVerified || pendingNewEmail) && (
                <button
                  type="button"
                  onClick={handleRefreshEmailVerification}
                  disabled={isRefreshingEmailStatus}
                  className="heyroq-btn-secondary min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap heyroq-focus-ring"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRefreshingEmailStatus ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh Status</span>
                </button>
              )}

              <button
                id="toggle-change-email-btn"
                type="button"
                onClick={() => {
                  setIsChangingEmail((prev) => !prev);
                  setBanner(null);
                }}
                className="heyroq-btn-secondary min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap heyroq-focus-ring"
              >
                {isChangingEmail ? 'Cancel' : 'Change Email'}
              </button>
            </div>
          </div>

          {pendingNewEmail && (
            <div className="pt-3.5 border-t border-[var(--heyroq-border-subtle)] text-xs text-[var(--heyroq-status-warning)] leading-relaxed">
              Pending verification sent to <strong>{pendingNewEmail}</strong>. Your current address
              (<strong>{providerStatus.primaryEmail}</strong>) stays active until you confirm the
              link sent to the new address.
            </div>
          )}

          {isChangingEmail && (
            <form
              onSubmit={handleRequestEmailChange}
              className="pt-4 border-t border-[var(--heyroq-border-subtle)] space-y-3"
            >
              <div>
                <label
                  htmlFor="new-email-input"
                  className="block text-xs font-semibold text-[var(--heyroq-text-secondary)] mb-1.5"
                >
                  New Email Address
                </label>
                <input
                  id="new-email-input"
                  type="email"
                  autoComplete="email"
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  disabled={isSubmittingEmailChange}
                  className="liquid-glass-input w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-[var(--brand-primary)]"
                />
              </div>
              <p className="text-xs text-[var(--heyroq-text-secondary)] leading-relaxed">
                We will send a verification link to your new email address before switching your
                login email.
                {providerStatus.hasGoogle &&
                  ' Changing your Heyroq email does not alter your external Google account address.'}
              </p>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!newEmailInput.trim() || isSubmittingEmailChange}
                  className="heyroq-btn-primary min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap heyroq-focus-ring"
                >
                  {isSubmittingEmailChange ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending Confirmation…</span>
                    </>
                  ) : (
                    <span>Send Confirmation Link</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* SECTION 2: PASSWORD MANAGEMENT */}
      <section
        ref={passwordSectionRef}
        aria-labelledby="sec-password-heading"
        className="space-y-3 pt-5 border-t border-slate-900/8 dark:border-white/10"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3
              id="sec-password-heading"
              className="font-heading text-[15px] sm:text-base font-semibold text-[var(--heyroq-text-primary)] flex items-center gap-2"
            >
              <KeyRound className="w-4 h-4 text-[var(--brand-primary)] shrink-0" aria-hidden="true" />
              <span>{providerStatus.hasPassword ? 'Change Password' : 'Set Password'}</span>
            </h3>
            <p className="text-xs text-[var(--heyroq-text-secondary)] mt-0.5">
              {providerStatus.hasPassword
                ? 'Update your password or request a password reset link by email.'
                : 'Add password sign-in alongside your connected Google account.'}
            </p>
          </div>
          <span className="text-xs font-medium text-[var(--heyroq-text-muted)]">
            {providerStatus.hasPassword ? 'Password enabled' : 'Google-only account'}
          </span>
        </div>

        <div className="liquid-glass-card rounded-2xl p-4 sm:p-5">
          {!providerStatus.hasPassword ? (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <p className="text-xs text-[var(--heyroq-text-secondary)] leading-relaxed">
                Your account currently signs in with Google. Setting a password adds{' '}
                <strong className="font-semibold text-[var(--heyroq-text-primary)]">
                  Email &amp; Password
                </strong>{' '}
                sign-in for{' '}
                <strong className="font-semibold text-[var(--heyroq-text-primary)]">
                  {providerStatus.primaryEmail}
                </strong>{' '}
                on this exact Heyroq profile without affecting Google sign-in or your spots.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="set-new-password"
                    className="block text-xs font-semibold text-[var(--heyroq-text-secondary)] mb-1.5"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[var(--heyroq-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="set-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="At least 8 characters"
                      disabled={isSubmittingPassword}
                      className="liquid-glass-input w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-xl text-sm text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-[var(--brand-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] cursor-pointer rounded-lg"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="set-confirm-password"
                    className="block text-xs font-semibold text-[var(--heyroq-text-secondary)] mb-1.5"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[var(--heyroq-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="set-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value)}
                      placeholder="Re-enter password"
                      disabled={isSubmittingPassword}
                      className="liquid-glass-input w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-xl text-sm text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-[var(--brand-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={
                        showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'
                      }
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] cursor-pointer rounded-lg"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <span className="text-xs text-[var(--heyroq-text-muted)]">
                  {newPasswordInput.length === 0
                    ? 'Minimum 8 characters recommended.'
                    : newPasswordInput.length < 8
                      ? 'Keep typing — use at least 8 characters.'
                      : passwordLengthsMatch
                        ? 'Passwords match and meet length requirements.'
                        : 'Confirm your password so both fields match.'}
                </span>

                <button
                  id="submit-set-password-btn"
                  type="submit"
                  disabled={!newPasswordInput || !confirmPasswordInput || isSubmittingPassword}
                  className="heyroq-btn-primary min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap heyroq-focus-ring"
                >
                  {isSubmittingPassword ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Enabling Password…</span>
                    </>
                  ) : (
                    <span>Set Password</span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="change-current-password"
                    className="text-xs font-semibold text-[var(--heyroq-text-secondary)]"
                  >
                    Current Password
                  </label>
                  <button
                    type="button"
                    onClick={handleSendPasswordReset}
                    disabled={isSendingResetLink}
                    className="text-xs font-semibold text-[var(--heyroq-accent-text)] hover:underline cursor-pointer disabled:opacity-50 heyroq-focus-ring rounded"
                  >
                    {isSendingResetLink
                      ? 'Sending reset link…'
                      : 'Forgot password? Send reset email'}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--heyroq-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="change-current-password"
                    type={showCurrentPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="Enter current password"
                    disabled={isSubmittingPassword}
                    className="liquid-glass-input w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-xl text-sm text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-[var(--brand-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] cursor-pointer rounded-lg"
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="change-new-password"
                    className="block text-xs font-semibold text-[var(--heyroq-text-secondary)] mb-1.5"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[var(--heyroq-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="change-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="At least 8 characters"
                      disabled={isSubmittingPassword}
                      className="liquid-glass-input w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-xl text-sm text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-[var(--brand-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] cursor-pointer rounded-lg"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="change-confirm-password"
                    className="block text-xs font-semibold text-[var(--heyroq-text-secondary)] mb-1.5"
                  >
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[var(--heyroq-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="change-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value)}
                      placeholder="Re-enter new password"
                      disabled={isSubmittingPassword}
                      className="liquid-glass-input w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-xl text-sm text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-[var(--brand-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={
                        showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'
                      }
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] cursor-pointer rounded-lg"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <span className="text-xs text-[var(--heyroq-text-muted)]">
                  {newPasswordInput.length === 0
                    ? 'Use at least 8 characters.'
                    : passwordLengthsMatch
                      ? 'New password confirmed.'
                      : 'Ensure new password is 8+ characters and matches confirmation.'}
                </span>

                <button
                  id="submit-change-password-btn"
                  type="submit"
                  disabled={
                    !currentPasswordInput ||
                    !newPasswordInput ||
                    !confirmPasswordInput ||
                    isSubmittingPassword
                  }
                  className="heyroq-btn-primary min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap heyroq-focus-ring"
                >
                  {isSubmittingPassword ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating Password…</span>
                    </>
                  ) : (
                    <span>Update Password</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* SECTION 3: CONNECTED SIGN-IN METHODS */}
      <section
        aria-labelledby="sec-providers-heading"
        className="space-y-3 pt-5 border-t border-slate-900/8 dark:border-white/10"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3
              id="sec-providers-heading"
              className="font-heading text-[15px] sm:text-base font-semibold text-[var(--heyroq-text-primary)] flex items-center gap-2"
            >
              <Link2 className="w-4 h-4 text-[var(--brand-primary)] shrink-0" aria-hidden="true" />
              <span>Sign-in Methods</span>
            </h3>
            <p className="text-xs text-[var(--heyroq-text-secondary)] mt-0.5">
              Connect or manage how you sign in to Heyroq. At least one method must remain active.
            </p>
          </div>
          <span className="text-xs font-medium text-[var(--heyroq-text-muted)] tabular-nums">
            {providerStatus.usableProviderCount} active{' '}
            {providerStatus.usableProviderCount === 1 ? 'method' : 'methods'}
          </span>
        </div>

        <div className="liquid-glass-card rounded-2xl divide-y divide-[var(--heyroq-border-subtle)] overflow-hidden">
          {/* Google Provider Row */}
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[var(--heyroq-bg-elevated)] border border-[var(--heyroq-border-subtle)] flex items-center justify-center shrink-0">
                <GoogleMark />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[var(--heyroq-text-primary)]">
                    Google
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      providerStatus.hasGoogle
                        ? 'text-[var(--heyroq-status-success)]'
                        : 'text-[var(--heyroq-text-muted)]'
                    }`}
                  >
                    · {providerStatus.hasGoogle ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
                <p className="text-xs text-[var(--heyroq-text-secondary)] truncate mt-0.5">
                  {providerStatus.hasGoogle
                    ? providerStatus.googleEmail || 'Connected for one-click sign-in'
                    : 'Connect your Google account for fast, passwordless sign-in.'}
                </p>
                {providerStatus.hasGoogle && !providerStatus.canUnlinkGoogle && (
                  <p className="text-xs text-[var(--heyroq-text-muted)] mt-1">
                    Set a password above if you ever want to disconnect Google.
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {providerStatus.hasGoogle ? (
                <button
                  id="disconnect-google-btn"
                  type="button"
                  disabled={!providerStatus.canUnlinkGoogle || isUnlinkingProvider}
                  onClick={() => setConfirmUnlinkProvider(GOOGLE_PROVIDER_ID)}
                  title={
                    !providerStatus.canUnlinkGoogle
                      ? 'Set a password first so you always keep at least one sign-in method'
                      : 'Disconnect Google sign-in'
                  }
                  className="heyroq-btn-secondary min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap heyroq-focus-ring"
                >
                  <Link2Off className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              ) : (
                <button
                  id="connect-google-btn"
                  type="button"
                  disabled={isLinkingGoogle}
                  onClick={handleConnectGoogle}
                  className="heyroq-btn-primary min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap heyroq-focus-ring"
                >
                  {isLinkingGoogle ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Connecting…</span>
                    </>
                  ) : (
                    <>
                      <GoogleMark />
                      <span>Connect Google</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Email & Password Provider Row */}
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[var(--heyroq-bg-elevated)] border border-[var(--heyroq-border-subtle)] flex items-center justify-center shrink-0 text-[var(--brand-primary)]">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[var(--heyroq-text-primary)]">
                    Email &amp; Password
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      providerStatus.hasPassword
                        ? 'text-[var(--heyroq-status-success)]'
                        : 'text-[var(--heyroq-text-muted)]'
                    }`}
                  >
                    · {providerStatus.hasPassword ? 'Enabled' : 'Not Enabled'}
                  </span>
                </div>
                <p className="text-xs text-[var(--heyroq-text-secondary)] truncate mt-0.5">
                  {providerStatus.hasPassword
                    ? `Sign in with ${providerStatus.primaryEmail} and your password`
                    : 'Set a password above to sign in with your email address.'}
                </p>
                {providerStatus.hasPassword && !providerStatus.canUnlinkPassword && (
                  <p className="text-xs text-[var(--heyroq-text-muted)] mt-1">
                    Connect Google first if you want to remove password sign-in.
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {providerStatus.hasPassword ? (
                <button
                  id="disconnect-password-btn"
                  type="button"
                  disabled={!providerStatus.canUnlinkPassword || isUnlinkingProvider}
                  onClick={() => setConfirmUnlinkProvider(PASSWORD_PROVIDER_ID)}
                  title={
                    !providerStatus.canUnlinkPassword
                      ? 'Connect Google first so you always keep at least one sign-in method'
                      : 'Remove password sign-in'
                  }
                  className="heyroq-btn-secondary min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap heyroq-focus-ring"
                >
                  <Link2Off className="w-3.5 h-3.5" />
                  <span>Remove Password</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    passwordSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    document.getElementById('set-new-password')?.focus();
                  }}
                  className="heyroq-btn-secondary min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold hover:border-[var(--brand-primary)] transition cursor-pointer whitespace-nowrap heyroq-focus-ring"
                >
                  Set Password Above
                </button>
              )}
            </div>
          </div>

          {/* Inline Unlink Confirmation Drawer */}
          {confirmUnlinkProvider && (
            <div className="p-4 sm:p-5 bg-amber-500/[0.07] space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-[var(--heyroq-text-primary)]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--heyroq-status-warning)]" />
                <div className="space-y-1 leading-relaxed">
                  <p className="font-semibold">
                    {confirmUnlinkProvider === GOOGLE_PROVIDER_ID
                      ? 'Disconnect Google sign-in?'
                      : 'Remove Email & Password sign-in?'}
                  </p>
                  <p className="text-[var(--heyroq-text-secondary)]">
                    {confirmUnlinkProvider === GOOGLE_PROVIDER_ID
                      ? `After disconnecting Google, you will sign in using ${providerStatus.primaryEmail} and your Heyroq password. Your profile and spots will not be affected.`
                      : `After removing your password, you will sign in exclusively with your connected Google account (${providerStatus.googleEmail || providerStatus.primaryEmail}).`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmUnlinkProvider(null)}
                  disabled={isUnlinkingProvider}
                  className="heyroq-btn-secondary min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap heyroq-focus-ring"
                >
                  Keep Connected
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnlinkProvider}
                  disabled={isUnlinkingProvider}
                  className="heyroq-btn-destructive min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap heyroq-focus-ring"
                >
                  {isUnlinkingProvider ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating…</span>
                    </>
                  ) : (
                    <span>Confirm Disconnect</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 4: DANGER ZONE — DELETE ACCOUNT */}
      <section
        aria-labelledby="sec-danger-heading"
        className="space-y-3 pt-5 border-t border-slate-900/8 dark:border-white/10"
      >
        <h3
          id="sec-danger-heading"
          className="font-heading text-[15px] sm:text-base font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Danger Zone</span>
        </h3>

        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.04] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--heyroq-text-primary)]">
                Delete Heyroq Account
              </p>
              <p className="text-xs text-[var(--heyroq-text-secondary)] leading-relaxed">
                Permanently deletes your profile, published spots, comments, likes, follow
                connections, Explorer Progression XP, and sign-in credentials. Older spot photos may
                remain accessible if their references are shared or unverified.
              </p>
            </div>

            {!isDeleteExpanded && (
              <button
                id="expand-delete-account-btn"
                type="button"
                onClick={() => setIsDeleteExpanded(true)}
                className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold border border-rose-500/40 bg-rose-600/10 hover:bg-rose-600 text-rose-700 dark:text-rose-300 hover:text-white transition cursor-pointer shrink-0 whitespace-nowrap heyroq-focus-ring"
              >
                Delete Account
              </button>
            )}
          </div>

          {isDeleteExpanded && (
            <form
              onSubmit={handleInitiateAccountDeletion}
              className="pt-4 border-t border-rose-500/20 space-y-4"
            >
              <div className="text-xs text-rose-800 dark:text-rose-200 leading-relaxed space-y-1.5">
                <p className="font-semibold">This action is irreversible:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>All pins and spot photos you uploaded will be permanently erased.</li>
                  <li>Your comments, likes, followers, and following links will be removed.</li>
                  <li>Your Explorer Level, XP ledger, and unlocked badges cannot be recovered.</li>
                </ul>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-[var(--heyroq-text-primary)] cursor-pointer select-none min-h-[44px] py-1">
                <input
                  id="delete-account-ack-checkbox"
                  type="checkbox"
                  checked={deleteAcknowledgeChecked}
                  onChange={(e) => setDeleteAcknowledgeChecked(e.target.checked)}
                  disabled={isDeletingAccount}
                  className="mt-0.5 w-4 h-4 rounded accent-rose-600 cursor-pointer shrink-0"
                />
                <span>I understand that deleting my Heyroq account cannot be undone.</span>
              </label>

              <div>
                <label
                  htmlFor="delete-account-confirm-input"
                  className="block text-xs font-semibold text-[var(--heyroq-text-secondary)] mb-1.5"
                >
                  Type{' '}
                  <span className="font-mono font-bold text-rose-700 dark:text-rose-400">
                    DELETE
                  </span>{' '}
                  to confirm
                </label>
                <input
                  id="delete-account-confirm-input"
                  type="text"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  disabled={isDeletingAccount}
                  className="liquid-glass-input w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-mono text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteExpanded(false);
                    setDeleteAcknowledgeChecked(false);
                    setDeleteConfirmationText('');
                  }}
                  disabled={isDeletingAccount}
                  className="heyroq-btn-secondary min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-40 whitespace-nowrap heyroq-focus-ring"
                >
                  Cancel
                </button>
                <button
                  id="confirm-delete-account-btn"
                  type="submit"
                  disabled={
                    !deleteAcknowledgeChecked ||
                    deleteConfirmationText.trim() !== 'DELETE' ||
                    isDeletingAccount
                  }
                  className="heyroq-btn-destructive min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap heyroq-focus-ring"
                >
                  {isDeletingAccount ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting Account &amp; Data…</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Permanently Delete Account</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Unified Reauthentication Modal */}
      <ReauthModal
        isOpen={Boolean(pendingReauthTask)}
        user={firebaseUser}
        providerStatus={providerStatus}
        actionDescription={pendingReauthTask?.description || 'continue'}
        onClose={() => setPendingReauthTask(null)}
        onReauthenticated={async () => {
          const task = pendingReauthTask;
          setPendingReauthTask(null);
          if (task) {
            await task.execute();
          }
        }}
      />
    </div>
  );
};
