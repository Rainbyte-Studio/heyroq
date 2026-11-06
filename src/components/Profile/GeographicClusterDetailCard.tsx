import React from 'react';
import { GeographicCluster } from '../../utils/footprintUtils';
import { X, MapPin, ChevronRight } from 'lucide-react';
import { CategoryBadge } from '../Map/CategoryBadge';
import { LikeIndicator } from '../Pin/LikeButton';

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
      className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-80 z-30 bg-[#121212]/95 backdrop-blur-2xl border border-white/20 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-2 duration-200 text-white"
    >
      <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5 mb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h5 className="text-sm font-black uppercase tracking-tight text-white">
              {cluster.cityName}
            </h5>
            <span className="px-2 py-0.5 rounded-full bg-[#FF5F40]/20 border border-[#FF5F40]/40 text-[#FF5F40] text-[10px] font-black uppercase tracking-wider">
              {cluster.count} {cluster.count === 1 ? 'spot' : 'spots'}
            </span>
          </div>
          <p className="text-[11px] text-white/50 font-mono mt-0.5 truncate max-w-[200px]">
            {cluster.displayName}
          </p>
        </div>
        <button
          id="cluster-detail-close-btn"
          type="button"
          onClick={onClose}
          className="p-1 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
          aria-label="Close details"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category Breakdown pills */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {Object.entries(cluster.categoryBreakdown).map(([cat, count]) => (
          <div key={cat} className="flex items-center gap-1 shrink-0">
            <CategoryBadge category={cat} size="xs" />
            <span className="text-[9px] font-mono text-white/50">×{count}</span>
          </div>
        ))}
      </div>

      {/* Spots List */}
      <div className="space-y-1.5 max-h-36 overflow-y-auto no-scrollbar pr-0.5">
        {cluster.pins.map((pinSummary) => (
          <div
            key={pinSummary.id}
            id={`cluster-pin-item-${pinSummary.id}`}
            onClick={() => onSelectPin && onSelectPin(pinSummary.id)}
            className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#FF5F40]/50 transition cursor-pointer group"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {pinSummary.imageUrl ? (
                <img
                  src={pinSummary.imageUrl}
                  alt={pinSummary.title}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-cover shrink-0 bg-black"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-[#FF5F40]" />
                </div>
              )}
              <div className="truncate">
                <p className="text-xs font-bold text-white group-hover:text-[#FF5F40] truncate transition-colors">
                  {pinSummary.title}
                </p>
                <div className="mt-0.5">
                  <CategoryBadge category={pinSummary.category} size="xs" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              <LikeIndicator count={pinSummary.likeCount} variant="badge" />
              <ChevronRight className="w-3.5 h-3.5 text-white/40 group-hover:text-white transition-colors" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
