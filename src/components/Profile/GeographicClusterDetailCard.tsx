import React from 'react';
import { GeographicCluster } from '../../utils/footprintUtils';
import { MapPin, ChevronRight } from 'lucide-react';
import { CategoryBadge } from '../Map/CategoryBadge';
import { LikeIndicator } from '../Pin/LikeButton';
import { CloseButton } from '../Common/CloseButton';

interface GeographicClusterDetailCardProps {
  cluster: GeographicCluster;
  onClose: () => void;
  onSelectPin?: (pinId: string) => void;
}

export const GeographicClusterDetailCard: React.FC<GeographicClusterDetailCardProps> = ({
  cluster,
  onClose,
  onSelectPin,
}) => {
  return (
    <div
      id={`footprint-cluster-detail-${cluster.id}`}
      className="liquid-glass-floating absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-80 z-30 rounded-2xl p-4 animate-in slide-in-from-bottom-2 duration-150 text-slate-900 dark:text-white"
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-900/8 dark:border-white/10 pb-2.5 mb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h5 className="font-heading text-sm font-bold tracking-tight text-slate-900 dark:text-white truncate">
              {cluster.cityName}
            </h5>
            <span className="text-slate-400 dark:text-white/30" aria-hidden="true">
              ·
            </span>
            <span className="text-xs tabular-nums font-semibold text-[var(--heyroq-accent-text)]">
              {cluster.count} {cluster.count === 1 ? 'spot' : 'spots'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-white/50 mt-0.5 truncate max-w-[220px]">
            {cluster.displayName}
          </p>
        </div>
        <CloseButton
          id="cluster-detail-close-btn"
          size="sm"
          onClick={onClose}
          ariaLabel="Close Cluster Details"
        />
      </div>

      {/* Category Breakdown */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {Object.entries(cluster.categoryBreakdown).map(([cat, count]) => (
          <div key={cat} className="flex items-center gap-1 shrink-0">
            <CategoryBadge category={cat} size="xs" />
            <span className="text-[10px] font-medium tabular-nums text-slate-500 dark:text-white/50">
              ×{count}
            </span>
          </div>
        ))}
      </div>

      {/* Spots List */}
      <div className="space-y-1.5 max-h-36 overflow-y-auto subtle-glass-scrollbar pr-0.5">
        {cluster.pins.map((pinSummary) => (
          <div
            key={pinSummary.id}
            id={`cluster-pin-item-${pinSummary.id}`}
            onClick={() => onSelectPin && onSelectPin(pinSummary.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectPin?.(pinSummary.id);
              }
            }}
            className="liquid-glass-card flex items-center justify-between p-2 rounded-xl hover:border-[var(--brand-primary)]/50 transition-colors cursor-pointer group heyroq-focus-ring"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {pinSummary.imageUrl ? (
                <img
                  src={pinSummary.imageUrl}
                  alt={pinSummary.title}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-cover shrink-0 bg-slate-200 dark:bg-black"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-slate-900/6 dark:bg-white/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-[var(--brand-primary)]" />
                </div>
              )}
              <div className="truncate">
                <p className="font-heading text-xs font-semibold text-slate-900 dark:text-white group-hover:text-[var(--heyroq-accent-text)] truncate transition-colors">
                  {pinSummary.title}
                </p>
                <div className="mt-0.5">
                  <CategoryBadge category={pinSummary.category} size="xs" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              <LikeIndicator count={pinSummary.likeCount} variant="badge" />
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-white/40 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
