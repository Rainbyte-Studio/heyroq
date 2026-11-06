import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, AlertCircle, Loader2, X } from 'lucide-react';

export interface DeleteConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDeleting?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isDeleting = false,
  error = null,
  onConfirm,
  onClose,
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const openedAtRef = useRef<number>(0);
  const isExecutingRef = useRef<boolean>(false);

  // Focus trap / auto-focus on SAFE CANCEL button when opened (NEVER on destructive button)
  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
      isExecutingRef.current = false;
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      isExecutingRef.current = false;
    }
  }, [isOpen]);

  // Escape key handler - safely cancels and dismisses dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isDeleting, onClose]);

  const handleCancelClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isDeleting) return;
    onClose();
  };

  const handleConfirmClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 1. Re-entrancy guard
    if (isDeleting || isExecutingRef.current) {
      console.warn('[DeleteConfirmationModal] Dropped duplicate confirm click');
      return;
    }

    // 2. Minimum cooldown window (300ms) to prevent ghost clicks or Space keyup leakage
    const elapsed = Date.now() - openedAtRef.current;
    if (elapsed < 300) {
      console.warn('[DeleteConfirmationModal] Blocked confirm click within cooldown window', { elapsed });
      return;
    }

    isExecutingRef.current = true;
    onConfirm();
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const content = (
    <div
      id="delete-confirmation-backdrop"
      onClick={handleCancelClick}
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirmation-title"
      aria-describedby="delete-confirmation-description"
    >
      <div
        id="delete-confirmation-dialog"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#121212] w-full max-w-none md:max-w-md border-t md:border border-white/15 rounded-t-[28px] md:rounded-[28px] shadow-2xl p-5 sm:p-6 text-white animate-in slide-in-from-bottom-6 md:slide-in-from-bottom-2 md:zoom-in-95 duration-200 flex flex-col pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-6"
      >
        {/* Mobile Pull-down pill */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3 md:hidden shrink-0" />

        {/* Dialog Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="delete-confirmation-title"
                className="text-base sm:text-lg font-black uppercase tracking-tight text-white"
              >
                {title}
              </h2>
              <span className="text-[10px] font-bold text-rose-400/80 uppercase tracking-widest block">
                Permanent action
              </span>
            </div>
          </div>

          {/* Desktop close button */}
          <button
            type="button"
            onClick={handleCancelClick}
            disabled={isDeleting}
            className="hidden md:flex p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer disabled:opacity-30 -mr-1"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dialog Body */}
        <p
          id="delete-confirmation-description"
          className="text-xs sm:text-sm text-white/70 leading-relaxed mb-4 pl-0.5"
        >
          {description}
        </p>

        {/* Error message banner */}
        {error && (
          <div className="mb-4 p-3 bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-2xl text-xs flex items-center gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center gap-2.5 sm:gap-3 mt-1">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={handleCancelClick}
            disabled={isDeleting}
            className="w-full sm:flex-1 min-h-[46px] rounded-2xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-white font-black text-xs uppercase tracking-wider transition flex items-center justify-center cursor-pointer touch-manipulation border border-white/10 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmButtonRef}
            type="button"
            onClick={handleConfirmClick}
            disabled={isDeleting}
            className="w-full sm:flex-1 min-h-[46px] rounded-2xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer touch-manipulation disabled:opacity-50 shadow-lg shadow-rose-950/50 focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 text-white" />
                <span>{confirmLabel}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
