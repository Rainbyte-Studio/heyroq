import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Report, Pin } from '../../types';
import {
  fetchAllReports,
  updateReportStatus,
  deletePin,
  fetchPinById,
} from '../../services/pinService';
import { CloseButton } from '../Common/CloseButton';
import {
  ShieldAlert,
  X,
  CheckCircle,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface AdminModalProps {
  onClose: () => void;
  onSelectPin: (pin: Pin) => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ onClose, onSelectPin }) => {
  const { isAdmin } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [confirmDeleteReportId, setConfirmDeleteReportId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const loadReports = async () => {
    setLoading(true);
    try {
      const data = await fetchAllReports();
      setReports(data);
    } catch (err) {
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  // Keyboard navigation & Escape key dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDeleteReportId) {
          setConfirmDeleteReportId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDeleteReportId, onClose]);

  const handleResolve = async (reportId: string) => {
    setActionInProgress(reportId);
    setConfirmDeleteReportId(null);
    try {
      await updateReportStatus(reportId, 'resolved');
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: 'resolved' } : r))
      );
    } catch (err) {
      console.error('Failed to resolve report:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDismiss = async (reportId: string) => {
    setActionInProgress(reportId);
    setConfirmDeleteReportId(null);
    try {
      await updateReportStatus(reportId, 'dismissed');
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: 'dismissed' } : r))
      );
    } catch (err) {
      console.error('Failed to dismiss report:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteContent = async (report: Report) => {
    setActionInProgress(report.id);
    setConfirmDeleteReportId(null);
    try {
      if (report.targetType === 'pin' && report.targetId) {
        await deletePin(report.targetId, 'admin');
      }
      await updateReportStatus(report.id, 'resolved');
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status: 'resolved' } : r))
      );
      setStatusNotice('Reported content deleted and report marked resolved.');
    } catch (err) {
      console.error('Error deleting reported content:', err);
      setStatusNotice('Could not delete reported content. Please try again.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleInspectPin = async (pinId: string) => {
    try {
      const pin = await fetchPinById(pinId);
      if (pin) {
        onSelectPin(pin);
        onClose();
      } else {
        setStatusNotice('Pin has already been deleted or removed.');
      }
    } catch (err) {
      console.error('Error inspecting pin:', err);
      setStatusNotice('Unable to load reported pin details.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="liquid-glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="liquid-glass-modal rounded-[28px] p-8 text-center max-w-sm text-slate-900 dark:text-white">
          <AlertTriangle className="w-11 h-11 text-[var(--brand-primary)] mx-auto mb-3" />
          <h3 className="font-heading font-bold text-xl tracking-tight text-slate-900 dark:text-white">
            Access Restricted
          </h3>
          <p className="text-xs text-slate-500 dark:text-white/55 mt-1.5 leading-relaxed">
            Administrator credentials required to review moderation reports.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="heyroq-btn-primary mt-5 px-6 py-2.5 min-h-[42px] text-xs font-semibold rounded-full cursor-pointer heyroq-focus-ring"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClose}
      className="liquid-glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id="admin-moderation-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Moderation Dashboard"
        className="liquid-glass-modal rounded-[28px] sm:rounded-[32px] max-w-3xl lg:max-w-4xl w-full max-h-[92dvh] sm:max-h-[85vh] overflow-hidden flex flex-col text-slate-900 dark:text-white"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-900/8 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
            <div className="p-2 sm:p-2.5 bg-[var(--brand-primary)]/12 text-[var(--brand-primary)] rounded-2xl border border-[var(--brand-primary)]/25 shrink-0">
              <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                Moderation Dashboard
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-white/50 truncate">
                Review flagged pins, reports, and user safety
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={loadReports}
              disabled={loading}
              className="liquid-glass-pill p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-600 dark:text-white/65 hover:text-slate-950 dark:hover:text-white rounded-full transition-colors cursor-pointer heyroq-focus-ring"
              title="Refresh"
              aria-label="Refresh reports"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <CloseButton
              onClick={onClose}
              ariaLabel="Close Moderation Dashboard"
            />
          </div>
        </div>

        {/* Inline Status Notice (replaces window.alert for iframe safety) */}
        {statusNotice && (
          <div className="mx-4 sm:mx-6 mt-3 px-3.5 py-2.5 rounded-xl bg-slate-900/6 dark:bg-white/10 border border-slate-900/10 dark:border-white/15 flex items-center justify-between gap-3 text-xs text-slate-800 dark:text-white/90">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[var(--brand-primary)] shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              aria-label="Dismiss notice"
              className="p-1 rounded-lg hover:bg-slate-900/10 dark:hover:bg-white/15 text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 subtle-glass-scrollbar pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
          {loading ? (
            <div className="py-16 text-center text-slate-500 dark:text-white/45 text-xs flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-primary)]" />
              <span>Loading reports...</span>
            </div>
          ) : reports.length === 0 ? (
            <div className="py-16 text-center text-slate-500 dark:text-white/45 text-xs">
              <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <p className="font-heading font-bold text-slate-900 dark:text-white text-base tracking-tight">
                All clear
              </p>
              <p className="mt-1">No active reports or pending flags at this time.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const isPending = report.status === 'pending';
                const isBusy = actionInProgress === report.id;
                const isConfirmingDelete = confirmDeleteReportId === report.id;

                return (
                  <div
                    key={report.id}
                    className={`liquid-glass-card rounded-2xl p-3.5 sm:p-4 transition-colors ${
                      isPending
                        ? 'border-[var(--brand-primary)]/40'
                        : 'opacity-75'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap text-xs">
                          <span
                            className={`font-semibold capitalize ${
                              isPending
                                ? 'text-[var(--heyroq-accent-text)]'
                                : report.status === 'resolved'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-white/55'
                            }`}
                          >
                            {report.status}
                          </span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-white/25">
                            ·
                          </span>
                          <span className="font-medium text-slate-600 dark:text-white/65 capitalize">
                            Type: {report.targetType}
                          </span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-white/25">
                            ·
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-white/45 tabular-nums">
                            {new Date(report.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="font-heading font-bold text-sm text-slate-900 dark:text-white tracking-tight break-words">
                          {report.reason}
                        </h4>
                        {report.details && (
                          <p className="text-xs text-slate-600 dark:text-white/75 mt-1.5 bg-slate-900/[0.03] dark:bg-black/30 p-2.5 rounded-xl border border-slate-900/8 dark:border-white/10 break-words">
                            &ldquo;{report.details}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center flex-wrap gap-1.5 shrink-0 mt-2 sm:mt-0">
                        {report.targetType === 'pin' && report.targetId && (
                          <button
                            type="button"
                            onClick={() => handleInspectPin(report.targetId)}
                            className="p-2 min-w-[38px] min-h-[38px] text-slate-600 dark:text-white/65 hover:text-slate-950 dark:hover:text-white hover:bg-slate-900/6 dark:hover:bg-white/10 rounded-xl transition-colors text-xs flex items-center justify-center cursor-pointer heyroq-focus-ring"
                            title="Inspect Pin"
                            aria-label="Inspect Pin"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}

                        {isPending && (
                          <>
                            {isConfirmingDelete ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleDeleteContent(report)}
                                  className="px-3 py-1.5 min-h-[38px] bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap heyroq-focus-ring"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Confirm Delete</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => setConfirmDeleteReportId(null)}
                                  className="px-2.5 py-1.5 min-h-[38px] bg-slate-900/6 dark:bg-white/10 text-slate-700 dark:text-white/75 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap heyroq-focus-ring"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => setConfirmDeleteReportId(report.id)}
                                  className="px-3 py-1.5 min-h-[38px] bg-red-500/10 dark:bg-red-950/75 text-red-700 dark:text-red-400 border border-red-500/25 dark:border-red-500/35 hover:bg-red-500/20 dark:hover:bg-red-900/80 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap heyroq-focus-ring"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Remove</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleResolve(report.id)}
                                  className="px-3 py-1.5 min-h-[38px] bg-emerald-500/10 dark:bg-emerald-950/75 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 dark:border-emerald-500/35 hover:bg-emerald-500/20 dark:hover:bg-emerald-900/80 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap heyroq-focus-ring"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span>Resolve</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleDismiss(report.id)}
                                  className="liquid-glass-pill px-3 py-1.5 min-h-[38px] text-slate-700 dark:text-white/75 hover:text-slate-950 dark:hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap heyroq-focus-ring"
                                >
                                  Dismiss
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
