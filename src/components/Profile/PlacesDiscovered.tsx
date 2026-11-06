import React, { useState } from 'react';
import { CountryFootprintGroup, CityFootprintGroup } from '../../utils/footprintUtils';
import { Compass, X, ChevronDown, ChevronUp } from 'lucide-react';

interface PlacesDiscoveredProps {
  countries: CountryFootprintGroup[];
  activeCountry: string | null;
  activeCity: string | null;
  onSelectCountry: (country: CountryFootprintGroup) => void;
  onSelectCity: (city: CityFootprintGroup, country: CountryFootprintGroup) => void;
  onClearFilter: () => void;
}

export const PlacesDiscovered: React.FC<PlacesDiscoveredProps> = ({
  countries,
  activeCountry,
  activeCity,
  onSelectCountry,
  onSelectCity,
  onClearFilter,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!countries || countries.length === 0) {
    return null;
  }

  const INITIAL_VISIBLE_COUNT = 4;
  const hasMore = countries.length > INITIAL_VISIBLE_COUNT;
  const visibleCountries = isExpanded ? countries : countries.slice(0, INITIAL_VISIBLE_COUNT);
  const remainingCount = countries.length - INITIAL_VISIBLE_COUNT;

  return (
    <div id="places-discovered-section" className="mt-4 pt-4 border-t border-white/10">
      {/* Header with Title & Active Filter Reset */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-3.5 h-3.5 text-[#FF5F40]" />
          <h4 className="text-[11px] font-black uppercase tracking-widest text-white/70">
            Places Discovered
          </h4>
          <span className="text-[10px] font-mono text-white/40 font-semibold">
            ({countries.length} {countries.length === 1 ? 'country' : 'countries'})
          </span>
        </div>

        {activeCountry && (
          <button
            type="button"
            id="clear-footprint-filter-btn"
            onClick={onClearFilter}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-[#FF5F40] bg-[#FF5F40]/10 hover:bg-[#FF5F40]/20 border border-[#FF5F40]/30 transition cursor-pointer"
            title="Reset location filter and show full map"
          >
            <span>Reset View</span>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Compact Country List */}
      <div className="space-y-2">
        {visibleCountries.map((country) => {
          const isCountryActive =
            activeCountry?.toLowerCase() === country.countryName.toLowerCase();

          return (
            <div
              key={country.countryName}
              id={`country-row-${country.countryName.toLowerCase().replace(/\s+/g, '-')}`}
              className={`p-2.5 rounded-xl border transition-all duration-200 ${
                isCountryActive
                  ? 'bg-white/[0.08] border-[#FF5F40]/50 shadow-[0_0_15px_rgba(255,95,64,0.15)] ring-1 ring-[#FF5F40]/30'
                  : 'bg-[#141414]/90 hover:bg-[#1a1a1a] border-white/5 hover:border-white/15'
              }`}
            >
              {/* Country Row: Flag, Name, Spots Count */}
              <button
                type="button"
                onClick={() => onSelectCountry(country)}
                className="w-full flex items-center justify-between gap-3 text-left cursor-pointer group select-none"
                title={`Filter map to ${country.countryName}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="text-lg leading-none shrink-0 select-none"
                    role="img"
                    aria-label={country.countryName}
                  >
                    {country.flag}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider text-white group-hover:text-[#FF5F40] transition truncate">
                    {country.countryName}
                  </span>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded-md transition ${
                      isCountryActive
                        ? 'bg-[#FF5F40] text-white'
                        : 'bg-white/10 text-white/90 group-hover:bg-white/20'
                    }`}
                  >
                    {country.spotsCount} {country.spotsCount === 1 ? 'SPOT' : 'SPOTS'}
                  </span>
                </div>
              </button>

              {/* City Chips */}
              {country.cities && country.cities.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-7">
                  {country.cities.map((city) => {
                    const isCityActive =
                      isCountryActive &&
                      activeCity?.toLowerCase() === city.cityName.toLowerCase();

                    return (
                      <button
                        key={city.cityName}
                        type="button"
                        id={`city-chip-${city.cityName.toLowerCase().replace(/\s+/g, '-')}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCity(city, country);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                          isCityActive
                            ? 'bg-[#FF5F40] text-white shadow-md font-bold ring-1 ring-white/30'
                            : 'bg-white/5 hover:bg-white/15 text-white/80 hover:text-white border border-white/10 hover:border-white/20'
                        }`}
                        title={`Zoom to ${city.cityName}, ${country.countryName}`}
                      >
                        <span className="truncate max-w-[120px]">{city.cityName}</span>
                        <span
                          className={`text-[10px] font-mono font-bold ${
                            isCityActive ? 'text-white/90' : 'text-white/40'
                          }`}
                        >
                          {city.spotsCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* "+ N More" / "Show Less" Toggle for compactness */}
      {hasMore && (
        <button
          type="button"
          id="toggle-more-countries-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="w-full mt-2.5 py-2 text-center text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/5 rounded-xl border border-dashed border-white/15 hover:border-white/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {isExpanded ? (
            <>
              <span>Show Less</span>
              <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              <span>+ {remainingCount} more {remainingCount === 1 ? 'country' : 'countries'}</span>
              <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
};
