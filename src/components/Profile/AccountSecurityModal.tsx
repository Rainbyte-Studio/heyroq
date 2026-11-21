import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CloseButton } from '../Common/CloseButton';
import { AccountSecuritySection } from '../Settings/AccountSecuritySection';

export interface AccountSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountDeleted?: () => void;
}

export const AccountSecurityModal: React.FC<AccountSecurityModalProps> = ({
  isOpen,
  onClose,
  onAccountDeleted,
}) => {
  const { firebaseUser } = useAuth();
  const [busyState, setBusyState] = useState({ isDeleting: false, isReauthing: false });

  const handleBusyChange = useCallback(
    (next: { isDeleting: boolean; isReauthing: boolean }) => setBusyState(next),
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyState.isDeleting && !busyState.isReauthing) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, busyState.isDeleting, busyState.isReauthing, onClose]);

  if (!isOpen || !firebaseUser) return null;

  const content = (
    <div
      onClick={() => {
        if (!busyState.isDeleting) onClose();
      }}
      className="liquid-glass-backdrop fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="heyroq-account-security-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-security-title"
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-modal rounded-[28px] sm:rounded-[32px] w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col text-[var(--heyroq-text-primary)] relative"
      >
        <div className="flex-1 min-h-0 overflow-y-auto subtle-glass-scrollbar">
          <header className="heyroq-window-header sticky top-0 z-20 px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[var(--brand-primary)]/12 border border-[var(--brand-primary)]/25 flex items-center justify-center text-[var(--brand-primary)] shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-[var(--heyroq-text-muted)] truncate">
                  Settings
                </div>
                <h2
                  id="account-security-title"
                  className="font-heading text-lg sm:text-xl font-bold tracking-tight text-[var(--heyroq-text-primary)] truncate"
                >
                  Account &amp; Security
                </h2>
              </div>
            </div>

            <CloseButton
              onClick={onClose}
              disabled={busyState.isDeleting}
              ariaLabel="Close Account & Security"
            />
          </header>

          <div className="px-5 sm:px-6 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <AccountSecuritySection
              resetSignal={isOpen}
              onBusyStateChange={handleBusyChange}
              onAccountDeleted={() => {
                onClose();
                onAccountDeleted?.();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};
