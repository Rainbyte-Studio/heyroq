import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { submitReport } from '../../services/pinService';
import { X, Flag, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-2xl animate-in fade-in"
    >
      <div
        id="report-content-modal"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0E0E0E] rounded-[28px] sm:rounded-[32px] max-w-md w-full overflow-hidden shadow-2xl border border-white/20 p-4 sm:p-6 text-white"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
            <div className="p-2 sm:p-2.5 bg-white/10 text-[#FF5F40] rounded-2xl border border-white/10 shrink-0">
              <Flag className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-white text-base sm:text-lg uppercase tracking-tight truncate">Report Content</h3>
              <p className="text-[11px] sm:text-xs text-white/50 truncate">Help keep the Heyroq community authentic</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer shrink-0"
            aria-label="Close report modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <p className="font-black text-white text-base uppercase tracking-tight">Thank you for reporting</p>
            <p className="text-xs text-white/50">
              Our moderation team has received your report for review.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-950/80 border border-red-500/40 text-red-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-base sm:text-xs bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-[#FF5F40] min-h-[42px]"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r} className="bg-[#141414] text-white">
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">
                Additional Details
              </label>
              <textarea
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Please describe why this pin or comment violates guidelines..."
                className="w-full text-base sm:text-xs bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF5F40] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider text-white/60 hover:text-white cursor-pointer min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-[#FF5F40] hover:bg-[#ff7256] text-white rounded-full text-xs font-black uppercase tracking-wider shadow-[0_0_15px_rgba(255,95,64,0.4)] flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer min-h-[40px]"
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
