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
    <div
      id="places-discovered-section"
      className="mt-4 pt-4 border-t border-slate-900/8 dark:border-white/10"
    >
      {/* Header with Title & Active Filter Reset */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
          <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-white/70">
            Places Discovered
          </h4>
          <span className="text-[11px] tabular-nums text-slate-500 dark:text-white/45 font-medium">
            ({countries.length} {countries.length === 1 ? 'country' : 'countries'})
          </span>
        </div>

        {activeCountry && (
          <button
            type="button"
            id="clear-footprint-filter-btn"
            onClick={onClearFilter}
            className="inline-flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-full text-xs font-semibold text-[var(--heyroq-accent-text)] bg-[var(--brand-primary)]/10 hover:bg-[var(--brand-primary)]/18 border border-[var(--brand-primary)]/25 transition-colors cursor-pointer heyroq-focus-ring"
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
              className={`liquid-glass-card p-3 rounded-xl transition-all duration-150 ${
                isCountryActive
                  ? 'border-[var(--brand-primary)]/55 ring-1 ring-[var(--brand-primary)]/25'
                  : 'hover:border-slate-900/18 dark:hover:border-white/18'
              }`}
            >
              {/* Country Row: Flag, Name, Spots Count */}
              <button
                type="button"
                onClick={() => onSelectCountry(country)}
                className="w-full flex items-center justify-between gap-3 text-left cursor-pointer group select-none min-h-[34px] heyroq-focus-ring rounded-lg"
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
                  <span className="font-heading text-xs font-bold tracking-tight text-slate-900 dark:text-white group-hover:text-[var(--heyroq-accent-text)] transition-colors truncate">
                    {country.countryName}
                  </span>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  <span
                    className={`text-[11px] tabular-nums font-semibold ${
                      isCountryActive
                        ? 'text-[var(--heyroq-accent-text)]'
                        : 'text-slate-500 dark:text-white/55'
                    }`}
                  >
                    {country.spotsCount} {country.spotsCount === 1 ? 'spot' : 'spots'}
                  </span>
                </div>
              </button>

              {/* City Filter Buttons */}
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
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer heyroq-focus-ring ${
                          isCityActive
                            ? 'heyroq-btn-primary font-semibold'
                            : 'bg-slate-900/[0.04] dark:bg-white/[0.05] hover:bg-slate-900/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-white/80 hover:text-slate-950 dark:hover:text-white border border-slate-900/10 dark:border-white/10'
                        }`}
                        title={`Zoom to ${city.cityName}, ${country.countryName}`}
                      >
                        <span className="truncate max-w-[120px]">{city.cityName}</span>
                        <span
                          className={`text-[10px] tabular-nums font-bold ${
                            isCityActive ? 'text-white/90' : 'text-slate-400 dark:text-white/45'
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

      {/* "+ N More" / "Show Less" Toggle */}
      {hasMore && (
        <button
          type="button"
          id="toggle-more-countries-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="w-full mt-2.5 py-2.5 min-h-[40px] text-center text-xs font-semibold text-slate-600 dark:text-white/60 hover:text-slate-950 dark:hover:text-white hover:bg-slate-900/[0.04] dark:hover:bg-white/5 rounded-xl border border-dashed border-slate-900/15 dark:border-white/15 hover:border-slate-900/30 dark:hover:border-white/30 transition-colors flex items-center justify-center gap-1.5 cursor-pointer heyroq-focus-ring"
        >
          {isExpanded ? (
            <>
              <span>Show Less</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              <span>
                + {remainingCount} more {remainingCount === 1 ? 'country' : 'countries'}
              </span>
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
};
