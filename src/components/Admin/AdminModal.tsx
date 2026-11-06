import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Report, Pin } from '../../types';
import {
  fetchAllReports,
  updateReportStatus,
  deletePin,
  fetchPinById,
} from '../../services/pinService';
import {
  ShieldAlert,
  X,
  CheckCircle,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertTriangle,
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
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleResolve = async (reportId: string) => {
    setActionInProgress(reportId);
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
    if (!window.confirm('Delete this reported content permanently?')) return;

    setActionInProgress(report.id);
    try {
      if (report.targetType === 'pin' && report.targetId) {
        await deletePin(report.targetId, 'admin');
      }
      await updateReportStatus(report.id, 'resolved');
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status: 'resolved' } : r))
      );
    } catch (err) {
      console.error('Error deleting reported content:', err);
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
        alert('Pin has already been deleted or removed.');
      }
    } catch (err) {
      console.error('Error inspecting pin:', err);
    }
  };

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl">
        <div className="bg-[#0E0E0E] rounded-[32px] p-8 text-center max-w-sm border border-white/20 text-white">
          <AlertTriangle className="w-12 h-12 text-[#FF5F40] mx-auto mb-3" />
          <h3 className="font-black text-xl uppercase tracking-tight text-white">Access Restricted</h3>
          <p className="text-xs text-white/50 mt-1">
            Administrator credentials required to review moderation reports.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 px-6 py-2.5 bg-[#FF5F40] text-white text-xs font-black uppercase tracking-wider rounded-full shadow-lg cursor-pointer"
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-2xl animate-in fade-in"
    >
      <div
        id="admin-moderation-modal"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0E0E0E] rounded-[28px] sm:rounded-[32px] max-w-3xl lg:max-w-4xl w-full max-h-[92dvh] sm:max-h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-white/20 text-white"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
            <div className="p-2 sm:p-2.5 bg-white/10 text-[#FF5F40] rounded-2xl border border-white/10 shrink-0">
              <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white truncate">Moderation Dashboard</h2>
              <p className="text-[11px] sm:text-xs text-white/50 truncate">
                Review flagged pins, reports, and user safety
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={loadReports}
              disabled={loading}
              className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-white/50 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-white/40 hover:text-white rounded-full transition cursor-pointer"
              aria-label="Close admin modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-black/40 no-scrollbar pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
          {loading ? (
            <div className="py-16 text-center text-white/40 text-xs flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#FF5F40]" />
              <span>Loading reports...</span>
            </div>
          ) : reports.length === 0 ? (
            <div className="py-16 text-center text-white/40 text-xs">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
              <p className="font-black text-white text-base uppercase tracking-tight">All clear!</p>
              <p className="mt-1">No active reports or pending flags at this time.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const isPending = report.status === 'pending';
                const isBusy = actionInProgress === report.id;

                return (
                  <div
                    key={report.id}
                    className={`bg-[#141414] rounded-2xl p-3.5 sm:p-4 border transition ${
                      isPending
                        ? 'border-[#FF5F40]/40 shadow-lg'
                        : 'border-white/10 opacity-70'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                              isPending
                                ? 'bg-[#FF5F40]/20 text-[#FF5F40] border border-[#FF5F40]/30'
                                : report.status === 'resolved'
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                                : 'bg-white/10 text-white/60 border border-white/15'
                            }`}
                          >
                            {report.status}
                          </span>
                          <span className="text-xs font-bold text-white/60 uppercase">
                            Type: {report.targetType}
                          </span>
                          <span className="text-[11px] text-white/40 font-mono">
                            {new Date(report.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="font-black text-sm text-white uppercase tracking-tight break-words">{report.reason}</h4>
                        {report.details && (
                          <p className="text-xs text-white/70 mt-1.5 bg-black/40 p-2.5 rounded-xl border border-white/10 break-words">
                            "{report.details}"
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center flex-wrap gap-1.5 shrink-0 mt-2 sm:mt-0">
                        {report.targetType === 'pin' && report.targetId && (
                          <button
                            type="button"
                            onClick={() => handleInspectPin(report.targetId)}
                            className="p-2 min-h-[36px] text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition text-xs flex items-center gap-1 cursor-pointer"
                            title="Inspect Pin"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}

                        {isPending && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDeleteContent(report)}
                              className="px-3 py-1.5 min-h-[36px] bg-red-950/80 text-red-400 border border-red-500/30 hover:bg-red-900/80 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleResolve(report.id)}
                              className="px-3 py-1.5 min-h-[36px] bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-900/80 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 transition cursor-pointer"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Resolve</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDismiss(report.id)}
                              className="px-2.5 py-1.5 min-h-[36px] bg-white/10 text-white/70 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
                            >
                              Dismiss
                            </button>
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
