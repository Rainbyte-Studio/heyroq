import React from 'react';
import {
  MapPin,
  Users,
  Compass,
  Hash,
  Loader2,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { CategorizedSearchResults, GlobalSearchResultItem } from '../../services/searchService';
import { Pin } from '../../types';

interface GlobalSearchDropdownProps {
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
  const hasMinLength = cleanQuery.length >= 2;
  const hasAnyResults = results.totalCount > 0;

  return (
    <div
      id="global-search-dropdown"
      className="absolute left-0 right-0 top-full mt-2 w-full max-h-[75vh] overflow-y-auto bg-[#141414] border border-white/15 rounded-2xl shadow-2xl z-50 text-white divide-y divide-white/10 no-scrollbar backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Search Header / Status Bar */}
      <div className="px-3.5 py-2.5 bg-black/40 flex items-center justify-between text-[11px] text-white/50">
        <span className="font-semibold flex items-center gap-1.5">
          {hasMinLength ? (
            <>
              <span>Results for</span>
              <span className="text-white font-bold max-w-[140px] truncate">"{cleanQuery}"</span>
            </>
          ) : (
            <span>Search Heyroq</span>
          )}
        </span>
        {isLoading && (
          <span className="flex items-center gap-1.5 text-[#FF5F40] font-medium text-[11px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Searching...</span>
          </span>
        )}
      </div>

      {/* 1-char hint */}
      {!hasMinLength && (
        <div className="p-5 text-center text-xs text-white/40">
          <p className="font-semibold text-white/70">Type at least 2 characters</p>
          <p className="text-[11px] text-white/40 mt-1">
            Search for spots, cities, tags, and explorers
          </p>
        </div>
      )}

      {/* Loading with no prior results */}
      {hasMinLength && isLoading && !hasAnyResults && (
        <div className="py-12 text-center text-xs text-white/40 flex flex-col items-center justify-center gap-2.5">
          <Loader2 className="w-6 h-6 text-[#FF5F40] animate-spin" />
          <span>Scanning spots, people, cities, and tags...</span>
        </div>
      )}

      {/* Completed search with zero results */}
      {hasMinLength && !isLoading && !hasAnyResults && (
        <div className="py-10 px-4 text-center text-xs text-white/50">
          <p className="font-bold text-sm text-white/80">No results found</p>
          <p className="text-[11px] text-white/40 mt-1 max-w-xs mx-auto">
            We couldn't find any spots, people, cities, or tags matching "{cleanQuery}".
          </p>
          <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-center gap-2 text-[10px] text-white/40">
            <span>Suggestions:</span>
            <button
              type="button"
              onClick={() => onSelectTag('coffee')}
              className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
            >
              #coffee
            </button>
            <button
              type="button"
              onClick={() => onSelectTag('ramen')}
              className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
            >
              #ramen
            </button>
            <button
              type="button"
              onClick={() => onSelectCity('Zakynthos, Greece', 37.8594, 20.6249)}
              className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
            >
              Zakynthos
            </button>
          </div>
        </div>
      )}

      {/* Grouped Results Sections */}
      {hasAnyResults && (
        <div className="divide-y divide-white/5">
          {/* 1. SPOTS */}
          {results.spots.length > 0 && (
            <div className="p-2">
              <div className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#FF5F40] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" />
                  Spots
                </span>
                <span className="text-white/40 font-semibold lowercase">
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
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-white/10 transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-[#FF5F40] group-hover:scale-105 transition-transform">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate group-hover:text-[#FF8C75] transition-colors">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-white/50 truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. PEOPLE */}
          {results.people.length > 0 && (
            <div className="p-2">
              <div className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  People
                </span>
                <span className="text-white/40 font-semibold lowercase">
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
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-white/10 transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.avatarUrl ? (
                        <img
                          src={item.avatarUrl}
                          alt={item.title}
                          className="w-7 h-7 rounded-full object-cover border border-white/15 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-white/70">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate group-hover:text-emerald-300 transition-colors">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-white/50 truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-white/60 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 transition-colors shrink-0">
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
              <div className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-sky-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-3 h-3" />
                  Cities
                </span>
                <span className="text-white/40 font-semibold lowercase">
                  {results.cities.length} found
                </span>
              </div>
              <div className="space-y-1">
                {results.cities.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.city && typeof item.latitude === 'number' && typeof item.longitude === 'number') {
                        onSelectCity(item.city, item.latitude, item.longitude);
                      }
                      onClose();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-white/10 transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 text-sky-400 group-hover:scale-105 transition-transform">
                        <Compass className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate group-hover:text-sky-300 transition-colors">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-white/50 truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-white/60 group-hover:bg-sky-500/20 group-hover:text-sky-300 transition-colors shrink-0">
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
              <div className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3 h-3" />
                  Tags
                </span>
                <span className="text-white/40 font-semibold lowercase">
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
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-white/10 transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-400 group-hover:scale-105 transition-transform">
                        <Hash className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-white/50 truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-white/60 group-hover:bg-amber-500/20 group-hover:text-amber-300 transition-colors shrink-0">
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
