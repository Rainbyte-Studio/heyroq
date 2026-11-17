import React from 'react';
import { FootprintStatsData } from '../../utils/footprintUtils';
import { MapPin, Globe, Compass } from 'lucide-react';

interface FootprintStatsProps {
  stats: FootprintStatsData;
  onSelectLevel?: (level: 'spots' | 'cities' | 'countries') => void;
  activeLevel?: 'spots' | 'cities' | 'countries' | null;
}

export const FootprintStats: React.FC<FootprintStatsProps> = ({
  stats,
  onSelectLevel,
  activeLevel,
}) => {
  return (
    <div
      id="footprint-stats-summary"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-bold tracking-tight text-slate-900 dark:text-white/90 font-heading tabular-nums"
    >
      {/* Total Spots */}
      <button
        type="button"
        id="footprint-stat-spots"
        onClick={() => onSelectLevel?.('spots')}
        className={`inline-flex items-center gap-1.5 transition-colors duration-150 cursor-pointer rounded-lg px-2 py-1 min-h-[36px] heyroq-focus-ring ${
          activeLevel === 'spots'
            ? 'bg-[var(--brand-primary)]/14 text-[var(--heyroq-accent-text)] ring-1 ring-[var(--brand-primary)]/35'
            : 'text-slate-900 dark:text-white hover:text-[var(--heyroq-accent-text)] hover:bg-slate-900/5 dark:hover:bg-white/5'
        }`}
        title="View individual spots"
      >
        <MapPin className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
        <span>{stats.totalSpots}</span>
        <span className="font-sans text-slate-500 dark:text-white/45 text-xs font-medium normal-case tracking-normal">
          {stats.totalSpots === 1 ? 'spot' : 'spots'}
        </span>
      </button>

      <span className="text-slate-300 dark:text-white/20 font-light select-none" aria-hidden="true">
        ·
      </span>

      {/* Cities Count */}
      <button
        type="button"
        id="footprint-stat-cities"
        onClick={() => onSelectLevel?.('cities')}
        className={`inline-flex items-center gap-1.5 transition-colors duration-150 cursor-pointer rounded-lg px-2 py-1 min-h-[36px] heyroq-focus-ring ${
          activeLevel === 'cities'
            ? 'bg-[var(--brand-primary)]/14 text-[var(--heyroq-accent-text)] ring-1 ring-[var(--brand-primary)]/35'
            : 'text-slate-900 dark:text-white hover:text-[var(--heyroq-accent-text)] hover:bg-slate-900/5 dark:hover:bg-white/5'
        }`}
        title="View city clusters"
      >
        <Compass className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
        <span>{stats.citiesCount}</span>
        <span className="font-sans text-slate-500 dark:text-white/45 text-xs font-medium normal-case tracking-normal">
          {stats.citiesCount === 1 ? 'city' : 'cities'}
        </span>
      </button>

      <span className="text-slate-300 dark:text-white/20 font-light select-none" aria-hidden="true">
        ·
      </span>

      {/* Countries Count */}
      <button
        type="button"
        id="footprint-stat-countries"
        onClick={() => onSelectLevel?.('countries')}
        className={`inline-flex items-center gap-1.5 transition-colors duration-150 cursor-pointer rounded-lg px-2 py-1 min-h-[36px] heyroq-focus-ring ${
          activeLevel === 'countries'
            ? 'bg-[var(--brand-primary)]/14 text-[var(--heyroq-accent-text)] ring-1 ring-[var(--brand-primary)]/35'
            : 'text-slate-900 dark:text-white hover:text-[var(--heyroq-accent-text)] hover:bg-slate-900/5 dark:hover:bg-white/5'
        }`}
        title="View country clusters"
      >
        <Globe className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
        <span>{stats.countriesCount}</span>
        <span className="font-sans text-slate-500 dark:text-white/45 text-xs font-medium normal-case tracking-normal">
          {stats.countriesCount === 1 ? 'country' : 'countries'}
        </span>
      </button>
    </div>
  );
};
