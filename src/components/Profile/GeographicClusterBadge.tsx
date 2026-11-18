import React from 'react';
import { GeographicCluster, MapDisplayCluster } from '../../utils/footprintUtils';
import { useTheme } from '../../context/ThemeContext';

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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const isCountry =
    displayMode === 'country' || ('type' in cluster && cluster.type === 'country');

  const displayName = isCountry
    ? cluster.countryName || 'Country'
    : (cluster as any).cityName || (cluster as any).displayName || 'Spot';

  const flag = 'flag' in cluster ? cluster.flag : undefined;

  const containerClass = isSelected
    ? isDark
      ? 'bg-[#F5F4F1] text-[#17181B] scale-105 shadow-lg ring-2 ring-[var(--brand-primary)]'
      : 'bg-[#202124] text-[#FAF9F6] scale-105 shadow-lg ring-2 ring-[var(--brand-primary)]'
    : isDark
      ? 'bg-[#222327]/95 hover:bg-[#2B2C31] text-[#F5F4F1] border border-[#38393E] hover:border-[var(--brand-primary)]/75 shadow-md backdrop-blur-md hover:scale-[1.03]'
      : 'bg-[#FFFFFF]/95 hover:bg-[#FFFFFF] text-[#202124] border border-[#E6E3DE] hover:border-[var(--brand-primary)]/75 shadow-md backdrop-blur-md hover:scale-[1.03]';

  return (
    <button
      type="button"
      id={`footprint-cluster-${cluster.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer transition-all duration-150 select-none heyroq-focus-ring ${containerClass}`}
      title={`${displayName} (${cluster.count} spots)`}
    >
      {flag ? (
        <span
          className="text-sm leading-none shrink-0 select-none mr-0.5"
          role="img"
          aria-label={displayName}
        >
          {flag}
        </span>
      ) : (
        <span
          className="inline-flex rounded-full h-2 w-2 shrink-0 bg-[var(--brand-primary)]"
        />
      )}

      {/* Cluster name */}
      <span className="text-xs font-bold tracking-tight truncate max-w-[130px]">
        {displayName}
      </span>

      {/* Dot separator */}
      <span
        className={`text-[10px] select-none font-bold ${
          isSelected
            ? isDark
              ? 'text-slate-900/40'
              : 'text-white/45'
            : isDark
              ? 'text-white/40'
              : 'text-slate-400'
        }`}
        aria-hidden="true"
      >
        ·
      </span>

      {/* Spots count */}
      <span
        className={`text-[11px] tabular-nums font-bold ${
          isSelected
            ? isDark
              ? 'text-[var(--brand-deep)]'
              : 'text-[var(--brand-highlight)]'
            : 'text-[var(--heyroq-accent-text)]'
        }`}
      >
        {cluster.count}
      </span>
    </button>
  );
};
