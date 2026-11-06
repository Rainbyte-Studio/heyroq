import React from 'react';
import { GeographicCluster, MapDisplayCluster } from '../../utils/footprintUtils';

interface GeographicClusterBadgeProps {
  cluster: GeographicCluster | MapDisplayCluster;
  isSelected?: boolean;
  onClick: () => void;
  displayMode?: 'country' | 'city';
}

export const GeographicClusterBadge: React.FC<GeographicClusterBadgeProps> = ({
  cluster,
  isSelected = false,
  onClick,
  displayMode,
}) => {
  const isCountry =
    displayMode === 'country' || ('type' in cluster && cluster.type === 'country');

  const displayName = isCountry
    ? (cluster.countryName || 'COUNTRY').toUpperCase()
    : ((cluster as any).cityName || (cluster as any).displayName || 'SPOT').toUpperCase();

  const flag = 'flag' in cluster ? cluster.flag : undefined;

  return (
    <button
      type="button"
      id={`footprint-cluster-${cluster.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200 select-none ${
        isSelected
          ? 'bg-white text-black scale-110 shadow-[0_0_25px_rgba(255,95,64,0.8)] ring-2 ring-[#FF5F40]'
          : 'bg-[#121212]/95 hover:bg-neutral-900 text-white border border-white/20 hover:border-[#FF5F40]/80 shadow-xl backdrop-blur-md hover:scale-105'
      }`}
      title={isCountry ? `${displayName} (${cluster.count} spots)` : `${displayName} (${cluster.count} spots)`}
    >
      {/* Flag or Coral pulse indicator */}
      {flag ? (
        <span className="text-sm leading-none shrink-0 select-none mr-0.5" role="img" aria-label={displayName}>
          {flag}
        </span>
      ) : (
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isSelected ? 'bg-black' : 'bg-[#FF5F40]'
            }`}
          />
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              isSelected ? 'bg-black' : 'bg-[#FF5F40]'
            }`}
          />
        </span>
      )}

      {/* Cluster name */}
      <span className="text-xs font-black uppercase tracking-tight truncate max-w-[130px]">
        {displayName}
      </span>

      {/* Dot separator */}
      <span className={`text-[10px] select-none font-bold ${isSelected ? 'text-black/40' : 'text-white/40'}`}>
        ·
      </span>

      {/* Spots count badge */}
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold ${
          isSelected
            ? 'bg-[#FF5F40] text-white'
            : 'bg-white/10 text-white/90 group-hover:bg-[#FF5F40] group-hover:text-white transition-colors'
        }`}
      >
        {cluster.count}
      </span>
    </button>
  );
};

