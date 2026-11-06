import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { PinCategory, DiscoveryFilter } from '../../types';
import { normalizeCategory, isSameCategory } from '../../utils/categoryUtils';
import { CategoryBadge, CATEGORY_CONFIG } from '../Map/CategoryBadge';
import { GlobalSearchDropdown } from './GlobalSearchDropdown';
import { executeGlobalSearch, CategorizedSearchResults } from '../../services/searchService';
import { Pin } from '../../types';
import {
  Search,
  Plus,
  User,
  Shield,
  LogOut,
  Flame,
  Clock,
  Sparkles,
  X,
  MapPin,
  ChevronDown,
  SlidersHorizontal,
  Compass,
  Check,
  Users,
  Trophy,
} from 'lucide-react';
import { subscribeToUserProgression } from '../../services/gamificationService';
import { UserProgressionSummary } from '../../types';

interface NavbarProps {
  discoveryFilter: DiscoveryFilter;
  onFilterChange: (filter: DiscoveryFilter) => void;
  selectedCategory: PinCategory | null;
  onCategoryChange: (category: PinCategory | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenCreatePin: () => void;
  onOpenAuth: (mode?: 'signin' | 'signup') => void;
  onOpenProfile: (userId: string) => void;
  onOpenProgression?: () => void;
  onOpenAdmin: () => void;
  onOpenDiscoverPeople?: () => void;
  onSelectSpot?: (pin: Pin) => void;
  onSelectPerson?: (userId: string) => void;
  onSelectCity?: (cityName: string, lat: number, lng: number) => void;
  onSelectTag?: (tag: string) => void;
}

const CATEGORIES: PinCategory[] = [
  'Hidden Gems',
  'Food',
  'Travel',
  'Nature',
  'Photography',
  'Events',
  'Activities',
];

export const Navbar: React.FC<NavbarProps> = ({
  discoveryFilter,
  onFilterChange,
  selectedCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  onOpenCreatePin,
  onOpenAuth,
  onOpenProfile,
  onOpenProgression,
  onOpenAdmin,
  onOpenDiscoverPeople,
  onSelectSpot,
  onSelectPerson,
  onSelectCity,
  onSelectTag,
}) => {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [userProgression, setUserProgression] = useState<UserProgressionSummary | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setUserProgression(null);
      return;
    }
    const unsub = subscribeToUserProgression(user.uid, (summary) => {
      setUserProgression(summary);
    });
    return () => unsub();
  }, [user?.uid]);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Global Search Dropdown State
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState<CategorizedSearchResults>({
    spots: [],
    people: [],
    cities: [],
    tags: [],
    totalCount: 0,
  });
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const globalSearchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const globalSearchSeqRef = useRef(0);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Global Search Debounce & Stale Request Guard
  useEffect(() => {
    const q = searchQuery.trim();
    if (globalSearchDebounceRef.current) {
      clearTimeout(globalSearchDebounceRef.current);
    }

    if (q.length < 2) {
      setIsSearchingGlobal(false);
      if (q.length === 0) {
        setGlobalSearchResults({
          spots: [],
          people: [],
          cities: [],
          tags: [],
          totalCount: 0,
        });
      }
      return;
    }

    setIsSearchingGlobal(true);
    globalSearchDebounceRef.current = setTimeout(async () => {
      const seq = ++globalSearchSeqRef.current;
      try {
        const results = await executeGlobalSearch(q);
        if (seq !== globalSearchSeqRef.current) return;
        setGlobalSearchResults(results);
      } catch (err) {
        if (seq === globalSearchSeqRef.current) {
          console.error('[Heyroq Global Search] Error:', err);
        }
      } finally {
        if (seq === globalSearchSeqRef.current) {
          setIsSearchingGlobal(false);
        }
      }
    }, 300);

    return () => {
      if (globalSearchDebounceRef.current) {
        clearTimeout(globalSearchDebounceRef.current);
      }
    };
  }, [searchQuery]);

  // Close search dropdown and user dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchFocused(false);
      }
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Mobile Bottom Sheet states
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [exploreSheetOpen, setExploreSheetOpen] = useState(false);

  // Scroll position detection for mobile Explore bottom sheet to show bottom fade
  const [mobileExploreHasMoreBelow, setMobileExploreHasMoreBelow] = useState(true);
  const mobileExploreListRef = useRef<HTMLDivElement>(null);

  const checkMobileExploreScroll = useCallback(() => {
    const el = mobileExploreListRef.current;
    if (!el) return;
    const canScroll = el.scrollHeight > el.clientHeight + 4;
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16;
    setMobileExploreHasMoreBelow(canScroll && !isAtBottom);
  }, []);

  useEffect(() => {
    if (exploreSheetOpen) {
      const timer = setTimeout(checkMobileExploreScroll, 80);
      return () => clearTimeout(timer);
    }
  }, [exploreSheetOpen, checkMobileExploreScroll]);

  // Touch swipe-down detection to dismiss bottom sheets
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent, onClose: () => void) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 50) {
      onClose();
      touchStartY.current = null;
    }
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
  };

  // Lock body scroll when mobile sheet is open
  useEffect(() => {
    if (sortSheetOpen || exploreSheetOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sortSheetOpen, exploreSheetOpen]);

  // Handle escape key to close bottom sheets, search, and dropdowns
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSortSheetOpen(false);
        setExploreSheetOpen(false);
        setMoreDropdownOpen(false);
        setUserDropdownOpen(false);
        setIsSearchFocused(false);
        setMobileSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Desktop Explore Categories overflow calculation
  const desktopBarRef = useRef<HTMLDivElement>(null);
  const prefixGroupRef = useRef<HTMLDivElement>(null);
  const moreDropdownRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      // Conservative estimate: viewport width minus padding and prefix group (~410px)
      return Math.max(160, window.innerWidth - 460);
    }
    return 400;
  });
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);

  // ResizeObserver to track available width for desktop category pills within the centered group
  useEffect(() => {
    const barEl = desktopBarRef.current;
    if (!barEl) return;

    const updateWidth = () => {
      if (barEl) {
        const barWidth = barEl.clientWidth;
        const prefixWidth = prefixGroupRef.current ? prefixGroupRef.current.offsetWidth : 400;
        // Gap between prefix group and pills is 12px/16px (gap-3 sm:gap-4)
        const gap = window.innerWidth >= 640 ? 16 : 12;
        const availableForPills = Math.max(120, barWidth - prefixWidth - gap);
        setContainerWidth(availableForPills);
      }
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });

    resizeObserver.observe(barEl);
    if (prefixGroupRef.current) {
      resizeObserver.observe(prefixGroupRef.current);
    }
    window.addEventListener('resize', updateWidth);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [user]);

  // Close More dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        moreDropdownRef.current &&
        !moreDropdownRef.current.contains(e.target as Node)
      ) {
        setMoreDropdownOpen(false);
      }
    };
    if (moreDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [moreDropdownOpen]);

  // Calculate visible vs overflow categories based on available width
  const { visibleCategories, overflowCategories, isOverflowSelected } = React.useMemo(() => {
    // Primary visible order as requested:
    // 'Hidden Gems', 'Food', 'Travel', 'Nature', 'Photography', 'Events'
    // Trailing: 'Activities'
    const primary: PinCategory[] = [
      'Hidden Gems',
      'Food',
      'Travel',
      'Nature',
      'Photography',
      'Events',
    ];
    const trailing: PinCategory[] = ['Activities'];

    // Realistic CategoryBadge (size="sm") rendered widths including padding, icons, dots, and typography
    const categoryWidths: Record<PinCategory, number> = {
      'Hidden Gems': 156,
      Food: 104,
      Travel: 114,
      Nature: 116,
      Photography: 160,
      Events: 116,
      Activities: 138,
      Other: 108,
    };

    const allSpotsWidth = 124;
    const gap = 8;
    const safetyBuffer = 10; // Guarantees the final control never touches or encroaches on the right padding
    const moreBaseWidth = 94;
    const moreActiveWidth = 185; // Accommodates active indicator and longer category label (e.g. "More: Activities ▾")

    const canonicalSelected = normalizeCategory(selectedCategory);
    const visible: PinCategory[] = [...primary];
    const overflow: PinCategory[] = [...trailing];

    const hasOverflowSelected = (list: PinCategory[]) =>
      Boolean(canonicalSelected && list.some((cat) => isSameCategory(canonicalSelected, cat)));

    const getRequiredWidth = (vis: PinCategory[], ovf: PinCategory[]) => {
      let w = allSpotsWidth + safetyBuffer;
      for (const cat of vis) {
        w += gap + categoryWidths[cat];
      }
      if (ovf.length > 0) {
        const moreWidth = hasOverflowSelected(ovf) ? moreActiveWidth : moreBaseWidth;
        w += gap + moreWidth;
      }
      return w;
    };

    // Progressively move trailing items into overflow if width is insufficient
    while (visible.length > 0 && getRequiredWidth(visible, overflow) > containerWidth) {
      const popped = visible.pop();
      if (popped) {
        overflow.unshift(popped);
      }
    }

    return {
      visibleCategories: visible,
      overflowCategories: overflow,
      isOverflowSelected: hasOverflowSelected(overflow),
    };
  }, [containerWidth, selectedCategory]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const canonicalSelected = normalizeCategory(selectedCategory);

  // Config for selected overflow category (if active)
  const selectedOverflowConfig =
    isOverflowSelected && canonicalSelected
      ? CATEGORY_CONFIG[canonicalSelected] || CATEGORY_CONFIG.Other
      : null;

  return (
    <header className="shrink-0 w-full sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/10 text-white pt-[env(safe-area-inset-top)]">
      {/* Top Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 sm:h-18 flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand */}
        <div className="flex items-center shrink-0">
          <div
            id="nav-logo-btn"
            onClick={() => {
              onFilterChange('recent');
              onCategoryChange(null);
              onSearchChange('');
            }}
            className="cursor-pointer select-none group"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onFilterChange('recent');
                onCategoryChange(null);
                onSearchChange('');
              }
            }}
          >
            <h1 className="text-2xl sm:text-4xl font-black tracking-tighter italic text-[#FF5F40] leading-none group-hover:opacity-90 transition-opacity">
              heyroq.
            </h1>
          </div>
        </div>

        {/* Global Search Bar (Desktop / Tablet) */}
        <div ref={searchContainerRef} className="hidden md:block flex-1 max-w-md mx-3 relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setIsSearchFocused(true);
              }}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsSearchFocused(false);
                }
              }}
              placeholder="Search spots, coffee, tags, cities..."
              className="w-full text-xs sm:text-sm pl-9.5 pr-20 py-2.5 bg-white/10 border border-white/20 rounded-full text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF5F40] focus:ring-1 focus:ring-[#FF5F40] transition-colors"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                    setIsSearchFocused(false);
                  }}
                  className="p-1 text-white/40 hover:text-white cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {onOpenDiscoverPeople && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchFocused(false);
                    onOpenDiscoverPeople();
                  }}
                  title="Find Explorers & People"
                  className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wider text-white/80 hover:text-white flex items-center gap-1 transition cursor-pointer border border-white/10"
                >
                  <Users className="w-3 h-3 text-[#FF5F40]" />
                  <span className="hidden sm:inline">People</span>
                </button>
              )}
            </div>
          </div>

          {/* Categorized Global Search Dropdown (Desktop) */}
          <GlobalSearchDropdown
            isOpen={isSearchFocused && searchQuery.trim().length > 0}
            onClose={() => setIsSearchFocused(false)}
            query={searchQuery}
            results={globalSearchResults}
            isLoading={isSearchingGlobal}
            onSelectSpot={(pin) => {
              onSelectSpot?.(pin);
              onSearchChange(pin.title);
              setIsSearchFocused(false);
            }}
            onSelectPerson={(uid) => {
              onSelectPerson?.(uid);
              setIsSearchFocused(false);
            }}
            onSelectCity={(city, lat, lng) => {
              onSelectCity?.(city, lat, lng);
              onSearchChange(city);
              setIsSearchFocused(false);
            }}
            onSelectTag={(tag) => {
              onSelectTag?.(tag);
              onSearchChange('#' + tag);
              setIsSearchFocused(false);
            }}
          />
        </div>

        {/* Right Actions (Create Pin, Auth / Profile, Mobile Search Toggle) */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Mobile Search Toggle */}
          <button
            type="button"
            id="mobile-search-toggle-btn"
            onClick={() => {
              setMobileSearchOpen((prev) => !prev);
              if (!mobileSearchOpen) {
                setIsSearchFocused(true);
              }
            }}
            aria-label="Toggle search"
            className={`md:hidden p-2 rounded-full border transition cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center ${
              mobileSearchOpen || searchQuery
                ? 'bg-[#FF5F40] text-white border-[#FF5F40]'
                : 'bg-white/10 text-white/80 hover:text-white border-white/15 hover:bg-white/20'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Mobile People Discovery */}
          {onOpenDiscoverPeople && (
            <button
              type="button"
              id="mobile-discover-people-btn"
              onClick={onOpenDiscoverPeople}
              title="Find Explorers & People"
              className="md:hidden p-2 rounded-full bg-white/10 text-white/80 hover:text-white border border-white/15 min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer"
              aria-label="Discover people"
            >
              <Users className="w-4 h-4 text-[#FF5F40]" />
            </button>
          )}

          {/* Create Pin Button */}
          <button
            id="nav-create-pin-btn"
            type="button"
            onClick={() => {
              if (!user) {
                onOpenAuth('signin');
              } else {
                onOpenCreatePin();
              }
            }}
            className="p-2 sm:px-5 sm:py-2.5 bg-[#FF5F40] hover:bg-[#ff7256] text-white rounded-full text-xs font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,95,64,0.4)] flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0 min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0"
            aria-label="Drop pin"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span className="hidden sm:inline">Drop Pin</span>
          </button>

          {/* User Profile or Sign In */}
          {user ? (
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                id="user-profile-menu-btn"
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 p-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition cursor-pointer min-h-[38px]"
                aria-label="User menu"
              >
                {profile?.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF5F40] to-[#FF8C75] flex items-center justify-center text-white text-xs font-black">
                    {profile?.displayName?.slice(0, 2).toUpperCase() || 'JD'}
                  </div>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-white/50 mr-1 hidden sm:block" />
              </button>

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-24px)] bg-[#121212]/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 py-2 z-50 animate-in fade-in slide-in-from-top-2 text-white">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-black uppercase tracking-wider text-white truncate">
                        {profile?.displayName || 'Explorer'}
                      </p>
                      <p className="text-[11px] font-bold text-[#FF5F40] truncate">
                        @{profile?.username || user.email?.split('@')[0]}
                      </p>
                    </div>
                    {userProgression && (
                      <span className="shrink-0 px-2 py-0.5 rounded-md bg-[#FF5F40]/15 border border-[#FF5F40]/30 text-[#FF5F40] text-[10px] font-mono font-bold tracking-tight">
                        LVL {userProgression.level}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onOpenProfile(user.uid);
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <User className="w-4 h-4 text-white/50" />
                    <span>My Profile & Spots</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenProgression) {
                        onOpenProgression();
                      }
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <Trophy className="w-4 h-4 text-[#FF5F40]" />
                    <span>Progression & Badges</span>
                  </button>

                  {onOpenDiscoverPeople && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenDiscoverPeople();
                        setUserDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-[#FF5F40]" />
                      <span>Find People</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onOpenCreatePin();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-[#FF5F40]" />
                    <span>Drop New Pin</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenAdmin();
                        setUserDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-bold text-amber-400 hover:bg-white/10 flex items-center gap-2.5 transition"
                    >
                      <Shield className="w-4 h-4 text-amber-400" />
                      <span>Moderation Panel</span>
                    </button>
                  )}

                  <div className="border-t border-white/10 my-1.5" />

                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-[#FF5F40] hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                id="nav-signin-btn"
                type="button"
                onClick={() => onOpenAuth('signin')}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-black uppercase tracking-wider text-white/75 hover:text-white transition cursor-pointer whitespace-nowrap min-h-[38px] flex items-center"
              >
                Sign In
              </button>
              <button
                id="nav-signup-btn"
                type="button"
                onClick={() => onOpenAuth('signup')}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white text-black hover:bg-neutral-200 rounded-full text-xs font-black uppercase tracking-wider shadow-lg transition cursor-pointer whitespace-nowrap shrink-0 min-h-[38px] flex items-center"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Expandable Search Bar (shown when toggled or active) */}
      {mobileSearchOpen && (
        <div className="md:hidden px-3 pb-3 pt-1 border-t border-white/10 bg-black/70 backdrop-blur-xl relative animate-in fade-in slide-in-from-top-1">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setIsSearchFocused(true);
              }}
              onFocus={() => setIsSearchFocused(true)}
              placeholder="Search spots, coffee, tags, cities..."
              className="w-full text-base pl-9.5 pr-18 py-2 bg-white/10 border border-white/20 rounded-full text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF5F40]"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                  }}
                  className="p-1 text-white/40 hover:text-white cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileSearchOpen(false);
                  setIsSearchFocused(false);
                }}
                className="p-1 text-white/40 hover:text-white cursor-pointer"
                aria-label="Close search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Global Search Dropdown */}
          <GlobalSearchDropdown
            isOpen={isSearchFocused && searchQuery.trim().length > 0}
            onClose={() => setIsSearchFocused(false)}
            query={searchQuery}
            results={globalSearchResults}
            isLoading={isSearchingGlobal}
            onSelectSpot={(pin) => {
              onSelectSpot?.(pin);
              onSearchChange(pin.title);
              setIsSearchFocused(false);
              setMobileSearchOpen(false);
            }}
            onSelectPerson={(uid) => {
              onSelectPerson?.(uid);
              setIsSearchFocused(false);
              setMobileSearchOpen(false);
            }}
            onSelectCity={(city, lat, lng) => {
              onSelectCity?.(city, lat, lng);
              onSearchChange(city);
              setIsSearchFocused(false);
              setMobileSearchOpen(false);
            }}
            onSelectTag={(tag) => {
              onSelectTag?.(tag);
              onSearchChange('#' + tag);
              setIsSearchFocused(false);
              setMobileSearchOpen(false);
            }}
          />
        </div>
      )}

      {/* Sub-bar: Discovery Filters & Category Chips (Sort & Explore) */}
      <div className="border-t border-white/10 bg-black/40 backdrop-blur-md py-2">
        {/* Mobile Control Row (compact, two clear buttons) */}
        <div className="flex md:hidden items-center gap-2 w-full px-3">
          {/* Mobile Sort Button */}
          <button
            type="button"
            id="mobile-sort-btn"
            onClick={() => setSortSheetOpen(true)}
            className={`flex-1 min-w-0 px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-1.5 transition cursor-pointer border ${
              discoveryFilter !== 'recent'
                ? 'bg-white/10 border-[#FF5F40]/50 text-white shadow-sm'
                : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <SlidersHorizontal
                className={`w-3.5 h-3.5 shrink-0 ${
                  discoveryFilter !== 'recent' ? 'text-[#FF5F40]' : 'text-white/60'
                }`}
              />
              <span className="truncate text-left">
                <span className="text-white/50 font-normal">Sort: </span>
                <span className="capitalize font-black text-white">{discoveryFilter}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {discoveryFilter !== 'recent' && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF5F40] shadow-[0_0_6px_#FF5F40]" />
              )}
              <ChevronDown className="w-3.5 h-3.5 text-white/40" />
            </div>
          </button>

          {/* Mobile Explore Button */}
          <button
            type="button"
            id="mobile-explore-btn"
            onClick={() => setExploreSheetOpen(true)}
            className={`flex-1 min-w-0 px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-1.5 transition cursor-pointer border ${
              canonicalSelected !== null
                ? 'bg-white/10 border-[#FF5F40]/50 text-white shadow-sm'
                : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <Compass
                className={`w-3.5 h-3.5 shrink-0 ${
                  canonicalSelected !== null ? 'text-[#FF5F40]' : 'text-white/60'
                }`}
              />
              <span className="truncate text-left">
                <span className="text-white/50 font-normal">Explore: </span>
                <span className="font-black text-white">{canonicalSelected || 'All spots'}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {canonicalSelected !== null && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF5F40] shadow-[0_0_6px_#FF5F40]" />
              )}
              <ChevronDown className="w-3.5 h-3.5 text-white/40" />
            </div>
          </button>
        </div>

        {/* Desktop/Tablet Layout: Entire filter-controls group precisely centered within the viewport */}
        <div
          ref={desktopBarRef}
          className="hidden md:block w-full px-4 xl:px-6"
        >
          {/* Shrink-to-fit inner wrapper centered with automatic margins so its visual midpoint matches viewport midpoint */}
          <div
            id="desktop-filter-controls-group"
            className="w-fit mx-auto flex items-center gap-3 sm:gap-4 flex-nowrap max-w-full"
          >
            {/* Prefix Group: Sort group, divider, and Explore label */}
            <div
              ref={prefixGroupRef}
              className="flex items-center gap-3 sm:gap-4 shrink-0 flex-nowrap"
            >
              {/* Sorting Group: Label + Recent, Popular, Trending */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40 select-none shrink-0">
                  Sort
                </span>
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10 shrink-0">
                  <button
                    type="button"
                    id="filter-recent-btn"
                    onClick={() => onFilterChange('recent')}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                      discoveryFilter === 'recent'
                        ? 'bg-white text-black shadow-xl'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Recent</span>
                  </button>
                  <button
                    type="button"
                    id="filter-popular-btn"
                    onClick={() => onFilterChange('popular')}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                      discoveryFilter === 'popular'
                        ? 'bg-white text-black shadow-xl'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Popular</span>
                  </button>
                  <button
                    type="button"
                    id="filter-trending-btn"
                    onClick={() => onFilterChange('trending')}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                      discoveryFilter === 'trending'
                        ? 'bg-white text-black shadow-xl'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <Flame className={`w-3.5 h-3.5 ${discoveryFilter === 'trending' ? 'text-[#FF5F40]' : 'text-white/60'}`} />
                    <span>Trending</span>
                  </button>
                </div>
              </div>

              {/* Subtle Vertical Divider */}
              <div className="h-5 w-px bg-white/15 shrink-0" aria-hidden="true" />

              {/* Explore Label */}
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40 select-none shrink-0">
                Explore
              </span>
            </div>

            {/* Category Pills and More ▾ Dropdown */}
            <div className="flex items-center gap-2 select-none flex-nowrap shrink-0">
              {/* All Spots Button */}
              <button
                type="button"
                id="category-all-spots-btn"
                onClick={() => onCategoryChange(null)}
                className={`px-3.5 py-1.5 rounded-full text-xs uppercase tracking-wider whitespace-nowrap transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  canonicalSelected === null
                    ? 'bg-[#FF5F40]/15 border border-[#FF5F40] text-white font-black shadow-[0_0_12px_rgba(255,95,64,0.25)] ring-1 ring-[#FF5F40]/40'
                    : 'bg-white/10 text-white/80 hover:text-white hover:bg-white/20 border border-white/10 font-bold backdrop-blur-md'
                }`}
              >
                <Compass className={`w-3.5 h-3.5 ${canonicalSelected === null ? 'text-[#FF5F40]' : 'text-white/80'}`} />
                <span>All Spots</span>
                {canonicalSelected === null && (
                  <span className="w-3.5 h-3.5 rounded-full bg-[#FF5F40] flex items-center justify-center text-white shrink-0 shadow-sm ml-0.5">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </button>

              {/* Visible Category Badges in Order */}
              {visibleCategories.map((cat) => {
                const isCatActive = Boolean(canonicalSelected && isSameCategory(canonicalSelected, cat));
                return (
                  <CategoryBadge
                    key={cat}
                    category={cat}
                    size="sm"
                    active={isCatActive}
                    onClick={() =>
                      onCategoryChange(isCatActive ? null : cat)
                    }
                  />
                );
              })}

              {/* Compact More ▾ Overflow Menu Pill */}
              {overflowCategories.length > 0 && (
                <div ref={moreDropdownRef} className="relative shrink-0">
                  <button
                    type="button"
                    id="explore-more-btn"
                    onClick={() => setMoreDropdownOpen((prev) => !prev)}
                    className={`px-3.5 py-1.5 rounded-full text-xs uppercase tracking-wider whitespace-nowrap transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                      isOverflowSelected
                        ? 'bg-[#FF5F40]/15 border border-[#FF5F40] text-white font-black shadow-[0_0_12px_rgba(255,95,64,0.25)] ring-1 ring-[#FF5F40]/40'
                        : moreDropdownOpen
                        ? 'bg-white/20 text-white border border-white/30 shadow-md font-bold'
                        : 'bg-white/10 text-white/80 hover:text-white hover:bg-white/20 border border-white/10 font-bold backdrop-blur-md'
                    }`}
                    aria-expanded={moreDropdownOpen}
                    aria-haspopup="true"
                  >
                    {selectedOverflowConfig && (
                      <selectedOverflowConfig.icon className="w-3.5 h-3.5 text-[#FF5F40]" />
                    )}
                    <span>
                      {isOverflowSelected && canonicalSelected
                        ? `More: ${canonicalSelected}`
                        : 'More'}
                    </span>
                    {isOverflowSelected && selectedOverflowConfig && (
                      <span className={`w-2 h-2 rounded-full ${selectedOverflowConfig.bg} shadow-[0_0_8px_currentColor] shrink-0`} />
                    )}
                    {isOverflowSelected && (
                      <span className="w-3.5 h-3.5 rounded-full bg-[#FF5F40] flex items-center justify-center text-white shrink-0 shadow-sm ml-0.5">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        moreDropdownOpen ? 'rotate-180' : ''
                      } ${isOverflowSelected ? 'text-[#FF5F40]' : 'text-white/60'}`}
                    />
                  </button>

                  {/* Dropdown Menu */}
                  {moreDropdownOpen && (
                    <div
                      id="explore-more-dropdown"
                      className="absolute right-0 top-full mt-2 w-64 z-50 bg-[#141414]/98 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-[0_16px_48px_rgba(0,0,0,0.9)] flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150"
                      role="menu"
                      aria-orientation="vertical"
                    >
                      <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 border-b border-white/10 flex items-center justify-between">
                        <span>More Categories</span>
                        <span className="text-[9px] font-bold text-white/30">
                          {overflowCategories.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto subtle-dark-scrollbar py-1 pr-0.5">
                        {overflowCategories.map((cat) => {
                          const isSelected = Boolean(canonicalSelected && isSameCategory(canonicalSelected, cat));
                          const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.Other;
                          const Icon = config.icon;
                          return (
                            <button
                              key={cat}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                onCategoryChange(isSelected ? null : cat);
                                setMoreDropdownOpen(false);
                              }}
                              className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition-all border cursor-pointer active:scale-[0.99] ${
                                isSelected
                                  ? 'bg-[#FF5F40]/15 border-[#FF5F40] text-white shadow-[0_0_15px_rgba(255,95,64,0.15)] ring-1 ring-[#FF5F40]/40'
                                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                    isSelected
                                      ? 'bg-[#FF5F40] text-white shadow-[0_0_10px_rgba(255,95,64,0.4)]'
                                      : 'bg-white/10 text-white/70'
                                  }`}
                                >
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs font-black uppercase tracking-wider text-white truncate">
                                    {cat}
                                  </span>
                                  <span className={`w-2 h-2 rounded-full ${config.bg} shadow-[0_0_8px_currentColor] shrink-0`} />
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-[#FF5F40] flex items-center justify-center text-white shrink-0 shadow-md ml-2">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sort Bottom Sheet (Portal to document.body for true viewport positioning) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {sortSheetOpen && (
              <div
                id="mobile-sort-sheet-portal"
                className="fixed inset-0 z-[9999] md:hidden flex flex-col justify-end"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-sort-sheet-title"
              >
                {/* Dimmed backdrop covering full viewport */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                  onClick={() => setSortSheetOpen(false)}
                  aria-hidden="true"
                />

                {/* Bottom Sheet Modal Panel */}
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                  className="relative z-10 w-full max-w-lg mx-auto bg-[#141414] border-t border-white/20 rounded-t-3xl shadow-[0_-12px_48px_rgba(0,0,0,0.85)] flex flex-col max-h-[70vh] overflow-hidden pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                >
                  {/* Drag handle & Header - Swipe-down dismissal restricted strictly to this header area */}
                  <div
                    onTouchStart={handleTouchStart}
                    onTouchMove={(e) => handleTouchMove(e, () => setSortSheetOpen(false))}
                    onTouchEnd={handleTouchEnd}
                    className="shrink-0 select-none touch-none"
                  >
                    {/* Drag handle */}
                    <div className="pt-3 pb-1 cursor-grab active:cursor-grabbing flex justify-center">
                      <div className="w-12 h-1.5 bg-white/25 hover:bg-white/40 rounded-full transition-colors" />
                    </div>

                    {/* Header */}
                    <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#FF5F40]/20 flex items-center justify-center text-[#FF5F40]">
                          <SlidersHorizontal className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 id="mobile-sort-sheet-title" className="text-sm font-black uppercase tracking-wider text-white">
                            Sort Spots
                          </h3>
                          <p className="text-[11px] text-white/50">Select how pins are ordered on the map</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSortSheetOpen(false)}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-white/60 hover:text-white transition"
                        aria-label="Close sort sheet"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Options List - Independent scrolling region */}
                  <div
                    onTouchStart={(e) => e.stopPropagation()}
                    className="p-4 overflow-y-auto subtle-dark-scrollbar flex-1 flex flex-col gap-2.5 overscroll-contain touch-pan-y"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {[
                      { id: 'recent', label: 'Recent', desc: 'Newest spots dropped by creators', icon: Clock },
                      { id: 'popular', label: 'Popular', desc: 'Highest rated and most saved spots', icon: Sparkles },
                      { id: 'trending', label: 'Trending', desc: 'Viral spots and surging engagement', icon: Flame },
                    ].map((opt) => {
                      const isSelected = discoveryFilter === opt.id;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            onFilterChange(opt.id as DiscoveryFilter);
                            setSortSheetOpen(false);
                          }}
                          className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-left transition-all border cursor-pointer active:scale-[0.99] ${
                            isSelected
                              ? 'bg-[#FF5F40]/15 border-[#FF5F40] text-white shadow-[0_0_15px_rgba(255,95,64,0.15)] ring-1 ring-[#FF5F40]/40'
                              : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-[#FF5F40] text-white shadow-[0_0_12px_rgba(255,95,64,0.4)]'
                                  : 'bg-white/10 text-white/70'
                              }`}
                            >
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-black uppercase tracking-wider text-white">
                                {opt.label}
                              </div>
                              <div className="text-xs text-white/50 mt-0.5 leading-snug">
                                {opt.desc}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="w-6 h-6 rounded-full bg-[#FF5F40] flex items-center justify-center text-white shrink-0 shadow-md ml-2">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Mobile Explore Bottom Sheet (Portal to document.body for true viewport positioning) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {exploreSheetOpen && (
              <div
                id="mobile-explore-sheet-portal"
                className="fixed inset-0 z-[9999] md:hidden flex flex-col justify-end"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-explore-sheet-title"
              >
                {/* Dimmed backdrop covering full viewport */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                  onClick={() => setExploreSheetOpen(false)}
                  aria-hidden="true"
                />

                {/* Bottom Sheet Modal Panel */}
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                  className="relative z-10 w-full max-w-lg mx-auto bg-[#141414] border-t border-white/20 rounded-t-3xl shadow-[0_-12px_48px_rgba(0,0,0,0.85)] flex flex-col max-h-[70vh] overflow-hidden pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                >
                  {/* Drag handle & Header - Swipe-down dismissal restricted strictly to this header area */}
                  <div
                    onTouchStart={handleTouchStart}
                    onTouchMove={(e) => handleTouchMove(e, () => setExploreSheetOpen(false))}
                    onTouchEnd={handleTouchEnd}
                    className="shrink-0 select-none touch-none"
                  >
                    {/* Drag handle */}
                    <div className="pt-3 pb-1 cursor-grab active:cursor-grabbing flex justify-center">
                      <div className="w-12 h-1.5 bg-white/25 hover:bg-white/40 rounded-full transition-colors" />
                    </div>

                    {/* Header */}
                    <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#FF5F40]/20 flex items-center justify-center text-[#FF5F40]">
                          <Compass className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 id="mobile-explore-sheet-title" className="text-sm font-black uppercase tracking-wider text-white">
                            Explore Categories
                          </h3>
                          <p className="text-[11px] text-white/50">Filter pins by vibe and activity</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExploreSheetOpen(false)}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-white/60 hover:text-white transition"
                        aria-label="Close explore sheet"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Options List */}
                  <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div
                      ref={mobileExploreListRef}
                      onScroll={checkMobileExploreScroll}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="p-4 overflow-y-auto subtle-dark-scrollbar flex-1 flex flex-col gap-2.5 overscroll-contain pb-6 touch-pan-y"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      {/* All Spots Option */}
                      <button
                        type="button"
                        onClick={() => {
                          onCategoryChange(null);
                          setExploreSheetOpen(false);
                        }}
                        className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-left transition-all border cursor-pointer active:scale-[0.99] ${
                          canonicalSelected === null
                            ? 'bg-[#FF5F40]/15 border-[#FF5F40] text-white shadow-[0_0_15px_rgba(255,95,64,0.15)] ring-1 ring-[#FF5F40]/40'
                            : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                              canonicalSelected === null
                                ? 'bg-[#FF5F40] text-white shadow-[0_0_12px_rgba(255,95,64,0.4)]'
                                : 'bg-white/10 text-white/70'
                            }`}
                          >
                            <Compass className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-black uppercase tracking-wider text-white">
                              All spots
                            </div>
                            <div className="text-xs text-white/50 mt-0.5 leading-snug">
                              Show all curated spots and locations
                            </div>
                          </div>
                        </div>
                        {canonicalSelected === null && (
                          <div className="w-6 h-6 rounded-full bg-[#FF5F40] flex items-center justify-center text-white shrink-0 shadow-md ml-2">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </button>

                      {/* Categories */}
                      {CATEGORIES.map((cat) => {
                        const isSelected = Boolean(canonicalSelected && isSameCategory(canonicalSelected, cat));
                        const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.Other;
                        const Icon = config.icon;
                        const descMap: Record<string, string> = {
                          'Hidden Gems': 'Secret viewpoints and lesser-known spots',
                          Food: 'Cafes, restaurants, bakeries, and bars',
                          Travel: 'Must-see attractions and historic places',
                          Nature: 'Parks, scenic trails, waterfalls, and beaches',
                          Photography: 'Golden hour views and photogenic corners',
                          Events: 'Local gatherings, pop-ups, and festivals',
                          Activities: 'Outdoor adventures, sports, and experiences',
                        };
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              onCategoryChange(cat);
                              setExploreSheetOpen(false);
                            }}
                            className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-left transition-all border cursor-pointer active:scale-[0.99] ${
                              isSelected
                                ? 'bg-[#FF5F40]/15 border-[#FF5F40] text-white shadow-[0_0_15px_rgba(255,95,64,0.15)] ring-1 ring-[#FF5F40]/40'
                                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? 'bg-[#FF5F40] text-white shadow-[0_0_12px_rgba(255,95,64,0.4)]'
                                    : 'bg-white/10 text-white/70'
                                }`}
                              >
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black uppercase tracking-wider text-white">
                                    {cat}
                                  </span>
                                  <span className={`w-2 h-2 rounded-full ${config.bg} shadow-[0_0_8px_currentColor] shrink-0`} />
                                </div>
                                <div className="text-xs text-white/50 mt-0.5 leading-snug">
                                  {descMap[cat] || `Filter spots curated in ${cat}`}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-6 h-6 rounded-full bg-[#FF5F40] flex items-center justify-center text-white shrink-0 shadow-md ml-2">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Subtle fade at the bottom when more categories are available below */}
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-t from-[#141414] via-[#141414]/80 to-transparent transition-opacity duration-300 z-10 ${
                        mobileExploreHasMoreBelow ? 'opacity-100' : 'opacity-0'
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </header>
  );
};
