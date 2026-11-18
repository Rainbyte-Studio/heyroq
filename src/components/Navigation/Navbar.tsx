import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { PinCategory, DiscoveryFilter, Pin, UserProgressionSummary } from '../../types';
import { normalizeCategory, isSameCategory } from '../../utils/categoryUtils';
import { CategoryBadge, CATEGORY_CONFIG } from '../Map/CategoryBadge';
import { GlobalSearchDropdown } from './GlobalSearchDropdown';
import { executeGlobalSearch, CategorizedSearchResults } from '../../services/searchService';
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
  Info,
  HelpCircle,
} from 'lucide-react';
import { subscribeToUserProgression } from '../../services/gamificationService';
import { APP_VERSION } from '../../config/version';
import { AppLink } from '../../utils/appRoutes';
import { ThemePopoverButton, ThemeSelector } from '../Common/ThemeSelector';
import { Wordmark } from '../Common/Wordmark';
import { UserAvatar } from '../Common/UserAvatar';
import { CloseButton } from '../Common/CloseButton';

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
  onOpenAccountSecurity?: () => void;
  onOpenProgression?: () => void;
  onOpenAbout?: () => void;
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
  onOpenAccountSecurity,
  onOpenProgression,
  onOpenAbout,
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
  function closeMobileSearch() {
    setMobileSearchOpen(false);
    setIsSearchFocused(false);
    mobileSearchToggleRef.current?.focus();
  }
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
  const mobileSearchToggleRef = useRef<HTMLButtonElement>(null);
  const mobileSearchPanelRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Global Search Debounce & Stale Request Guard
  useEffect(() => {
    const q = searchQuery.trim();
    const seq = ++globalSearchSeqRef.current;
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
        !searchContainerRef.current.contains(e.target as Node) &&
        !mobileSearchPanelRef.current?.contains(e.target as Node)
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
    const primary: PinCategory[] = [
      'Hidden Gems',
      'Food',
      'Travel',
      'Nature',
      'Photography',
      'Events',
    ];
    const trailing: PinCategory[] = ['Activities'];

    const categoryWidths: Record<PinCategory, number> = {
      'Hidden Gems': 134,
      Food: 86,
      Travel: 94,
      Nature: 96,
      Photography: 132,
      Events: 96,
      Activities: 112,
      Other: 90,
    };

    const allSpotsWidth = 112;
    const gap = 8;
    const safetyBuffer = 12;
    const moreBaseWidth = 84;
    const moreActiveWidth = 168;

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

  const canonicalSelected = normalizeCategory(selectedCategory);

  const selectedOverflowConfig =
    isOverflowSelected && canonicalSelected
      ? CATEGORY_CONFIG[canonicalSelected] || CATEGORY_CONFIG.Other
      : null;

  return (
    <header className="liquid-glass-nav shrink-0 w-full sticky top-0 z-40 text-[var(--heyroq-text-primary)] pt-[env(safe-area-inset-top)]">
      {/* Top Main Navigation Bar */}
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 lg:px-6 h-[58px] sm:h-16 flex items-center justify-between gap-2.5 sm:gap-4">
        {/* Brand */}
        <div className="flex items-center shrink-0">
          <div
            id="nav-logo-btn"
            onClick={() => {
              onFilterChange('recent');
              onCategoryChange(null);
              onSearchChange('');
            }}
            className="cursor-pointer select-none group heyroq-focus-ring rounded-lg py-0.5"
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
            <Wordmark
              as="h1"
              size="nav"
              className="group-hover:opacity-90 transition-opacity"
            />
          </div>
        </div>

        {/* Global Search Bar (Desktop / Tablet) */}
        <div ref={searchContainerRef} className="hidden md:block flex-1 max-w-md lg:max-w-[460px] mx-3 relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[var(--heyroq-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
              aria-label="Search Heyroq"
              aria-controls={isSearchFocused && searchQuery.trim() ? "desktop-search-results" : undefined}
              placeholder="Search spots, coffee, tags, cities..."
              className="liquid-glass-input w-full h-10 text-[13px] pl-10 pr-24 rounded-full text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 transition-colors"
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                    setIsSearchFocused(false);
                  }}
                  className="p-1 text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] cursor-pointer rounded-full"
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
                  className="h-7 px-2.5 rounded-full bg-slate-900/[0.05] dark:bg-white/[0.09] hover:bg-slate-900/[0.10] dark:hover:bg-white/[0.16] text-xs font-medium text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] flex items-center gap-1.5 transition cursor-pointer border border-[var(--heyroq-border-subtle)]"
                >
                  <Users className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                  <span className="hidden sm:inline">People</span>
                </button>
              )}
            </div>
          </div>

          {/* Categorized Global Search Dropdown (Desktop) */}
          <GlobalSearchDropdown
            id="desktop-search-results"
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

        {/* Right Actions (Search, Appearance, Create Pin, Auth / Profile) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile Search Toggle */}
          <button
            type="button"
            id="mobile-search-toggle-btn"
            ref={mobileSearchToggleRef}
            aria-expanded={mobileSearchOpen}
            aria-controls={mobileSearchOpen ? "mobile-search-panel" : undefined}
            onClick={() => {
              if (mobileSearchOpen) {
                closeMobileSearch();
              } else {
                setMobileSearchOpen(true);
                setIsSearchFocused(true);
              }
            }}
            aria-label="Toggle search"
            className={`md:hidden rounded-full border transition cursor-pointer w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center heyroq-focus-ring ${
              mobileSearchOpen || searchQuery
                ? 'bg-[var(--brand-cta-bg)] text-white border-[var(--brand-primary)]'
                : 'liquid-glass-pill text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)]'
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
              className="md:hidden rounded-full liquid-glass-pill text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer heyroq-focus-ring"
              aria-label="Discover people"
            >
              <Users className="w-4 h-4 text-[var(--brand-primary)]" />
            </button>
          )}

          {/* Direct Appearance Control when Unauthenticated (no sign-in required) */}
          {!user && <ThemePopoverButton id="nav-appearance-btn" />}

          {/* Create Pin Button (Desktop & Tablet primary action; paired with thumb-zone FAB on mobile < md) */}
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
            className="hidden md:inline-flex heyroq-btn-primary h-10 px-4 rounded-full text-xs font-semibold items-center justify-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap heyroq-focus-ring"
            aria-label="Drop pin"
          >
            <Plus className="w-4 h-4 stroke-[2.25]" />
            <span>Drop Pin</span>
          </button>

          {/* User Profile or Sign In */}
          {user ? (
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                id="user-profile-menu-btn"
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                aria-expanded={userDropdownOpen}
                aria-haspopup="menu"
                className="liquid-glass-pill flex items-center gap-1.5 p-1 rounded-full hover:border-[var(--heyroq-border-strong)] transition cursor-pointer h-10 min-h-[40px] min-w-[40px] heyroq-focus-ring"
                aria-label="User menu"
              >
                <UserAvatar
                  uid={user.uid}
                  displayName={profile?.displayName}
                  imageUrl={profile?.avatarUrl || profile?.photoURL}
                  size="sm"
                />
                <ChevronDown className="w-3.5 h-3.5 text-[var(--heyroq-text-muted)] mr-1 hidden sm:block" />
              </button>

              {/* Authenticated Liquid Glass Dropdown Menu */}
              {userDropdownOpen && (
                <div
                  role="menu"
                  className="liquid-glass-popover absolute right-0 mt-2 w-64 max-w-[calc(100vw-24px)] rounded-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 text-[var(--heyroq-text-primary)]"
                >
                  <div className="px-4 py-3 border-b border-[var(--heyroq-border-subtle)] flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        uid={user.uid}
                        displayName={profile?.displayName}
                        imageUrl={profile?.avatarUrl || profile?.photoURL}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold tracking-tight text-[var(--heyroq-text-primary)] truncate">
                          {profile?.displayName || 'Explorer'}
                        </p>
                        <p className="text-[11px] font-semibold text-[var(--heyroq-accent-text)] truncate">
                          @{profile?.username || user.email?.split('@')[0]}
                        </p>
                      </div>
                    </div>
                    {userProgression && (
                      <span className="shrink-0 px-2 py-0.5 rounded-md bg-[var(--brand-primary)]/12 border border-[var(--brand-primary)]/30 text-[var(--heyroq-accent-text)] text-[11px] font-semibold tabular-nums tracking-tight">
                        Level {userProgression.level}
                      </span>
                    )}
                  </div>

                  {/* Integrated Light / Dark / System Appearance Selector */}
                  <div className="px-3.5 py-2.5 border-b border-[var(--heyroq-border-subtle)]">
                    <div className="flex items-center justify-between mb-1.5 px-0.5">
                      <span className="text-[11px] font-semibold text-[var(--heyroq-text-muted)]">
                        Appearance
                      </span>
                    </div>
                    <ThemeSelector compact idPrefix="menu-theme" />
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenProfile(user.uid);
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.05] dark:hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <User className="w-4 h-4 text-[var(--heyroq-text-muted)]" />
                    <span>My Profile &amp; Spots</span>
                  </button>

                  {onOpenAccountSecurity && (
                    <button
                      id="menu-account-security-btn"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onOpenAccountSecurity();
                        setUserDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.05] dark:hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <Shield className="w-4 h-4 text-[var(--brand-primary)]" />
                      <span>Account &amp; Security</span>
                    </button>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (onOpenProgression) {
                        onOpenProgression();
                      }
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.05] dark:hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <Trophy className="w-4 h-4 text-[var(--brand-primary)]" />
                    <span>Progression & Badges</span>
                  </button>

                  {onOpenDiscoverPeople && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onOpenDiscoverPeople();
                        setUserDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.05] dark:hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-[var(--brand-primary)]" />
                      <span>Find People</span>
                    </button>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenCreatePin();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.05] dark:hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-[var(--brand-primary)]" />
                    <span>Drop New Pin</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onOpenAdmin();
                        setUserDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-slate-900/[0.05] dark:hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Moderation Panel</span>
                    </button>
                  )}

                  {onOpenAbout && (
                    <button
                      id="menu-about-heyroq-btn"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onOpenAbout();
                        setUserDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.05] dark:hover:bg-white/10 flex items-center justify-between gap-2.5 transition cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <Info className="w-4 h-4 text-[var(--heyroq-text-muted)]" />
                        <span>About Heyroq</span>
                      </span>
                      <span className="text-[11px] font-sans font-medium text-[var(--heyroq-text-muted)] tabular-nums">
                        {APP_VERSION.displayVersion}
                      </span>
                    </button>
                  )}

                  <AppLink
                    id="menu-help-support-link"
                    to="/support"
                    onBeforeNavigate={() => setUserDropdownOpen(false)}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] hover:bg-slate-900/[0.05] dark:hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4 text-[var(--heyroq-text-muted)]" />
                    <span>Help & Support</span>
                  </AppLink>

                  <div className="border-t border-[var(--heyroq-border-subtle)] my-1.5" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      signOut();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-[var(--heyroq-accent-text)] hover:bg-slate-900/[0.05] dark:hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                id="nav-signin-btn"
                type="button"
                onClick={() => onOpenAuth('signin')}
                className="h-10 min-h-[40px] px-3 text-xs font-semibold text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)] transition cursor-pointer whitespace-nowrap flex items-center rounded-full heyroq-focus-ring"
              >
                Sign In
              </button>
              <button
                id="nav-signup-btn"
                type="button"
                onClick={() => onOpenAuth('signup')}
                className="hidden min-[400px]:flex h-10 min-h-[40px] px-4 bg-[#202124] dark:bg-[#F5F4F1] text-[#FAF9F6] dark:text-[#17181B] hover:opacity-90 rounded-full text-xs font-semibold shadow-sm transition cursor-pointer whitespace-nowrap shrink-0 items-center heyroq-focus-ring"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Expandable Search Bar (shown when toggled or active) */}
      {mobileSearchOpen && (
        <div
          id="mobile-search-panel"
          ref={mobileSearchPanelRef}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeMobileSearch();
            }
          }}
          className="md:hidden px-3 pb-3 pt-2 border-t border-[var(--heyroq-border-subtle)] bg-[var(--heyroq-bg-surface)]/95 relative animate-in fade-in slide-in-from-top-1">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[var(--heyroq-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              aria-label="Search Heyroq"
              aria-controls={isSearchFocused && searchQuery.trim() ? "mobile-search-results" : undefined}
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setIsSearchFocused(true);
              }}
              onFocus={() => setIsSearchFocused(true)}
              placeholder="Search spots, coffee, tags, cities..."
              className="liquid-glass-input w-full text-base pl-9.5 pr-18 py-2 rounded-full text-[var(--heyroq-text-primary)] placeholder:text-[var(--heyroq-text-muted)] focus:outline-none focus:border-[var(--brand-primary)]"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                  }}
                  className="p-1.5 text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={closeMobileSearch}
                className="p-1.5 text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] cursor-pointer"
                aria-label="Close search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Global Search Dropdown */}
          <GlobalSearchDropdown
            id="mobile-search-results"
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
      <div className="liquid-glass-subbar py-2">
        {/* Mobile Control Row (compact, two clear buttons with >= 40px touch targets) */}
        <div className="flex md:hidden items-center gap-2 w-full px-3">
          {/* Mobile Sort Button */}
          <button
            type="button"
            id="mobile-sort-btn"
            onClick={() => setSortSheetOpen(true)}
            className={`flex-1 min-w-0 min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between gap-1.5 transition cursor-pointer border heyroq-focus-ring ${
              discoveryFilter !== 'recent'
                ? 'bg-[var(--brand-primary)]/12 border-[var(--brand-primary)]/50 text-[var(--heyroq-text-primary)] shadow-sm'
                : 'bg-slate-900/[0.035] dark:bg-white/[0.05] border-[var(--heyroq-border-subtle)] text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <SlidersHorizontal
                className={`w-3.5 h-3.5 shrink-0 ${
                  discoveryFilter !== 'recent' ? 'text-[var(--brand-primary)]' : 'text-[var(--heyroq-text-muted)]'
                }`}
              />
              <span className="truncate text-left">
                <span className="text-[var(--heyroq-text-muted)]">Sort: </span>
                <span className="capitalize font-semibold text-[var(--heyroq-text-primary)]">
                  {discoveryFilter}
                </span>
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--heyroq-text-muted)] shrink-0" />
          </button>

          {/* Mobile Explore Button */}
          <button
            type="button"
            id="mobile-explore-btn"
            onClick={() => setExploreSheetOpen(true)}
            className={`flex-1 min-w-0 min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between gap-1.5 transition cursor-pointer border heyroq-focus-ring ${
              canonicalSelected !== null
                ? 'bg-[var(--brand-primary)]/12 border-[var(--brand-primary)]/50 text-[var(--heyroq-text-primary)] shadow-sm'
                : 'bg-slate-900/[0.035] dark:bg-white/[0.05] border-[var(--heyroq-border-subtle)] text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <Compass
                className={`w-3.5 h-3.5 shrink-0 ${
                  canonicalSelected !== null ? 'text-[var(--brand-primary)]' : 'text-[var(--heyroq-text-muted)]'
                }`}
              />
              <span className="truncate text-left">
                <span className="text-[var(--heyroq-text-muted)]">Explore: </span>
                <span className="font-semibold text-[var(--heyroq-text-primary)]">
                  {canonicalSelected || 'All Spots'}
                </span>
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--heyroq-text-muted)] shrink-0" />
          </button>
        </div>

        {/* Desktop/Tablet Layout: Entire filter-controls group precisely centered within the viewport */}
        <div ref={desktopBarRef} className="hidden md:block w-full px-4 lg:px-6">
          <div
            id="desktop-filter-controls-group"
            className="w-fit mx-auto flex items-center gap-3 lg:gap-4 flex-nowrap max-w-full"
          >
            {/* Prefix Group: Sort group, divider, and Explore label */}
            <div
              ref={prefixGroupRef}
              className="flex items-center gap-3 lg:gap-3.5 shrink-0 flex-nowrap"
            >
              {/* Sorting Group: Label + Recent, Popular, Trending */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-medium text-[var(--heyroq-text-muted)] select-none shrink-0">
                  Sort
                </span>
                <div className="liquid-glass-segmented h-8 flex items-center gap-0.5 p-0.5 rounded-full shrink-0">
                  <button
                    type="button"
                    id="filter-recent-btn"
                    onClick={() => onFilterChange('recent')}
                    className={`h-7 px-3 rounded-full text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap heyroq-focus-ring ${
                      discoveryFilter === 'recent'
                        ? 'bg-[#FFFFFF] dark:bg-[#222327] text-[#202124] dark:text-[#F5F4F1] font-semibold shadow-sm border border-[#E6E3DE] dark:border-[#38393E]'
                        : 'font-medium text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)]'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Recent</span>
                  </button>
                  <button
                    type="button"
                    id="filter-popular-btn"
                    onClick={() => onFilterChange('popular')}
                    className={`h-7 px-3 rounded-full text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap heyroq-focus-ring ${
                      discoveryFilter === 'popular'
                        ? 'bg-[#FFFFFF] dark:bg-[#222327] text-[#202124] dark:text-[#F5F4F1] font-semibold shadow-sm border border-[#E6E3DE] dark:border-[#38393E]'
                        : 'font-medium text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)]'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Popular</span>
                  </button>
                  <button
                    type="button"
                    id="filter-trending-btn"
                    onClick={() => onFilterChange('trending')}
                    className={`h-7 px-3 rounded-full text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap heyroq-focus-ring ${
                      discoveryFilter === 'trending'
                        ? 'bg-[#FFFFFF] dark:bg-[#222327] text-[#202124] dark:text-[#F5F4F1] font-semibold shadow-sm border border-[#E6E3DE] dark:border-[#38393E]'
                        : 'font-medium text-[var(--heyroq-text-secondary)] hover:text-[var(--heyroq-text-primary)]'
                    }`}
                  >
                    <Flame
                      strokeWidth={1.75}
                      className={`w-3.5 h-3.5 ${
                        discoveryFilter === 'trending'
                          ? 'text-[var(--brand-primary)]'
                          : 'text-[var(--heyroq-text-muted)]'
                      }`}
                    />
                    <span>Trending</span>
                  </button>
                </div>
              </div>

              {/* Subtle Vertical Divider */}
              <div className="h-4 w-px bg-[var(--heyroq-border-strong)] shrink-0" aria-hidden="true" />

              {/* Explore Label */}
              <span className="text-xs font-medium text-[var(--heyroq-text-muted)] select-none shrink-0">
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
                className={`h-8 px-3 rounded-full text-xs whitespace-nowrap transition-colors duration-150 cursor-pointer shrink-0 flex items-center gap-1.5 heyroq-focus-ring ${
                  canonicalSelected === null
                    ? 'bg-[var(--brand-primary)]/12 dark:bg-[var(--brand-primary)]/18 border border-[var(--brand-primary)] text-[#202124] dark:text-[#F5F4F1] font-semibold shadow-[0_1px_4px_rgba(232,121,36,0.14)]'
                    : 'bg-[#F3F1ED] dark:bg-[#2B2C31] text-[#4D4E52] dark:text-[#B0B0B5] hover:text-[#202124] dark:hover:text-[#F5F4F1] hover:bg-[#ECE9E3] dark:hover:bg-[#33343A] border border-[#E6E3DE] dark:border-[#38393E] font-medium'
                }`}
              >
                <Compass
                  strokeWidth={1.75}
                  className={`w-3.5 h-3.5 ${
                    canonicalSelected === null
                      ? 'text-[var(--brand-primary)]'
                      : 'text-[#5C5D61] dark:text-[#B0B0B5]'
                  }`}
                />
                <span>All Spots</span>
                {canonicalSelected === null && (
                  <Check className="w-3 h-3 text-[var(--brand-primary)] shrink-0" strokeWidth={2.5} />
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
                    showDot={false}
                    active={isCatActive}
                    onClick={() => onCategoryChange(isCatActive ? null : cat)}
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
                    className={`h-8 px-3 rounded-full text-xs whitespace-nowrap transition-colors duration-150 cursor-pointer shrink-0 flex items-center gap-1.5 heyroq-focus-ring ${
                      isOverflowSelected
                        ? 'bg-[var(--brand-primary)]/12 dark:bg-[var(--brand-primary)]/18 border border-[var(--brand-primary)] text-[#202124] dark:text-[#F5F4F1] font-semibold shadow-[0_1px_4px_rgba(232,121,36,0.14)]'
                        : moreDropdownOpen
                          ? 'bg-[#ECE9E3] dark:bg-[#33343A] text-[var(--heyroq-text-primary)] border border-[var(--heyroq-border-strong)] font-semibold'
                          : 'bg-[#F3F1ED] dark:bg-[#2B2C31] text-[#4D4E52] dark:text-[#B0B0B5] hover:text-[#202124] dark:hover:text-[#F5F4F1] hover:bg-[#ECE9E3] dark:hover:bg-[#33343A] border border-[#E6E3DE] dark:border-[#38393E] font-medium'
                    }`}
                    aria-expanded={moreDropdownOpen}
                    aria-haspopup="true"
                  >
                    {selectedOverflowConfig && (
                      <selectedOverflowConfig.icon className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                    )}
                    <span>
                      {isOverflowSelected && canonicalSelected
                        ? `More: ${canonicalSelected}`
                        : 'More'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        moreDropdownOpen ? 'rotate-180' : ''
                      } ${isOverflowSelected ? 'text-[var(--brand-primary)]' : 'text-[var(--heyroq-text-muted)]'}`}
                    />
                  </button>

                  {/* More Categories Dropdown */}
                  {moreDropdownOpen && (
                    <div
                      id="explore-more-dropdown"
                      className="liquid-glass-popover absolute right-0 top-full mt-2 w-64 z-50 rounded-2xl p-2 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150"
                      role="menu"
                      aria-orientation="vertical"
                    >
                      <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--heyroq-text-muted)] border-b border-[var(--heyroq-border-subtle)] flex items-center justify-between">
                        <span>More Categories</span>
                        <span className="text-[10px] font-semibold tabular-nums opacity-75">
                          {overflowCategories.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto subtle-glass-scrollbar py-1 pr-0.5">
                        {overflowCategories.map((cat) => {
                          const isSelected = Boolean(
                            canonicalSelected && isSameCategory(canonicalSelected, cat)
                          );
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
                                  ? 'bg-[var(--brand-primary)]/14 border-[var(--brand-primary)] text-[var(--heyroq-text-primary)] ring-1 ring-[var(--brand-primary)]/35'
                                  : 'bg-slate-900/[0.03] dark:bg-white/5 border-[var(--heyroq-border-subtle)] text-[var(--heyroq-text-secondary)] hover:bg-slate-900/[0.07] dark:hover:bg-white/10 hover:text-[var(--heyroq-text-primary)]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                    isSelected
                                      ? 'bg-[var(--brand-cta-bg)] text-white'
                                      : 'bg-slate-900/[0.06] dark:bg-white/10 text-[var(--heyroq-text-secondary)]'
                                  }`}
                                >
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs font-semibold text-[var(--heyroq-text-primary)] truncate">
                                    {cat}
                                  </span>
                                  <span
                                    className={`w-2 h-2 rounded-full ${config.bg} shrink-0`}
                                  />
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-[var(--brand-cta-bg)] flex items-center justify-center text-white shrink-0 shadow-sm ml-2">
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

      {/* Mobile Sort Bottom Sheet */}
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
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="liquid-glass-backdrop fixed inset-0"
                  onClick={() => setSortSheetOpen(false)}
                  aria-hidden="true"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                  className="liquid-glass-sheet relative z-10 w-full max-w-lg mx-auto rounded-t-3xl flex flex-col max-h-[70vh] overflow-hidden pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[var(--heyroq-text-primary)]"
                >
                  <div
                    onTouchStart={handleTouchStart}
                    onTouchMove={(e) => handleTouchMove(e, () => setSortSheetOpen(false))}
                    onTouchEnd={handleTouchEnd}
                    className="shrink-0 select-none touch-none"
                  >
                    <div className="pt-3 pb-1 cursor-grab active:cursor-grabbing flex justify-center">
                      <div className="w-12 h-1.5 bg-slate-900/20 dark:bg-white/25 rounded-full" />
                    </div>

                    <div className="px-5 py-3 border-b border-[var(--heyroq-border-subtle)] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[var(--brand-primary)]/15 flex items-center justify-center text-[var(--brand-primary)]">
                          <SlidersHorizontal className="w-4 h-4" />
                        </div>
                        <div>
                          <h3
                            id="mobile-sort-sheet-title"
                            className="font-heading text-sm font-semibold text-[var(--heyroq-text-primary)]"
                          >
                            Sort Spots
                          </h3>
                          <p className="text-[11px] text-[var(--heyroq-text-muted)]">
                            Select how pins are ordered on the map
                          </p>
                        </div>
                      </div>
                      <CloseButton
                        onClick={() => setSortSheetOpen(false)}
                        ariaLabel="Close Sort Options"
                      />
                    </div>
                  </div>

                  <div
                    onTouchStart={(e) => e.stopPropagation()}
                    className="p-4 overflow-y-auto subtle-glass-scrollbar flex-1 flex flex-col gap-2.5 overscroll-contain touch-pan-y"
                  >
                    {[
                      {
                        id: 'recent',
                        label: 'Recent',
                        desc: 'Newest spots dropped by creators',
                        icon: Clock,
                      },
                      {
                        id: 'popular',
                        label: 'Popular',
                        desc: 'Highest rated and most saved spots',
                        icon: Sparkles,
                      },
                      {
                        id: 'trending',
                        label: 'Trending',
                        desc: 'Viral spots and surging engagement',
                        icon: Flame,
                      },
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
                              ? 'bg-[var(--brand-primary)]/14 border-[var(--brand-primary)] text-[var(--heyroq-text-primary)] ring-1 ring-[var(--brand-primary)]/35'
                              : 'bg-slate-900/[0.03] dark:bg-white/5 border-[var(--heyroq-border-subtle)] text-[var(--heyroq-text-secondary)] hover:bg-slate-900/[0.06] dark:hover:bg-white/10 hover:text-[var(--heyroq-text-primary)]'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-[var(--brand-cta-bg)] text-white'
                                  : 'bg-slate-900/[0.06] dark:bg-white/10 text-[var(--heyroq-text-secondary)]'
                              }`}
                            >
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-[var(--heyroq-text-primary)]">
                                {opt.label}
                              </div>
                              <div className="text-xs text-[var(--heyroq-text-muted)] mt-0.5 leading-snug">
                                {opt.desc}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="w-6 h-6 rounded-full bg-[var(--brand-cta-bg)] flex items-center justify-center text-white shrink-0 shadow-sm ml-2">
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

      {/* Mobile Explore Bottom Sheet */}
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
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="liquid-glass-backdrop fixed inset-0"
                  onClick={() => setExploreSheetOpen(false)}
                  aria-hidden="true"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                  className="liquid-glass-sheet relative z-10 w-full max-w-lg mx-auto rounded-t-3xl flex flex-col max-h-[70vh] overflow-hidden pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[var(--heyroq-text-primary)]"
                >
                  <div
                    onTouchStart={handleTouchStart}
                    onTouchMove={(e) => handleTouchMove(e, () => setExploreSheetOpen(false))}
                    onTouchEnd={handleTouchEnd}
                    className="shrink-0 select-none touch-none"
                  >
                    <div className="pt-3 pb-1 cursor-grab active:cursor-grabbing flex justify-center">
                      <div className="w-12 h-1.5 bg-slate-900/20 dark:bg-white/25 rounded-full" />
                    </div>

                    <div className="px-5 py-3 border-b border-[var(--heyroq-border-subtle)] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[var(--brand-primary)]/15 flex items-center justify-center text-[var(--brand-primary)]">
                          <Compass className="w-4 h-4" />
                        </div>
                        <div>
                          <h3
                            id="mobile-explore-sheet-title"
                            className="font-heading text-sm font-semibold text-[var(--heyroq-text-primary)]"
                          >
                            Explore Categories
                          </h3>
                          <p className="text-[11px] text-[var(--heyroq-text-muted)]">
                            Filter pins by vibe and activity
                          </p>
                        </div>
                      </div>
                      <CloseButton
                        onClick={() => setExploreSheetOpen(false)}
                        ariaLabel="Close Explore Categories"
                      />
                    </div>
                  </div>

                  <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div
                      ref={mobileExploreListRef}
                      onScroll={checkMobileExploreScroll}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="p-4 overflow-y-auto subtle-glass-scrollbar flex-1 flex flex-col gap-2.5 overscroll-contain pb-6 touch-pan-y"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onCategoryChange(null);
                          setExploreSheetOpen(false);
                        }}
                        className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-left transition-all border cursor-pointer active:scale-[0.99] ${
                          canonicalSelected === null
                            ? 'bg-[var(--brand-primary)]/14 border-[var(--brand-primary)] text-[var(--heyroq-text-primary)] ring-1 ring-[var(--brand-primary)]/35'
                            : 'bg-slate-900/[0.03] dark:bg-white/5 border-[var(--heyroq-border-subtle)] text-[var(--heyroq-text-secondary)] hover:bg-slate-900/[0.06] dark:hover:bg-white/10 hover:text-[var(--heyroq-text-primary)]'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                              canonicalSelected === null
                                ? 'bg-[var(--brand-cta-bg)] text-white'
                                : 'bg-slate-900/[0.06] dark:bg-white/10 text-[var(--heyroq-text-secondary)]'
                            }`}
                          >
                            <Compass className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[var(--heyroq-text-primary)]">
                              All spots
                            </div>
                            <div className="text-xs text-[var(--heyroq-text-muted)] mt-0.5 leading-snug">
                              Show all curated spots and locations
                            </div>
                          </div>
                        </div>
                        {canonicalSelected === null && (
                          <div className="w-6 h-6 rounded-full bg-[var(--brand-cta-bg)] flex items-center justify-center text-white shrink-0 shadow-sm ml-2">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </button>

                      {CATEGORIES.map((cat) => {
                        const isSelected = Boolean(
                          canonicalSelected && isSameCategory(canonicalSelected, cat)
                        );
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
                                ? 'bg-[var(--brand-primary)]/14 border-[var(--brand-primary)] text-[var(--heyroq-text-primary)] ring-1 ring-[var(--brand-primary)]/35'
                                : 'bg-slate-900/[0.03] dark:bg-white/5 border-[var(--heyroq-border-subtle)] text-[var(--heyroq-text-secondary)] hover:bg-slate-900/[0.06] dark:hover:bg-white/10 hover:text-[var(--heyroq-text-primary)]'
                            }`}
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? 'bg-[var(--brand-cta-bg)] text-white'
                                    : 'bg-slate-900/[0.06] dark:bg-white/10 text-[var(--heyroq-text-secondary)]'
                                }`}
                              >
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-[var(--heyroq-text-primary)]">
                                    {cat}
                                  </span>
                                  <span
                                    className={`w-2 h-2 rounded-full ${config.bg} shrink-0`}
                                  />
                                </div>
                                <div className="text-xs text-[var(--heyroq-text-muted)] mt-0.5 leading-snug">
                                  {descMap[cat] || `Filter spots curated in ${cat}`}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-6 h-6 rounded-full bg-[var(--brand-cta-bg)] flex items-center justify-center text-white shrink-0 shadow-sm ml-2">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div
                      className={`absolute bottom-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-t from-[var(--heyroq-bg-surface)] to-transparent transition-opacity duration-300 z-10 ${
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
