import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AccountSecurityError,
  AuthSecurityAdapter,
  GOOGLE_PROVIDER_ID,
  MinimalProviderInfo,
  MinimalSecurityUser,
  PASSWORD_PROVIDER_ID,
  SupportedSignInProviderId,
  changeCurrentUserPassword,
  executeDeleteUserAccount,
  getLinkedProviderStatus,
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
} from '../src/services/accountSecurityService';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');

interface MutableTestUser extends MinimalSecurityUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  providerData: MinimalProviderInfo[];
}

function createMockSecurityEnv(initialUser: {
  uid: string;
  email: string | null;
  emailVerified?: boolean;
  providers: Array<'google.com' | 'password'>;
}) {
  const user: MutableTestUser = {
    uid: initialUser.uid,
    email: initialUser.email,
    emailVerified: initialUser.emailVerified ?? true,
    providerData: initialUser.providers.map((providerId) => ({
      providerId,
      email: initialUser.email,
    })),
  };

  const log: string[] = [];
  let simulateGoogleCollision = false;
  let simulateReauthFailureCode: string | null = null;
  let simulateDeleteRequiresReauth = false;
  let simulateDeleteFailure = false;
  let currentPasswordSecret = 'CurrentPass!123';

  const adapter: AuthSecurityAdapter<MutableTestUser> = {
    async reloadUser() {
      log.push('reloadUser');
    },
    async validatePasswordPolicy(password: string) {
      return {
        isValid: password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password),
        meetsMinPasswordLength: password.length >= 8,
        minPasswordLength: 8,
        containsUppercaseLetter: /[A-Z]/.test(password),
        containsLowercaseLetter: /[a-z]/.test(password),
        containsNumericCharacter: /[0-9]/.test(password),
      };
    },
    async reauthWithPassword(_u, email, pass) {
      if (simulateReauthFailureCode) {
        const err: any = new Error('Reauth error');
        err.code = simulateReauthFailureCode;
        throw err;
      }
      if (pass !== currentPasswordSecret) {
        const err: any = new Error('Wrong password');
        err.code = 'auth/wrong-password';
        throw err;
      }
      log.push(`reauthWithPassword:${email}`);
    },
    async reauthWithGoogle() {
      if (simulateReauthFailureCode) {
        const err: any = new Error('Popup error');
        err.code = simulateReauthFailureCode;
        throw err;
      }
      log.push('reauthWithGoogle');
    },
    async linkPassword(u, email, newPassword) {
      currentPasswordSecret = newPassword;
      u.providerData = [...u.providerData, { providerId: PASSWORD_PROVIDER_ID, email }];
      log.push(`linkPassword:${email}`);
    },
    async linkGoogle(u) {
      if (simulateGoogleCollision) {
        const err: any = new Error('Credential already in use');
        err.code = 'auth/credential-already-in-use';
        throw err;
      }
      u.providerData = [
        ...u.providerData,
        { providerId: GOOGLE_PROVIDER_ID, email: u.email || 'user@gmail.com' },
      ];
      log.push('linkGoogle');
    },
    async unlinkProvider(u, providerId: SupportedSignInProviderId) {
      u.providerData = u.providerData.filter((p) => p.providerId !== providerId);
      log.push(`unlink:${providerId}`);
    },
    async updateUserPassword(_u, newPassword) {
      currentPasswordSecret = newPassword;
      log.push('updatePassword');
    },
    async sendVerificationEmail(u) {
      log.push(`sendEmailVerification:${u.email}`);
    },
    async requestVerifyBeforeUpdateEmail(_u, newEmail) {
      // Note: verifyBeforeUpdateEmail intentionally does NOT mutate user.email until user clicks email link!
      log.push(`verifyBeforeUpdateEmail:${newEmail}`);
    },
    async sendPasswordReset(email) {
      log.push(`sendPasswordReset:${email}`);
    },
    async callDeleteUserAccount() {
      if (simulateDeleteRequiresReauth) {
        const err: any = new Error('RECENT_LOGIN_REQUIRED');
        err.code = 'functions/failed-precondition';
        throw err;
      }
      if (simulateDeleteFailure) {
        const err: any = new Error('Storage cleanup transient timeout');
        err.code = 'functions/internal';
        throw err;
      }
      log.push(`deleteUserAccount:${user.uid}`);
      return { success: true, message: `Deleted ${user.uid}` };
    },
  };

  return {
    user,
    adapter,
    log,
    setGoogleCollision(val: boolean) {
      simulateGoogleCollision = val;
    },
    setReauthFailure(code: string | null) {
      simulateReauthFailureCode = code;
    },
    setDeleteRequiresReauth(val: boolean) {
      simulateDeleteRequiresReauth = val;
    },
    setDeleteFailure(val: boolean) {
      simulateDeleteFailure = val;
    },
  };
}

describe('Account & Security v1.0 — Provider Inspection, Linking, Unlinking, Reauth, Email, Password & Deletion', () => {
  it('1. Google-only account inspection never infers password availability from email presence', () => {
    const { user } = createMockSecurityEnv({
      uid: 'uid_google_only',
      email: 'nikos@gmail.com',
      providers: ['google.com'],
    });

    const status = getLinkedProviderStatus(user);
    assert.equal(status.hasGoogle, true);
    assert.equal(status.hasPassword, false);
    assert.equal(status.usableProviderCount, 1);
    assert.equal(status.canUnlinkGoogle, false);
    assert.equal(status.canUnlinkPassword, false);
  });

  it('2. Email/Password-only account inspection accurately reflects sole password method', () => {
    const { user } = createMockSecurityEnv({
      uid: 'uid_password_only',
      email: 'sofia@heyroq.com',
      emailVerified: false,
      providers: ['password'],
    });

    const status = getLinkedProviderStatus(user);
    assert.equal(status.hasGoogle, false);
    assert.equal(status.hasPassword, true);
    assert.equal(status.emailVerified, false);
    assert.equal(status.usableProviderCount, 1);
    assert.equal(status.canUnlinkGoogle, false);
    assert.equal(status.canUnlinkPassword, false);
  });

  it('3. Account with both providers linked allows unlinking either one safely', () => {
    const { user } = createMockSecurityEnv({
      uid: 'uid_dual_providers',
      email: 'alex@heyroq.com',
      providers: ['google.com', 'password'],
    });

    const status = getLinkedProviderStatus(user);
    assert.equal(status.hasGoogle, true);
    assert.equal(status.hasPassword, true);
    assert.equal(status.usableProviderCount, 2);
    assert.equal(status.canUnlinkGoogle, true);
    assert.equal(status.canUnlinkPassword, true);
  });

  it('4. Google -> Set Password links Email/Password credential while preserving exact Firebase UID', async () => {
    const { user, adapter, log } = createMockSecurityEnv({
      uid: 'uid_google_100',
      email: 'explorer@gmail.com',
      providers: ['google.com'],
    });

    // Rejects mismatched confirmation or weak password
    await assert.rejects(
      () => linkPasswordToAccount(user, 'StrongPass1', 'Mismatch1', adapter),
      (err: any) => err instanceof AccountSecurityError && err.code === 'auth/invalid-password-policy'
    );
    await assert.rejects(
      () => linkPasswordToAccount(user, 'weak', 'weak', adapter),
      (err: any) => err instanceof AccountSecurityError
    );

    const updated = await linkPasswordToAccount(user, 'SolarisPass99', 'SolarisPass99', adapter);
    assert.equal(user.uid, 'uid_google_100', 'UID must never change when setting password');
    assert.equal(updated.hasGoogle, true);
    assert.equal(updated.hasPassword, true);
    assert.equal(updated.usableProviderCount, 2);
    assert.ok(log.includes('linkPassword:explorer@gmail.com'));
    assert.ok(log.includes('reloadUser'));
  });

  it('5. Email/Password -> Connect Google links Google provider while preserving exact Firebase UID', async () => {
    const { user, adapter, log } = createMockSecurityEnv({
      uid: 'uid_email_200',
      email: 'adventurer@heyroq.com',
      providers: ['password'],
    });

    const updated = await linkGoogleToAccount(user, adapter);
    assert.equal(user.uid, 'uid_email_200', 'UID must never change when connecting Google');
    assert.equal(updated.hasGoogle, true);
    assert.equal(updated.hasPassword, true);
    assert.equal(updated.usableProviderCount, 2);
    assert.ok(log.includes('linkGoogle'));
    assert.ok(log.includes('reloadUser'));
  });

  it('6 & 7. Provider unlinking succeeds when 2 methods exist and strictly blocks unlinking the last sign-in method', async () => {
    const { user, adapter } = createMockSecurityEnv({
      uid: 'uid_unlink_test',
      email: 'dual@heyroq.com',
      providers: ['google.com', 'password'],
    });

    // Unlink Google -> succeeds because Password remains
    const afterGoogleUnlink = await unlinkSignInProvider(user, GOOGLE_PROVIDER_ID, adapter);
    assert.equal(afterGoogleUnlink.hasGoogle, false);
    assert.equal(afterGoogleUnlink.hasPassword, true);
    assert.equal(afterGoogleUnlink.canUnlinkPassword, false);

    // Attempt to unlink sole remaining Password provider -> BLOCKED by last-provider protection!
    await assert.rejects(
      () => unlinkSignInProvider(user, PASSWORD_PROVIDER_ID, adapter),
      (err: any) =>
        err instanceof AccountSecurityError && err.code === 'auth/last-provider-protected'
    );
    assert.equal(getLinkedProviderStatus(user).usableProviderCount, 1);

    // Also test sole Google-only lockout prevention directly
    const googleOnlyEnv = createMockSecurityEnv({
      uid: 'uid_sole_google',
      email: 'sole@gmail.com',
      providers: ['google.com'],
    });
    await assert.rejects(
      () => unlinkSignInProvider(googleOnlyEnv.user, GOOGLE_PROVIDER_ID, googleOnlyEnv.adapter),
      (err: any) =>
        err instanceof AccountSecurityError && err.code === 'auth/last-provider-protected'
    );
  });

  it('8. Provider collision (auth/credential-already-in-use) halts safely without merging or switching UID', async () => {
    const env = createMockSecurityEnv({
      uid: 'uid_active_account',
      email: 'owner@heyroq.com',
      providers: ['password'],
    });
    env.setGoogleCollision(true);

    await assert.rejects(
      () => linkGoogleToAccount(env.user, env.adapter),
      (err: any) => {
        assert.ok(err instanceof AccountSecurityError);
        assert.equal(err.isCollision, true);
        assert.equal(err.code, 'auth/credential-already-in-use');
        const mapped = mapAuthSecurityError(err);
        assert.equal(mapped.isCollision, true);
        assert.ok(mapped.message.includes('did not merge or switch accounts'));
        return true;
      }
    );

    // Active user UID and existing provider state remain 100% untouched
    assert.equal(env.user.uid, 'uid_active_account');
    assert.equal(getLinkedProviderStatus(env.user).hasGoogle, false);
    assert.equal(getLinkedProviderStatus(env.user).hasPassword, true);
  });

  it('9. Reauthentication handles Password, Google, wrong credentials, cancelled popup, and expired session', async () => {
    const env = createMockSecurityEnv({
      uid: 'uid_reauth_99',
      email: 'reauth@heyroq.com',
      providers: ['google.com', 'password'],
    });

    // Valid password reauth
    await reauthenticateCurrentUser(env.user, 'password', 'CurrentPass!123', env.adapter);
    assert.ok(env.log.includes('reauthWithPassword:reauth@heyroq.com'));

    // Wrong password rejected cleanly
    await assert.rejects(
      () => reauthenticateCurrentUser(env.user, 'password', 'WrongPass', env.adapter),
      (err: any) => mapAuthSecurityError(err).code === 'auth/wrong-password'
    );

    // Valid Google popup reauth
    await reauthenticateCurrentUser(env.user, 'google', undefined, env.adapter);
    assert.ok(env.log.includes('reauthWithGoogle'));

    // Cancelled Google popup mapped non-destructively
    env.setReauthFailure('auth/popup-closed-by-user');
    await assert.rejects(
      () => reauthenticateCurrentUser(env.user, 'google', undefined, env.adapter),
      (err: any) => {
        const mapped = mapAuthSecurityError(err);
        assert.equal(mapped.isCancelled, true);
        assert.ok(mapped.message.includes('No changes were made'));
        return true;
      }
    );

    // Recent-login detection covers both Firebase Auth and Cloud Functions preconditions
    assert.equal(isRecentLoginRequiredError({ code: 'auth/requires-recent-login' }), true);
    assert.equal(
      isRecentLoginRequiredError({
        code: 'functions/failed-precondition',
        message: 'RECENT_LOGIN_REQUIRED: Please reauthenticate',
      }),
      true
    );
  });

  it('10. Email verification & Change Email use verifyBeforeUpdateEmail and never mutate active email prematurely', async () => {
    const env = createMockSecurityEnv({
      uid: 'uid_email_change',
      email: 'current@heyroq.com',
      emailVerified: false,
      providers: ['google.com', 'password'],
    });

    await sendVerificationToCurrentUser(env.user, env.adapter);
    assert.ok(env.log.includes('sendEmailVerification:current@heyroq.com'));

    // Rejects invalid or identical email
    await assert.rejects(
      () => requestVerifiedEmailChange(env.user, 'not-an-email', env.adapter),
      (err: any) => err instanceof AccountSecurityError && err.code === 'auth/invalid-email'
    );
    await assert.rejects(
      () => requestVerifiedEmailChange(env.user, 'CURRENT@heyroq.com', env.adapter),
      (err: any) => err instanceof AccountSecurityError && err.code === 'auth/same-email'
    );

    const changeRes = await requestVerifiedEmailChange(env.user, 'next@heyroq.com', env.adapter);
    assert.equal(changeRes.status, 'verification_sent');
    assert.equal(changeRes.currentEmail, 'current@heyroq.com');
    assert.equal(changeRes.pendingNewEmail, 'next@heyroq.com');
    assert.equal(changeRes.hasGoogleConnected, true);
    assert.ok(changeRes.message.includes('does not change your external Google account email'));
    // Authoritative user.email is NOT prematurely overwritten before verification link click
    assert.equal(env.user.email, 'current@heyroq.com');
  });

  it('11 & 12. Change Password validates policy & updates password; Password Reset refuses Google-only substitution', async () => {
    const dualEnv = createMockSecurityEnv({
      uid: 'uid_pwd_change',
      email: 'member@heyroq.com',
      providers: ['password'],
    });

    const policyCheck = await validateHeyroqPassword('no_caps_123', 'no_caps_123', dualEnv.adapter);
    assert.equal(policyCheck.isValid, false);
    assert.ok(policyCheck.errors.some((e) => e.includes('uppercase')));

    await changeCurrentUserPassword(dualEnv.user, 'NewSolaris88', 'NewSolaris88', dualEnv.adapter);
    assert.ok(dualEnv.log.includes('updatePassword'));

    // Password reset works when password provider is enabled
    await sendAccountPasswordReset(dualEnv.user, dualEnv.adapter);
    assert.ok(dualEnv.log.includes('sendPasswordReset:member@heyroq.com'));

    // Password reset is strictly refused as a substitute for Set Password on Google-only accounts
    const googleOnlyEnv = createMockSecurityEnv({
      uid: 'uid_google_reset_guard',
      email: 'googleonly@gmail.com',
      providers: ['google.com'],
    });
    await assert.rejects(
      () => sendAccountPasswordReset(googleOnlyEnv.user, googleOnlyEnv.adapter),
      (err: any) => err instanceof AccountSecurityError && err.code === 'auth/password-not-enabled'
    );
  });

  it('13. Account Deletion requires explicit DELETE confirmation, propagates recent-reauth & server errors safely, and verifies Cloud Function hardening', async () => {
    const env = createMockSecurityEnv({
      uid: 'uid_departing_user',
      email: 'departing@heyroq.com',
      providers: ['password'],
    });

    // Blocks deletion without exact uppercase DELETE confirmation
    await assert.rejects(
      () => executeDeleteUserAccount(env.user, 'delete', env.adapter),
      (err: any) => err instanceof AccountSecurityError && err.code === 'auth/confirmation-required'
    );

    // Server recent-login precondition surfaces cleanly for ReauthModal retry
    env.setDeleteRequiresReauth(true);
    await assert.rejects(
      () => executeDeleteUserAccount(env.user, 'DELETE', env.adapter),
      (err: any) => isRecentLoginRequiredError(err) === true
    );
    env.setDeleteRequiresReauth(false);

    // Server transient failure does NOT claim success
    env.setDeleteFailure(true);
    await assert.rejects(() => executeDeleteUserAccount(env.user, 'DELETE', env.adapter));
    env.setDeleteFailure(false);

    // Confirmed deletion succeeds cleanly
    const res = await executeDeleteUserAccount(env.user, 'DELETE', env.adapter);
    assert.equal(res.success, true);
    assert.ok(env.log.includes('deleteUserAccount:uid_departing_user'));

    // Static verification of backend Cloud Function hardening & UI navigation path
    const functionsSrc = readFileSync(path.join(ROOT_DIR, 'functions/src/index.ts'), 'utf8');
    assert.ok(
      functionsSrc.includes('You can only delete your own authenticated account.'),
      'deleteUserAccount must reject mismatched target userId arguments'
    );
    assert.ok(
      functionsSrc.includes('MAX_RECENT_AUTH_AGE_SEC = 300') &&
        functionsSrc.includes('RECENT_LOGIN_REQUIRED'),
      'deleteUserAccount must enforce recent authentication server-side via auth_time'
    );
    assert.ok(
      functionsSrc.includes("status: 'deleted'"),
      'deleteUserAccount must finalize accountDeletionLocks status to deleted'
    );

    const profileSrc = readFileSync(
      path.join(ROOT_DIR, 'src/components/Profile/UserProfileModal.tsx'),
      'utf8'
    );
    assert.ok(profileSrc.includes('id="profile-settings-btn"'));
    assert.ok(profileSrc.includes('id="profile-account-security-btn"'));
    assert.ok(profileSrc.includes('<AccountSecurityModal'));
  });
});
