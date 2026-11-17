import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { submitReport } from '../../services/pinService';
import { Flag, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { CloseButton } from '../Common/CloseButton';

interface ReportModalProps {
  pinId?: string;
  targetType: 'pin' | 'comment' | 'user';
  targetId: string;
  onClose: () => void;
}

const REPORT_REASONS = [
  'Inappropriate or offensive photo/content',
  'Misleading, fake, or inaccurate location',
  'Spam, advertising, or promotional abuse',
  'Dangerous or restricted private property',
  'Harassment or community violations',
  'Other',
];

export const ReportModal: React.FC<ReportModalProps> = ({
  pinId,
  targetType,
  targetId,
  onClose,
}) => {
  const { user } = useAuth();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await submitReport(user.uid, targetType, targetId, reason, details, pinId);
      setSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Report submission error:', err);
      setErrorMsg(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard navigation & Escape key dismiss
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="liquid-glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="report-content-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Report Content"
        className="liquid-glass-modal rounded-[28px] sm:rounded-[32px] max-w-md w-full overflow-hidden p-4 sm:p-6 text-slate-900 dark:text-white"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
            <div className="p-2 sm:p-2.5 bg-[var(--brand-primary)]/12 text-[var(--brand-primary)] rounded-2xl border border-[var(--brand-primary)]/25 shrink-0">
              <Flag className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white text-base sm:text-lg tracking-tight truncate">
                Report Content
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-white/50 truncate">
                Help keep the Heyroq community authentic
              </p>
            </div>
          </div>
          <CloseButton
            onClick={onClose}
            ariaLabel="Close Report Content"
          />
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-11 h-11 text-emerald-600 dark:text-emerald-400 mx-auto" />
            <p className="font-heading font-bold text-slate-900 dark:text-white text-base tracking-tight">
              Thank you for reporting
            </p>
            <p className="text-xs text-slate-500 dark:text-white/55">
              Our moderation team has received your report for review.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-500/10 dark:bg-red-950/75 border border-red-500/30 dark:border-red-500/40 text-red-800 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-white/75 mb-1.5">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="liquid-glass-input w-full text-base sm:text-xs rounded-xl px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[var(--brand-primary)] min-h-[44px]"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r} className="bg-white dark:bg-[#14161C] text-slate-900 dark:text-white">
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-white/75 mb-1.5">
                Additional Details
              </label>
              <textarea
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Please describe why this pin or comment violates guidelines..."
                className="liquid-glass-input w-full text-base sm:text-xs rounded-xl px-3 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-[var(--brand-primary)] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-900/8 dark:border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-white/65 hover:text-slate-950 dark:hover:text-white cursor-pointer min-h-[42px] rounded-full heyroq-focus-ring"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="heyroq-btn-primary px-5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer min-h-[42px] whitespace-nowrap heyroq-focus-ring"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Submit Report</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
