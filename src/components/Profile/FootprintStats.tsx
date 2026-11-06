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
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:text-base font-black uppercase tracking-tight text-white/90"
    >
      {/* Total Spots */}
      <button
        type="button"
        id="footprint-stat-spots"
        onClick={() => onSelectLevel?.('spots')}
        className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer rounded-lg px-1.5 py-0.5 ${
          activeLevel === 'spots'
            ? 'bg-[#FF5F40]/15 text-[#FF5F40] ring-1 ring-[#FF5F40]/40'
            : 'text-white hover:text-[#FF5F40] hover:bg-white/5'
        }`}
        title="View individual spots"
      >
        <MapPin className="w-3.5 h-3.5 text-[#FF5F40]" />
        <span>{stats.totalSpots}</span>
        <span className="text-white/40 text-xs font-semibold normal-case tracking-normal">
          {stats.totalSpots === 1 ? 'spot' : 'spots'}
        </span>
      </button>

      <span className="text-white/20 font-light select-none">·</span>

      {/* Cities Count */}
      <button
        type="button"
        id="footprint-stat-cities"
        onClick={() => onSelectLevel?.('cities')}
        className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer rounded-lg px-1.5 py-0.5 ${
          activeLevel === 'cities'
            ? 'bg-[#FF5F40]/15 text-[#FF5F40] ring-1 ring-[#FF5F40]/40'
            : 'text-white hover:text-[#FF5F40] hover:bg-white/5'
        }`}
        title="View city clusters"
      >
        <Compass className="w-3.5 h-3.5 text-[#FF5F40]" />
        <span>{stats.citiesCount}</span>
        <span className="text-white/40 text-xs font-semibold normal-case tracking-normal">
          {stats.citiesCount === 1 ? 'city' : 'cities'}
        </span>
      </button>

      <span className="text-white/20 font-light select-none">·</span>

      {/* Countries Count */}
      <button
        type="button"
        id="footprint-stat-countries"
        onClick={() => onSelectLevel?.('countries')}
        className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer rounded-lg px-1.5 py-0.5 ${
          activeLevel === 'countries'
            ? 'bg-[#FF5F40]/15 text-[#FF5F40] ring-1 ring-[#FF5F40]/40'
            : 'text-white hover:text-[#FF5F40] hover:bg-white/5'
        }`}
        title="View country clusters"
      >
        <Globe className="w-3.5 h-3.5 text-[#FF5F40]" />
        <span>{stats.countriesCount}</span>
        <span className="text-white/40 text-xs font-semibold normal-case tracking-normal">
          {stats.countriesCount === 1 ? 'country' : 'countries'}
        </span>
      </button>
    </div>
  );
};
