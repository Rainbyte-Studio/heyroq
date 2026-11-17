import {
  EmailAuthProvider,
  GoogleAuthProvider,
  User,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  unlink,
  updatePassword,
  validatePassword,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';

export const GOOGLE_PROVIDER_ID = 'google.com';
export const PASSWORD_PROVIDER_ID = 'password';

export type SupportedSignInProviderId = typeof GOOGLE_PROVIDER_ID | typeof PASSWORD_PROVIDER_ID;

export interface MinimalProviderInfo {
  providerId: string;
  email?: string | null;
  displayName?: string | null;
}

export interface MinimalSecurityUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  providerData: readonly MinimalProviderInfo[];
}

export interface LinkedProviderStatus {
  uid: string;
  primaryEmail: string | null;
  emailVerified: boolean;
  hasGoogle: boolean;
  hasPassword: boolean;
  googleEmail: string | null;
  passwordEmail: string | null;
  usableProviderCount: number;
  canUnlinkGoogle: boolean;
  canUnlinkPassword: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface EmailChangeResult {
  status: 'verification_sent';
  currentEmail: string;
  pendingNewEmail: string;
  hasGoogleConnected: boolean;
  message: string;
}

export interface AccountSecurityErrorInfo {
  code: string;
  title: string;
  message: string;
  requiresReauth: boolean;
  isCollision: boolean;
  isCancelled: boolean;
}

export class AccountSecurityError extends Error {
  public readonly code: string;
  public readonly requiresReauth: boolean;
  public readonly isCollision: boolean;

  constructor(
    code: string,
    message: string,
    options?: { requiresReauth?: boolean; isCollision?: boolean }
  ) {
    super(message);
    this.name = 'AccountSecurityError';
    this.code = code;
    this.requiresReauth = Boolean(options?.requiresReauth);
    this.isCollision = Boolean(options?.isCollision);
  }
}

/**
 * Adapter interface enabling deterministic unit testing of all Account & Security workflows
 * without mutating production accounts, while defaulting to live Firebase v12 SDK operations.
 */
export interface AuthSecurityAdapter<TUser extends MinimalSecurityUser = User> {
  reloadUser(user: TUser): Promise<void>;
  validatePasswordPolicy(password: string): Promise<{
    isValid: boolean;
    containsLowercaseLetter?: boolean;
    containsUppercaseLetter?: boolean;
    containsNumericCharacter?: boolean;
    containsNonAlphanumericCharacter?: boolean;
    meetsMinPasswordLength?: boolean;
    meetsMaxPasswordLength?: boolean;
    minPasswordLength?: number;
  } | null>;
  reauthWithPassword(user: TUser, email: string, currentPassword: string): Promise<void>;
  reauthWithGoogle(user: TUser): Promise<void>;
  linkPassword(user: TUser, email: string, newPassword: string): Promise<void>;
  linkGoogle(user: TUser): Promise<void>;
  unlinkProvider(user: TUser, providerId: SupportedSignInProviderId): Promise<void>;
  updateUserPassword(user: TUser, newPassword: string): Promise<void>;
  sendVerificationEmail(user: TUser): Promise<void>;
  requestVerifyBeforeUpdateEmail(user: TUser, newEmail: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  callDeleteUserAccount(): Promise<{ success: boolean; message?: string }>;
}

export const defaultFirebaseSecurityAdapter: AuthSecurityAdapter<User> = {
  async reloadUser(user: User) {
    await reload(user);
  },
  async validatePasswordPolicy(password: string) {
    try {
      const status = await validatePassword(auth, password);
      return {
        isValid: status.isValid,
        containsLowercaseLetter: status.containsLowercaseLetter,
        containsUppercaseLetter: status.containsUppercaseLetter,
        containsNumericCharacter: status.containsNumericCharacter,
        containsNonAlphanumericCharacter: status.containsNonAlphanumericCharacter,
        meetsMinPasswordLength: status.meetsMinPasswordLength,
        meetsMaxPasswordLength: status.meetsMaxPasswordLength,
        minPasswordLength: status.passwordPolicy?.customStrengthOptions?.minPasswordLength,
      };
    } catch {
      // Fallback gracefully if Firebase password policy endpoint is unreachable offline
      return null;
    }
  },
  async reauthWithPassword(user: User, email: string, currentPassword: string) {
    const credential = EmailAuthProvider.credential(email, currentPassword);
    await reauthenticateWithCredential(user, credential);
  },
  async reauthWithGoogle(user: User) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await reauthenticateWithPopup(user, provider);
  },
  async linkPassword(user: User, email: string, newPassword: string) {
    const credential = EmailAuthProvider.credential(email, newPassword);
    await linkWithCredential(user, credential);
  },
  async linkGoogle(user: User) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await linkWithPopup(user, provider);
  },
  async unlinkProvider(user: User, providerId: SupportedSignInProviderId) {
    await unlink(user, providerId);
  },
  async updateUserPassword(user: User, newPassword: string) {
    await updatePassword(user, newPassword);
  },
  async sendVerificationEmail(user: User) {
    await sendEmailVerification(user);
  },
  async requestVerifyBeforeUpdateEmail(user: User, newEmail: string) {
    await verifyBeforeUpdateEmail(user, newEmail);
  },
  async sendPasswordReset(email: string) {
    await sendPasswordResetEmail(auth, email);
  },
  async callDeleteUserAccount() {
    const callable = httpsCallable<Record<string, never>, { success: boolean; message?: string }>(
      functions,
      'deleteUserAccount'
    );
    const response = await callable({});
    return response.data;
  },
};

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmailAddress(email: string): boolean {
  const clean = email.trim();
  return clean.length <= 254 && EMAIL_FORMAT_REGEX.test(clean);
}

/**
 * Inspects the authoritative `user.providerData` list from Firebase Auth.
 * NEVER infers password availability from the mere presence of `user.email`.
 */
export function getLinkedProviderStatus(
  user: MinimalSecurityUser | null | undefined
): LinkedProviderStatus {
  if (!user) {
    return {
      uid: '',
      primaryEmail: null,
      emailVerified: false,
      hasGoogle: false,
      hasPassword: false,
      googleEmail: null,
      passwordEmail: null,
      usableProviderCount: 0,
      canUnlinkGoogle: false,
      canUnlinkPassword: false,
    };
  }

  const providers = Array.isArray(user.providerData) ? user.providerData : [];
  const googleEntry = providers.find((p) => p?.providerId === GOOGLE_PROVIDER_ID);
  const passwordEntry = providers.find((p) => p?.providerId === PASSWORD_PROVIDER_ID);

  const hasGoogle = Boolean(googleEntry);
  const hasPassword = Boolean(passwordEntry);
  const usableProviderCount = (hasGoogle ? 1 : 0) + (hasPassword ? 1 : 0);

  return {
    uid: user.uid,
    primaryEmail: user.email || googleEntry?.email || passwordEntry?.email || null,
    emailVerified: Boolean(user.emailVerified),
    hasGoogle,
    hasPassword,
    googleEmail: googleEntry?.email || null,
    passwordEmail: passwordEntry?.email || null,
    usableProviderCount,
    // Last-provider protection: unlinking is allowed ONLY when >= 1 other usable sign-in method remains
    canUnlinkGoogle: hasGoogle && hasPassword,
    canUnlinkPassword: hasPassword && hasGoogle,
  };
}

/**
 * Detects whether an error from Firebase Auth or Cloud Functions indicates that
 * recent reauthentication is required before retrying a sensitive action.
 */
export function isRecentLoginRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; requiresReauth?: boolean };
  if (err.requiresReauth === true) return true;
  const code = String(err.code || '');
  const message = String(err.message || '');
  return (
    code === 'auth/requires-recent-login' ||
    code === 'RECENT_LOGIN_REQUIRED' ||
    (code.includes('failed-precondition') &&
      (message.includes('RECENT_LOGIN_REQUIRED') || message.includes('requires-recent-login')))
  );
}

/**
 * Maps Firebase Auth & Cloud Functions errors into clear, safe, non-technical guidance
 * without leaking credentials or internal stack traces.
 */
export function mapAuthSecurityError(error: unknown): AccountSecurityErrorInfo {
  if (error instanceof AccountSecurityError) {
    return {
      code: error.code,
      title: error.isCollision
        ? 'Sign-in method already linked elsewhere'
        : error.requiresReauth
          ? 'Verify your identity to continue'
          : 'Security check required',
      message: error.message,
      requiresReauth: error.requiresReauth,
      isCollision: error.isCollision,
      isCancelled: false,
    };
  }

  const rawCode = String((error as any)?.code || '');
  const rawMessage = String((error as any)?.message || '');

  if (isRecentLoginRequiredError(error)) {
    return {
      code: 'auth/requires-recent-login',
      title: 'Please verify your identity',
      message:
        'For your security, please re-enter your password or re-verify with Google before completing this sensitive account change.',
      requiresReauth: true,
      isCollision: false,
      isCancelled: false,
    };
  }

  switch (rawCode) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return {
        code: rawCode,
        title: 'Verification cancelled',
        message: 'The Google verification window was closed before completing. No changes were made to your account.',
        requiresReauth: false,
        isCollision: false,
        isCancelled: true,
      };
    case 'auth/popup-blocked':
      return {
        code: rawCode,
        title: 'Popup blocked by browser',
        message:
          'Your browser blocked the Google verification popup. Please allow popups for this site and try again.',
        requiresReauth: false,
        isCollision: false,
        isCancelled: false,
      };
    case 'auth/credential-already-in-use':
    case 'auth/email-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return {
        code: rawCode,
        title: 'Already linked to another Heyroq account',
        message:
          'This Google account or email address is already associated with a separate Heyroq account. To protect both accounts, Heyroq never merges accounts automatically. Your current account and data remain untouched.',
        requiresReauth: false,
        isCollision: true,
        isCancelled: false,
      };
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return {
        code: rawCode,
        title: 'Incorrect credentials',
        message: 'The password or Google account you verified with did not match this Heyroq account.',
        requiresReauth: false,
        isCollision: false,
        isCancelled: false,
      };
    case 'auth/user-mismatch':
      return {
        code: rawCode,
        title: 'Different Google account selected',
        message:
          'Please select the exact Google account currently connected to your Heyroq profile when verifying.',
        requiresReauth: false,
        isCollision: false,
        isCancelled: false,
      };
    case 'auth/weak-password':
      return {
        code: rawCode,
        title: 'Password is too weak',
        message: 'Please choose a stronger password with at least 8 characters.',
        requiresReauth: false,
        isCollision: false,
        isCancelled: false,
      };
    case 'auth/invalid-email':
      return {
        code: rawCode,
        title: 'Invalid email address',
        message: 'Please enter a valid email address.',
        requiresReauth: false,
        isCollision: false,
        isCancelled: false,
      };
    case 'auth/too-many-requests':
      return {
        code: rawCode,
        title: 'Too many attempts',
        message:
          'Too many security requests were made in a short time. Please wait a few minutes before trying again.',
        requiresReauth: false,
        isCollision: false,
        isCancelled: false,
      };
    case 'auth/network-request-failed':
      return {
        code: rawCode,
        title: 'Network connection interrupted',
        message: 'Unable to reach the authentication service. Check your internet connection and try again.',
        requiresReauth: false,
        isCollision: false,
        isCancelled: false,
      };
    case 'auth/user-token-expired':
      return {
        code: rawCode,
        title: 'Session expired',
        message: 'Your sign-in session expired. Please verify your identity again to continue.',
        requiresReauth: true,
        isCollision: false,
        isCancelled: false,
      };
    case 'auth/provider-already-linked':
      return {
        code: rawCode,
        title: 'Already connected',
        message: 'This sign-in method is already enabled on your Heyroq account.',
        requiresReauth: false,
        isCollision: false,
        isCancelled: false,
      };
    default:
      return {
        code: rawCode || 'unknown',
        title: 'Unable to complete security action',
        message:
          rawMessage && !rawMessage.includes('Firebase:')
            ? rawMessage
            : 'An unexpected error occurred while updating your account security. No data was lost—please try again.',
        requiresReauth: false,
        isCollision: false,
        isCancelled: false,
      };
  }
}

/**
 * Validates a new password and confirmation against Heyroq baseline rules (minimum 8 chars recommended,
 * strict >= 6 Firebase baseline) AND the live Firebase project password policy when configured.
 */
export async function validateHeyroqPassword(
  password: string,
  confirmPassword: string,
  adapter: Pick<AuthSecurityAdapter<any>, 'validatePasswordPolicy'> = defaultFirebaseSecurityAdapter
): Promise<PasswordValidationResult> {
  const errors: string[] = [];

  if (!password) {
    errors.push('Please enter a password.');
  } else if (password.length < 8) {
    errors.push('Use at least 8 characters for strong account protection.');
  }

  if (!confirmPassword) {
    errors.push('Please confirm your password.');
  } else if (password !== confirmPassword) {
    errors.push('Passwords do not match.');
  }

  if (password && password.length >= 6) {
    const policy = await adapter.validatePasswordPolicy(password);
    if (policy && !policy.isValid) {
      if (policy.meetsMinPasswordLength === false) {
        const minLen = policy.minPasswordLength || 8;
        errors.push(`Password must be at least ${minLen} characters long.`);
      }
      if (policy.meetsMaxPasswordLength === false) {
        errors.push('Password exceeds the maximum allowed length.');
      }
      if (policy.containsLowercaseLetter === false) {
        errors.push('Include at least one lowercase letter.');
      }
      if (policy.containsUppercaseLetter === false) {
        errors.push('Include at least one uppercase letter.');
      }
      if (policy.containsNumericCharacter === false) {
        errors.push('Include at least one number.');
      }
      if (policy.containsNonAlphanumericCharacter === false) {
        errors.push('Include at least one symbol (such as !@#$%).');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors: Array.from(new Set(errors)),
  };
}

/**
 * Reauthenticates the active user using either their linked Email/Password credential
 * or Google OAuth popup. Verifies that the active UID never changes.
 */
export async function reauthenticateCurrentUser<TUser extends MinimalSecurityUser = User>(
  user: TUser,
  method: 'password' | 'google',
  passwordInput?: string,
  adapter: AuthSecurityAdapter<TUser> = defaultFirebaseSecurityAdapter as unknown as AuthSecurityAdapter<TUser>
): Promise<void> {
  if (!user || !user.uid) {
    throw new AccountSecurityError('auth/no-current-user', 'You must be signed in to verify your identity.');
  }

  const originalUid = user.uid;
  const status = getLinkedProviderStatus(user);

  if (method === 'password') {
    if (!status.hasPassword) {
      throw new AccountSecurityError(
        'auth/password-not-enabled',
        'Email & Password sign-in is not enabled on this account. Please verify with Google instead.'
      );
    }
    const email = user.email || status.passwordEmail;
    if (!email) {
      throw new AccountSecurityError('auth/missing-email', 'No email address is associated with this account.');
    }
    if (!passwordInput) {
      throw new AccountSecurityError('auth/missing-password', 'Please enter your current password.');
    }
    await adapter.reauthWithPassword(user, email, passwordInput);
  } else {
    if (!status.hasGoogle) {
      throw new AccountSecurityError(
        'auth/google-not-connected',
        'Google is not connected to this account. Please verify using your password.'
      );
    }
    await adapter.reauthWithGoogle(user);
  }

  if (user.uid !== originalUid) {
    throw new AccountSecurityError(
      'auth/uid-invariant-violation',
      'Identity mismatch detected during reauthentication. Operation aborted safely.'
    );
  }
}

/**
 * Section 4: Google Account -> Set Password (adds Email/Password provider to an existing Google account).
 * Preserves the exact Firebase UID and never creates a duplicate user or profile.
 */
export async function linkPasswordToAccount<TUser extends MinimalSecurityUser = User>(
  user: TUser,
  newPassword: string,
  confirmPassword: string,
  adapter: AuthSecurityAdapter<TUser> = defaultFirebaseSecurityAdapter as unknown as AuthSecurityAdapter<TUser>
): Promise<LinkedProviderStatus> {
  if (!user || !user.uid) {
    throw new AccountSecurityError('auth/no-current-user', 'You must be signed in to set a password.');
  }

  const originalUid = user.uid;
  const initialStatus = getLinkedProviderStatus(user);

  if (initialStatus.hasPassword) {
    throw new AccountSecurityError(
      'auth/provider-already-linked',
      'A password is already enabled on your account. Use Change Password instead.'
    );
  }

  const email = user.email || initialStatus.googleEmail;
  if (!email) {
    throw new AccountSecurityError(
      'auth/missing-email',
      'Your account needs a verified email address before setting a password.'
    );
  }

  const validation = await validateHeyroqPassword(newPassword, confirmPassword, adapter);
  if (!validation.isValid) {
    throw new AccountSecurityError('auth/invalid-password-policy', validation.errors[0]);
  }

  await adapter.linkPassword(user, email, newPassword);
  await adapter.reloadUser(user);

  if (user.uid !== originalUid) {
    throw new AccountSecurityError(
      'auth/uid-invariant-violation',
      'Account UID invariant check failed after linking password.'
    );
  }

  return getLinkedProviderStatus(user);
}

/**
 * Section 5: Email/Password Account -> Connect Google (`linkWithPopup`).
 * Preserves the exact Firebase UID and safely halts without merging on `credential-already-in-use`.
 */
export async function linkGoogleToAccount<TUser extends MinimalSecurityUser = User>(
  user: TUser,
  adapter: AuthSecurityAdapter<TUser> = defaultFirebaseSecurityAdapter as unknown as AuthSecurityAdapter<TUser>
): Promise<LinkedProviderStatus> {
  if (!user || !user.uid) {
    throw new AccountSecurityError('auth/no-current-user', 'You must be signed in to connect Google.');
  }

  const originalUid = user.uid;
  const initialStatus = getLinkedProviderStatus(user);

  if (initialStatus.hasGoogle) {
    throw new AccountSecurityError(
      'auth/provider-already-linked',
      'A Google account is already connected to your Heyroq profile.'
    );
  }

  try {
    await adapter.linkGoogle(user);
  } catch (err: any) {
    const code = String(err?.code || '');
    if (
      code === 'auth/credential-already-in-use' ||
      code === 'auth/email-already-in-use' ||
      code === 'auth/account-exists-with-different-credential'
    ) {
      throw new AccountSecurityError(
        code,
        'This Google account is already connected to another Heyroq account. To keep your data safe, Heyroq did not merge or switch accounts. If that other account is yours and unused, you can sign in to it separately to manage or delete it before connecting Google here.',
        { isCollision: true }
      );
    }
    throw err;
  }

  await adapter.reloadUser(user);

  if (user.uid !== originalUid) {
    throw new AccountSecurityError(
      'auth/uid-invariant-violation',
      'Account UID invariant check failed after connecting Google.'
    );
  }

  return getLinkedProviderStatus(user);
}

/**
 * Section 6: Safe Sign-in Method Unlinking with strict Last-Provider Lockout Prevention.
 */
export async function unlinkSignInProvider<TUser extends MinimalSecurityUser = User>(
  user: TUser,
  providerId: SupportedSignInProviderId,
  adapter: AuthSecurityAdapter<TUser> = defaultFirebaseSecurityAdapter as unknown as AuthSecurityAdapter<TUser>
): Promise<LinkedProviderStatus> {
  if (!user || !user.uid) {
    throw new AccountSecurityError('auth/no-current-user', 'You must be signed in to manage sign-in methods.');
  }

  const originalUid = user.uid;
  const status = getLinkedProviderStatus(user);

  if (providerId === GOOGLE_PROVIDER_ID) {
    if (!status.hasGoogle) {
      throw new AccountSecurityError('auth/provider-not-linked', 'Google is not connected to this account.');
    }
    if (!status.canUnlinkGoogle || status.usableProviderCount <= 1) {
      throw new AccountSecurityError(
        'auth/last-provider-protected',
        'You cannot disconnect Google while it is your only sign-in method. Set a password first so you never lose access to your account.'
      );
    }
  } else if (providerId === PASSWORD_PROVIDER_ID) {
    if (!status.hasPassword) {
      throw new AccountSecurityError('auth/provider-not-linked', 'Email & Password sign-in is not enabled on this account.');
    }
    if (!status.canUnlinkPassword || status.usableProviderCount <= 1) {
      throw new AccountSecurityError(
        'auth/last-provider-protected',
        'You cannot remove password sign-in while it is your only sign-in method. Connect Google first so you always keep a way to sign in.'
      );
    }
  }

  await adapter.unlinkProvider(user, providerId);
  await adapter.reloadUser(user);

  if (user.uid !== originalUid) {
    throw new AccountSecurityError(
      'auth/uid-invariant-violation',
      'Account UID invariant check failed after unlinking provider.'
    );
  }

  return getLinkedProviderStatus(user);
}

/**
 * Section 8: Change Password for accounts with Email/Password enabled.
 */
export async function changeCurrentUserPassword<TUser extends MinimalSecurityUser = User>(
  user: TUser,
  newPassword: string,
  confirmPassword: string,
  adapter: AuthSecurityAdapter<TUser> = defaultFirebaseSecurityAdapter as unknown as AuthSecurityAdapter<TUser>
): Promise<void> {
  if (!user || !user.uid) {
    throw new AccountSecurityError('auth/no-current-user', 'You must be signed in to change your password.');
  }

  const status = getLinkedProviderStatus(user);
  if (!status.hasPassword) {
    throw new AccountSecurityError(
      'auth/password-not-enabled',
      'Password sign-in is not enabled yet. Use Set Password to add a password to your account.'
    );
  }

  const validation = await validateHeyroqPassword(newPassword, confirmPassword, adapter);
  if (!validation.isValid) {
    throw new AccountSecurityError('auth/invalid-password-policy', validation.errors[0]);
  }

  await adapter.updateUserPassword(user, newPassword);
  await adapter.reloadUser(user);
}

/**
 * Section 8: Password Reset helper that refuses to act as a substitute for Set Password on Google-only accounts.
 */
export async function sendAccountPasswordReset<TUser extends MinimalSecurityUser = User>(
  user: TUser,
  adapter: AuthSecurityAdapter<TUser> = defaultFirebaseSecurityAdapter as unknown as AuthSecurityAdapter<TUser>
): Promise<void> {
  const status = getLinkedProviderStatus(user);
  if (!status.hasPassword) {
    throw new AccountSecurityError(
      'auth/password-not-enabled',
      'Password reset is only available for accounts with Email & Password enabled. Use Set Password directly above to add a password.'
    );
  }
  const email = user.email || status.passwordEmail;
  if (!email) {
    throw new AccountSecurityError('auth/missing-email', 'No email address is available for password reset.');
  }
  await adapter.sendPasswordReset(email);
}

/**
 * Section 9: Send verification email to current unverified address.
 */
export async function sendVerificationToCurrentUser<TUser extends MinimalSecurityUser = User>(
  user: TUser,
  adapter: AuthSecurityAdapter<TUser> = defaultFirebaseSecurityAdapter as unknown as AuthSecurityAdapter<TUser>
): Promise<void> {
  if (!user || !user.uid) {
    throw new AccountSecurityError('auth/no-current-user', 'You must be signed in to verify your email.');
  }
  if (!user.email) {
    throw new AccountSecurityError('auth/missing-email', 'No email address is associated with your account.');
  }
  if (user.emailVerified) {
    return;
  }
  await adapter.sendVerificationEmail(user);
}

/**
 * Section 9: Verified Change Email workflow via `verifyBeforeUpdateEmail`.
 * Never mutates the displayed primary email prematurely and never writes private email PII to public Firestore docs.
 */
export async function requestVerifiedEmailChange<TUser extends MinimalSecurityUser = User>(
  user: TUser,
  newEmailInput: string,
  adapter: AuthSecurityAdapter<TUser> = defaultFirebaseSecurityAdapter as unknown as AuthSecurityAdapter<TUser>
): Promise<EmailChangeResult> {
  if (!user || !user.uid) {
    throw new AccountSecurityError('auth/no-current-user', 'You must be signed in to change your email.');
  }

  const nextEmail = newEmailInput.trim();
  if (!isValidEmailAddress(nextEmail)) {
    throw new AccountSecurityError('auth/invalid-email', 'Please enter a valid email address.');
  }

  const currentEmail = (user.email || '').trim();
  if (currentEmail && currentEmail.toLowerCase() === nextEmail.toLowerCase()) {
    throw new AccountSecurityError(
      'auth/same-email',
      'Please enter a different email address than your current one.'
    );
  }

  const status = getLinkedProviderStatus(user);
  await adapter.requestVerifyBeforeUpdateEmail(user, nextEmail);

  const googleCaveat = status.hasGoogle
    ? ' Note: Updating your Heyroq primary email does not change your external Google account email, and Google sign-in remains linked to your Google account.'
    : '';

  return {
    status: 'verification_sent',
    currentEmail,
    pendingNewEmail: nextEmail,
    hasGoogleConnected: status.hasGoogle,
    message: `We sent a confirmation link to ${nextEmail}. Your current email (${currentEmail || 'on file'}) stays active until you open that link and complete verification.${googleCaveat}`,
  };
}

/**
 * Section 10: Authorized Self-Service Account Deletion via `deleteUserAccount` callable Cloud Function.
 * Never clears client session prematurely if backend deletion fails or requires recent reauthentication.
 */
export async function executeDeleteUserAccount<TUser extends MinimalSecurityUser = User>(
  user: TUser,
  confirmationText: string,
  adapter: AuthSecurityAdapter<TUser> = defaultFirebaseSecurityAdapter as unknown as AuthSecurityAdapter<TUser>
): Promise<{ success: true; message: string }> {
  if (!user || !user.uid) {
    throw new AccountSecurityError('auth/no-current-user', 'You must be signed in to delete your account.');
  }

  if (confirmationText.trim() !== 'DELETE') {
    throw new AccountSecurityError(
      'auth/confirmation-required',
      'Please type DELETE in uppercase to confirm permanent account deletion.'
    );
  }

  const result = await adapter.callDeleteUserAccount();
  if (!result || result.success !== true) {
    throw new AccountSecurityError(
      'functions/deletion-incomplete',
      'Account deletion did not complete on the server. Your session was preserved so you can safely retry.'
    );
  }

  return {
    success: true,
    message: result.message || 'Your Heyroq account and associated data have been permanently deleted.',
  };
}
