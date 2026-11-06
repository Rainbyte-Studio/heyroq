import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Mail,
  Lock,
  User,
  AtSign,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
}) => {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleModalClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur?.();
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.dispatchEvent(new Event('resize'));
    }
    onClose();
  }, [onClose]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorCode(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!displayName.trim() || !username.trim()) {
          throw new Error('Please enter a display name and username.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        await signUp(email, password, displayName, username);
        handleModalClose();
      } else if (mode === 'signin') {
        await signIn(email, password);
        handleModalClose();
      } else if (mode === 'forgot') {
        await resetPassword(email);
        setSuccessMsg('Password reset instructions sent to your email.');
      }
    } catch (err: any) {
      console.warn('Auth notification:', err?.code || err?.message);
      const code = err?.code || '';
      setErrorCode(code);
      let message = err.message || 'Authentication failed.';

      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        message = mode === 'signin'
          ? 'Invalid email or password. If you are new to Heyroq, you can create an account below.'
          : 'Invalid credentials provided. Please double check your details.';
      } else if (code === 'auth/email-already-in-use') {
        message = 'An account with this email already exists. Try signing in instead.';
      } else if (code === 'auth/weak-password') {
        message = 'Password is too weak (minimum 6 characters).';
      } else if (code === 'auth/operation-not-allowed') {
        message = 'Email/Password sign-in is currently unavailable. Please try again later or Continue with Google.';
      } else if (code === 'auth/too-many-requests') {
        message = 'Access temporarily disabled due to many failed login attempts. Please reset your password or try again later.';
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorCode(null);
    setErrorMsg(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      handleModalClose();
    } catch (err: any) {
      console.warn('Google sign in notice:', err?.code || err?.message);
      const code = err?.code || '';
      setErrorCode(code);
      let msg = 'Google sign in failed.';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        msg = 'Google sign-in popup was closed.';
      } else if (code === 'auth/popup-blocked') {
        msg = 'Sign-in popup was blocked by your browser. Please allow popups or use Email sign in.';
      } else if (code === 'auth/unauthorized-domain') {
        msg = 'This domain is not authorized in Firebase Auth settings. Please use Email sign in or try again later.';
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // Sync initial mode when modal opens or initialMode changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorCode(null);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialMode]);

  // Ensure scroll position is completely restored when modal closes or unmounts (prevents iOS Safari post-login viewport shift)
  useEffect(() => {
    if (!isOpen && typeof window !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur?.();
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.dispatchEvent(new Event('resize'));
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        (document.activeElement as HTMLElement)?.blur?.();
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.dispatchEvent(new Event('resize'));
      }
    };
  }, []);

  // Keyboard navigation & Escape key dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleModalClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleModalClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      id="auth-modal-overlay"
      onClick={handleModalClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 md:backdrop-blur-2xl animate-in fade-in"
    >
      <div
        id="auth-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0E0E0E] rounded-[32px] max-w-md w-full max-h-[92dvh] sm:max-h-[88vh] overflow-y-auto subtle-dark-scrollbar shadow-2xl border border-white/20 p-5 sm:p-7 relative text-white"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleModalClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer z-10"
          aria-label="Close authentication modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand Wordmark & Heading */}
        <div className="text-center mb-5 sm:mb-6 pr-6 pl-6 sm:px-0">
          <div className="flex justify-center mb-2.5">
            <span
              id="auth-brand-wordmark"
              className="text-3xl sm:text-4xl font-black tracking-tighter italic text-[#FF5F40] leading-none select-none"
            >
              heyroq.
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
            {mode === 'signup'
              ? 'Join Heyroq'
              : mode === 'signin'
              ? 'Welcome Back'
              : 'Reset Password'}
          </h2>
          <p className="text-xs text-white/50 mt-1 max-w-xs mx-auto">
            {mode === 'signup'
              ? 'Discover and pin secret places, food hubs & events'
              : mode === 'signin'
              ? 'Sign in to like, comment, and save your map discoveries'
              : 'Enter your email to receive recovery instructions'}
          </p>
        </div>

        {/* Feedback messages */}
        {errorMsg && (
          <div className="mb-4 p-3.5 bg-red-950/80 border border-red-500/40 text-red-200 rounded-2xl text-xs flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span className="leading-snug">{errorMsg}</span>
            </div>

            {/* Smart Recovery Action: Switch to Sign Up if credential invalid on Sign In */}
            {(errorCode === 'auth/invalid-credential' || errorCode === 'auth/user-not-found') && mode === 'signin' && (
              <div className="pt-2 border-t border-red-500/25 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setErrorMsg(null);
                    setErrorCode(null);
                    if (!displayName && email) {
                      const namePart = email.split('@')[0] || '';
                      setDisplayName(namePart.charAt(0).toUpperCase() + namePart.slice(1));
                    }
                    if (!username && email) {
                      setUsername(email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') || '');
                    }
                  }}
                  className="px-3 py-2 bg-[#FF5F40] hover:bg-[#ff7256] text-white rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-md min-h-[36px]"
                >
                  Create Account with this Email →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setErrorMsg(null);
                    setErrorCode(null);
                  }}
                  className="px-2.5 py-1.5 text-white/70 hover:text-white text-xs font-bold underline transition cursor-pointer min-h-[36px] flex items-center"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {/* Smart Recovery Action: Switch to Sign In if email already exists on Sign Up */}
            {errorCode === 'auth/email-already-in-use' && mode === 'signup' && (
              <div className="pt-2 border-t border-red-500/25 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setErrorMsg(null);
                    setErrorCode(null);
                  }}
                  className="px-3 py-2 bg-white text-black hover:bg-neutral-200 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-md min-h-[36px]"
                >
                  Sign In to Existing Account →
                </button>
              </div>
            )}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-2xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAuthSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">
                  Display Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-white/40 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Alex Rivera"
                    className="w-full text-base sm:text-xs pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF5F40] focus:ring-1 focus:ring-[#FF5F40]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">
                  Username
                </label>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-white/40 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. alex_rivera"
                    className="w-full text-base sm:text-xs pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF5F40] focus:ring-1 focus:ring-[#FF5F40]"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-white/40 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full text-base sm:text-xs pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF5F40] focus:ring-1 focus:ring-[#FF5F40]"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-[10px] font-black uppercase text-[#FF5F40] hover:underline tracking-wider p-1"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-base sm:text-xs pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF5F40] focus:ring-1 focus:ring-[#FF5F40]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] py-3 bg-[#FF5F40] hover:bg-[#ff7256] text-white rounded-full text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(255,95,64,0.4)] flex items-center justify-center gap-2 transition disabled:opacity-50 mt-2 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'signup' ? (
              'Create Free Account'
            ) : mode === 'signin' ? (
              'Sign In'
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>

        {/* Google sign in */}
        {mode !== 'forgot' && (
          <div className="mt-4">
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink mx-3 text-[10px] text-white/40 uppercase font-black tracking-widest">
                Or
              </span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full min-h-[44px] py-2.5 px-4 border border-white/20 bg-white/10 hover:bg-white/20 rounded-full text-xs font-black uppercase tracking-wider text-white flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.2-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        )}

        {/* Mode Switchers */}
        <div className="mt-5 text-center text-xs text-white/50">
          {mode === 'signin' ? (
            <p>
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="font-black text-white hover:text-[#FF5F40] uppercase tracking-wider ml-1 underline cursor-pointer p-1"
              >
                Sign up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="font-black text-white hover:text-[#FF5F40] uppercase tracking-wider ml-1 underline cursor-pointer p-1"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
