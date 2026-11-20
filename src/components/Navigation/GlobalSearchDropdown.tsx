import React from 'react';
import {
  MapPin,
  Users,
  Compass,
  Hash,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { CategorizedSearchResults } from '../../services/searchService';
import { Pin } from '../../types';
import { hasSpotSearchQuery } from '../../utils/spotSearch';
import { UserAvatar } from '../Common/UserAvatar';

interface GlobalSearchDropdownProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  query: string;
  results: CategorizedSearchResults;
  isLoading: boolean;
  onSelectSpot: (pin: Pin) => void;
  onSelectPerson: (userId: string) => void;
  onSelectCity: (cityName: string, lat: number, lng: number) => void;
  onSelectTag: (tag: string) => void;
}

export const GlobalSearchDropdown: React.FC<GlobalSearchDropdownProps> = ({
  id,
  isOpen,
  onClose,
  query,
  results,
  isLoading,
  onSelectSpot,
  onSelectPerson,
  onSelectCity,
  onSelectTag,
}) => {
  if (!isOpen) return null;

  const cleanQuery = query.trim();
  const hasMinLength = hasSpotSearchQuery(cleanQuery);
  const hasAnyResults = results.totalCount > 0;

  return (
    <div
      id={id}
      role="region"
      aria-label="Search results"
      className="liquid-glass-popover absolute left-0 right-0 top-full mt-2 w-full max-h-[min(60dvh,32rem)] overscroll-contain overflow-y-auto rounded-2xl z-50 text-[var(--heyroq-text-primary)] divide-y divide-[var(--heyroq-border-subtle)] no-scrollbar animate-in fade-in zoom-in-95 duration-150"
    >
      <span role="status" className="sr-only">
        {hasMinLength && (isLoading ? 'Searching' : results.spotsUnavailable ? 'Spot search unavailable' : `${results.totalCount} search results`)}
      </span>
      {/* Search Header / Status Bar */}
      <div className="px-3.5 py-2.5 bg-slate-900/[0.03] dark:bg-black/30 flex items-center justify-between text-[11px] text-[var(--heyroq-text-muted)]">
        <span className="font-semibold flex items-center gap-1.5">
          {hasMinLength ? (
            <>
              <span>Results for</span>
              <span className="text-[var(--heyroq-text-primary)] font-bold max-w-[140px] truncate">
                &ldquo;{cleanQuery}&rdquo;
              </span>
            </>
          ) : (
            <span>Search Heyroq</span>
          )}
        </span>
        {isLoading && (
          <span className="flex items-center gap-1.5 text-[var(--heyroq-accent-text)] font-medium text-[11px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Searching...</span>
          </span>
        )}
      </div>

      {/* 1-char hint */}
      {!hasMinLength && (
        <div className="p-5 text-center text-xs text-[var(--heyroq-text-muted)]">
          <p className="font-semibold text-[var(--heyroq-text-secondary)]">
            Type at least 2 characters
          </p>
          <p className="text-[11px] text-[var(--heyroq-text-muted)] mt-1">
            Search for spots, cities, tags, and explorers
          </p>
        </div>
      )}

      {/* Loading with no prior results */}
      {hasMinLength && isLoading && !hasAnyResults && (
        <div className="py-12 text-center text-xs text-[var(--heyroq-text-muted)] flex flex-col items-center justify-center gap-2.5">
          <Loader2 className="w-6 h-6 text-[var(--brand-primary)] animate-spin" />
          <span>Scanning spots, people, cities, and tags...</span>
        </div>
      )}

      {hasMinLength && !isLoading && results.spotsUnavailable && (
        <p className="p-4 text-center text-xs text-[var(--heyroq-text-secondary)]">
          Spot, city and tag search is unavailable. Check your connection and try again.
        </p>
      )}

      {/* Completed search with zero results */}
      {hasMinLength && !isLoading && !hasAnyResults && !results.spotsUnavailable && (
        <div className="py-10 px-4 text-center text-xs text-[var(--heyroq-text-muted)]">
          <p className="font-heading font-semibold text-sm text-[var(--heyroq-text-primary)]">No results found</p>
          <p className="text-[11px] text-[var(--heyroq-text-muted)] mt-1 max-w-xs mx-auto">
            We couldn&apos;t find any spots, people, cities, or tags matching &ldquo;{cleanQuery}
            &rdquo;.
          </p>
        </div>
      )}

      {/* Grouped Results Sections */}
      {hasAnyResults && (
        <div className="divide-y divide-[var(--heyroq-border-subtle)]">
          {/* 1. SPOTS */}
          {results.spots.length > 0 && (
            <div className="p-2">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-[var(--heyroq-accent-text)] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Spots
                </span>
                <span className="text-[var(--heyroq-text-muted)] font-medium tabular-nums">
                  {results.spots.length} found
                </span>
              </div>
              <div className="space-y-1">
                {results.spots.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.pin) onSelectSpot(item.pin);
                      onClose();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-900/[0.05] dark:hover:bg-white/10 transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 flex items-center justify-center shrink-0 text-[var(--brand-primary)] group-hover:scale-105 transition-transform">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--heyroq-text-primary)] truncate group-hover:text-[var(--heyroq-accent-text)] transition-colors">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[var(--heyroq-text-muted)] truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--heyroq-text-muted)] group-hover:text-[var(--heyroq-text-primary)] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. PEOPLE */}
          {results.people.length > 0 && (
            <div className="p-2">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  People
                </span>
                <span className="text-[var(--heyroq-text-muted)] font-medium tabular-nums">
                  {results.people.length} found
                </span>
              </div>
              <div className="space-y-1">
                {results.people.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.user) onSelectPerson(item.user.id);
                      onClose();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-900/[0.05] dark:hover:bg-white/10 transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        uid={item.user?.uid || item.user?.id || item.id}
                        displayName={item.user?.displayName || item.title}
                        imageUrl={item.avatarUrl}
                        size="sm"
                        className="w-7 h-7"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--heyroq-text-primary)] truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[var(--heyroq-text-muted)] truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-900/[0.05] dark:bg-white/5 text-[var(--heyroq-text-secondary)] group-hover:bg-emerald-500/15 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors shrink-0">
                      View Profile
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. CITIES */}
          {results.cities.length > 0 && (
            <div className="p-2">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5" />
                  Cities
                </span>
                <span className="text-[var(--heyroq-text-muted)] font-medium tabular-nums">
                  {results.cities.length} found
                </span>
              </div>
              <div className="space-y-1">
                {results.cities.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (
                        item.city &&
                        typeof item.latitude === 'number' &&
                        typeof item.longitude === 'number'
                      ) {
                        onSelectCity(item.city, item.latitude, item.longitude);
                      }
                      onClose();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-900/[0.05] dark:hover:bg-white/10 transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 text-sky-600 dark:text-sky-400 group-hover:scale-105 transition-transform">
                        <Compass className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--heyroq-text-primary)] truncate group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[var(--heyroq-text-muted)] truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-900/[0.05] dark:bg-white/5 text-[var(--heyroq-text-secondary)] group-hover:bg-sky-500/15 group-hover:text-sky-700 dark:group-hover:text-sky-300 transition-colors shrink-0">
                      Jump to City
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. TAGS */}
          {results.tags.length > 0 && (
            <div className="p-2">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" />
                  Tags
                </span>
                <span className="text-[var(--heyroq-text-muted)] font-medium tabular-nums">
                  {results.tags.length} found
                </span>
              </div>
              <div className="space-y-1">
                {results.tags.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.tag) onSelectTag(item.tag);
                      onClose();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-900/[0.05] dark:hover:bg-white/10 transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                        <Hash className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--heyroq-text-primary)] truncate group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[var(--heyroq-text-muted)] truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-900/[0.05] dark:bg-white/5 text-[var(--heyroq-text-secondary)] group-hover:bg-amber-500/15 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors shrink-0">
                      Filter Tag
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
