import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Pin, LatLngBounds, LatLngPoint, PinCategory, DiscoveryFilter } from './types';
import { normalizeCategory, matchesCategoryFilter } from './utils/categoryUtils';
import { createSpotSearchMatcher, hasSpotSearchQuery } from './utils/spotSearch';
import { Navbar } from './components/Navigation/Navbar';
import { HeyroqMap } from './components/Map/HeyroqMap';
import { PinPreviewCard } from './components/Pin/PinPreviewCard';
import { PinDetailModal } from './components/Pin/PinDetailModal';
import { CreatePinModal, CreatePinDraft } from './components/Pin/CreatePinModal';
import { UserProfileModal } from './components/Profile/UserProfileModal';
import { AccountSecurityModal } from './components/Profile/AccountSecurityModal';
import { AchievementsModal } from './components/Profile/AchievementsModal';
import { AuthModal } from './components/Auth/AuthModal';
import { ReportModal } from './components/Report/ReportModal';
import { DiscoverPeopleModal } from './components/Discovery/DiscoverPeopleModal';
import { AboutHeyroqModal } from './components/Common/AboutHeyroqModal';
import { AboutPage } from './components/Legal/AboutPage';
import { PrivacyPolicyPage } from './components/Legal/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/Legal/TermsOfServicePage';
import { HelpSupportPage } from './components/Legal/HelpSupportPage';
import { PinFeedList } from './components/Pin/PinFeedList';
import { APP_VERSION } from './config/version';
import { OPERATOR_IDENTITY } from './config/brandConfig';
import { AppLink, useAppRoute } from './utils/appRoutes';
import { MapsProvider } from './components/Map/MapsProvider';
import {
  fetchPinsInViewport,
  fetchPinsByDiscovery,
  subscribeToDiscoveryPins,
  searchPins,
  toggleLike,
  checkIfLiked,
  subscribeToPinLike,
  subscribeToPinDocument,
  updateCachedPinCommentCount,
  updateCachedPinLikeCount,
  hydratePinCommentCounts,
} from './services/pinService';
import { sortPins } from './utils/sortUtils';
import { ListFilter, Map as MapIcon, Plus, Compass } from 'lucide-react';

const AdminModal = lazy(() => import('./components/Admin/AdminModal').then(module => ({ default: module.AdminModal })));

type AdminLoadBoundaryProps = React.PropsWithChildren<{ onClose: () => void }>;

class AdminLoadBoundary extends React.Component<AdminLoadBoundaryProps> {
  declare readonly props: AdminLoadBoundaryProps;
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed bottom-4 right-4 z-[100] rounded bg-white p-4 text-slate-900 shadow">
        <p role="alert">Moderation could not load. Refresh the page to try again.</p>
        <button type="button" onClick={this.props.onClose}>Dismiss</button>
      </div>
    );
  }
}

function HeyroqMainApp() {
  const { user, profile, needsProfile } = useAuth();

  // Scroll and layout reset on auth transition to ensure iOS Safari navbar recovery
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur?.();
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.dispatchEvent(new Event('resize'));
    }
    if (!user) {
      setIsProgressionOpen(false);
      setIsAccountSecurityOpen(false);
    }
  }, [user]);

  // State: Pins & Discovery (Single Authoritative Source of Truth)
  const [pins, setPins] = useState<Pin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedPinFallback, setSelectedPinFallback] = useState<Pin | null>(null);
  const [detailPinId, setDetailPinId] = useState<string | null>(null);
  const [detailPinFallback, setDetailPinFallback] = useState<Pin | null>(null);

  // Derive selectedPin and detailPin directly from central pins state so all cards share identical pin data
  const selectedPin = React.useMemo(() => {
    if (!selectedPinId) return null;
    const fromPins = pins.find((p) => p.id === selectedPinId);
    return fromPins || selectedPinFallback;
  }, [pins, selectedPinId, selectedPinFallback]);

  const detailPin = React.useMemo(() => {
    if (!detailPinId) return null;
    const fromPins = pins.find((p) => p.id === detailPinId);
    return fromPins || detailPinFallback;
  }, [pins, detailPinId, detailPinFallback]);

  const handleSelectPin = useCallback((pin: Pin | null) => {
    if (!pin) {
      setSelectedPinId(null);
      setSelectedPinFallback(null);
    } else {
      setSelectedPinId(pin.id);
      setSelectedPinFallback(pin);
      setPins((prev) => {
        const existing = prev.find((p) => p.id === pin.id);
        if (existing) {
          return prev;
        }
        return [pin, ...prev];
      });
    }
  }, []);

  const handleOpenDetails = useCallback((pin: Pin | null) => {
    if (!pin) {
      setDetailPinId(null);
      setDetailPinFallback(null);
      if (typeof window !== 'undefined') {
        (document.activeElement as HTMLElement)?.blur?.();
        window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        window.dispatchEvent(new Event('resize'));
      }
    } else {
      setDetailPinId(pin.id);
      setDetailPinFallback(pin);
      setPins((prev) => {
        const existing = prev.find((p) => p.id === pin.id);
        if (existing) {
          return prev;
        }
        return [pin, ...prev];
      });
    }
  }, []);

  const [discoveryFilter, setDiscoveryFilter] = useState<DiscoveryFilter>('recent');
  const [selectedCategory, setSelectedCategory] = useState<PinCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const isSearchActive = hasSpotSearchQuery(searchQuery);
  const [completedSearch, setCompletedSearch] = useState<{ query: string; ids: Set<string> | null } | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLngPoint>({ lat: 48.8867, lng: 2.3431 }); // Default to Paris discovery hub

  // State: Modals & Panels
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  // Remember only the explicit action that opened authentication; never persist it.
  const authSucceededRef = useRef(false);
  const [pendingAuthAction, setPendingAuthAction] = useState<{ type: 'like'; pinId: string } | { type: 'create' } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPickingLocationOnMap, setIsPickingLocationOnMap] = useState(false);
  const [createPinDraft, setCreatePinDraft] = useState<CreatePinDraft | null>(null);
  const [newPinLocation, setNewPinLocation] = useState<LatLngPoint | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [isAccountSecurityOpen, setIsAccountSecurityOpen] = useState(false);
  const [isProgressionOpen, setIsProgressionOpen] = useState(false);
  const mainContentRef = useRef<HTMLElement>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isDiscoverPeopleOpen, setIsDiscoverPeopleOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    pinId?: string;
    targetType: 'pin' | 'comment' | 'user';
    targetId: string;
  } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

  // Canonical Heyroq Pin marker visibility state (controls map marker rendering independently of Nearby Spots)
  const [showPinMarkers, setShowPinMarkers] = useState(true);

  const handleTogglePinMarkers = useCallback(() => {
    setShowPinMarkers((prev) => {
      const next = !prev;
      // If hiding markers, cleanly dismiss map pin preview card anchored to the marker
      if (!next) {
        handleSelectPin(null);
      }
      return next;
    });
  }, [handleSelectPin]);

  // Responsive desktop breakpoint matching Tailwind CSS `lg` (1024px)
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    const updateMatches = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(e.matches);
    };
    updateMatches(mql);
    const listener = (e: MediaQueryListEvent) => updateMatches(e);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);

  const isPinDetailActive = Boolean(detailPinId || detailPin);

  // REGRESSION GUARD & SINGLE SOURCE OF TRUTH INVARIANT:
  // On mobile/stacked viewports (!isDesktop), Pin Detail and the expanded Nearby Spots
  // drawer are strictly mutually exclusive foreground layers.
  // Nearby Spots expanded UI is architecturally impossible to render when Pin Detail is active or map location is being picked.
  const shouldRenderNearbySpots = isDrawerOpen && (!isPinDetailActive || isDesktop) && !isPickingLocationOnMap;

  function handleSearchChange(query: string) {
    setSearchQuery(query);
    if (hasSpotSearchQuery(query)) {
      setSelectedCategory(null);
      setIsDrawerOpen(true);
    }
  }

  // Preserve Nearby Spots scroll position across mobile unmount/remount transitions
  const feedScrollTopRef = useRef<number>(0);

  // Like status map for rapid preview updates
  const [likedPinIds, setLikedPinIds] = useState<Record<string, boolean>>({});

  // Discovery connection and error recovery state
  const [isDiscoveryError, setIsDiscoveryError] = useState(false);
  const [discoveryRetryCount, setDiscoveryRetryCount] = useState(0);
  const handleRetryDiscovery = useCallback(() => {
    setIsDiscoveryError(false);
    setDiscoveryRetryCount((c) => c + 1);
  }, []);

  // Viewport tracking ref to eliminate redundant queries for unchanged bounds
  const lastBoundsRef = useRef<LatLngBounds | null>(null);

  // Canonical selected category for consistent case/space matching
  const canonicalSelectedCategory = normalizeCategory(selectedCategory);

  // The map and feed use the same spot matching as the search dropdown.
  const displayedPins = useMemo(() => {
    if (isSearchActive) {
      const ids = completedSearch?.query === searchQuery ? completedSearch.ids : null;
      const matches = createSpotSearchMatcher(searchQuery);
      return pins.filter(pin => (!ids || ids.has(pin.id)) && matches(pin));
    }

    const categoryPins = canonicalSelectedCategory
      ? pins.filter(pin => matchesCategoryFilter(pin.category, canonicalSelectedCategory))
      : pins;
    return sortPins(categoryPins, discoveryFilter);
  }, [pins, canonicalSelectedCategory, discoveryFilter, isSearchActive, searchQuery, completedSearch]);

  // Centralized marker rendering boundary: Heyroq markers are hidden purely visually
  // without mutating canonical pins, displayedPins, or viewport caches.
  const visibleMapPins = useMemo(() => {
    return showPinMarkers ? displayedPins : [];
  }, [showPinMarkers, displayedPins]);

  // When active category filter changes, dismiss any active pin preview if its category does not match
  useEffect(() => {
    if (
      canonicalSelectedCategory &&
      selectedPin &&
      !matchesCategoryFilter(selectedPin.category, canonicalSelectedCategory)
    ) {
      setSelectedPinId(null);
      setSelectedPinFallback(null);
    }
  }, [canonicalSelectedCategory]);

  // Handle authoritative comment count synchronization across all surfaces
  const handleCommentCountChanged = useCallback((pinId: string, newCount: number) => {
    // 1. Synchronize central pins state so the initial Nearby Spots card immediately re-renders
    setPins((prev) =>
      prev.map((p) => {
        if (p.id !== pinId) return p;
        return { ...p, commentCount: newCount };
      })
    );
    // 2. Synchronize fallback pin representations if active
    setSelectedPinFallback((prev) =>
      prev && prev.id === pinId ? { ...prev, commentCount: newCount } : prev
    );
    setDetailPinFallback((prev) =>
      prev && prev.id === pinId ? { ...prev, commentCount: newCount } : prev
    );
    // 3. Keep memory cache updated so subsequent queries do not regress
    updateCachedPinCommentCount(pinId, newCount);
  }, []);

  // Handle authoritative like count synchronization across all surfaces (Nearby Spots, Preview, Modal, Map)
  const handleLikeCountChanged = useCallback((pinId: string, newCount: number) => {
    // 1. Synchronize central pins state so Nearby Spots cards & markers immediately update
    setPins((prev) =>
      prev.map((p) => {
        if (p.id !== pinId) return p;
        return { ...p, likeCount: newCount };
      })
    );
    // 2. Synchronize fallback pin representations if active
    setSelectedPinFallback((prev) =>
      prev && prev.id === pinId ? { ...prev, likeCount: newCount } : prev
    );
    setDetailPinFallback((prev) =>
      prev && prev.id === pinId ? { ...prev, likeCount: newCount } : prev
    );
    // 3. Keep memory cache updated so subsequent queries do not regress
    updateCachedPinLikeCount(pinId, newCount);
  }, []);

  // Propagate custom avatar upload/remove immediately to any loaded pins authored by the user
  const handleUserAvatarUpdated = useCallback((updatedUid: string, nextAvatarUrl: string) => {
    setPins((prev) =>
      prev.map((p) => (p.userId === updatedUid ? { ...p, userAvatar: nextAvatarUrl } : p))
    );
    setSelectedPinFallback((prev) =>
      prev && prev.userId === updatedUid ? { ...prev, userAvatar: nextAvatarUrl } : prev
    );
    setDetailPinFallback((prev) =>
      prev && prev.userId === updatedUid ? { ...prev, userAvatar: nextAvatarUrl } : prev
    );
  }, []);

  // Cleanly reset UI state & purge departed user's in-memory pins after confirmed account deletion
  const handleAccountDeletedCleanRedirect = useCallback((deletedUid?: string) => {
    setProfileUserId(null);
    setIsAccountSecurityOpen(false);
    setIsProgressionOpen(false);
    setIsCreateOpen(false);
    setIsAdminOpen(false);
    setIsDiscoverPeopleOpen(false);
    setSelectedPinId(null);
    setSelectedPinFallback(null);
    setDetailPinId(null);
    setDetailPinFallback(null);
    if (deletedUid) {
      setPins((prev) => prev.filter((p) => p.userId !== deletedUid));
    }
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, []);

  // Real-time synchronization of discovery pins (reads pin.commentCount directly from Pin doc without redundant count aggregations)
  useEffect(() => {
    if (isSearchActive) {
      let cancelled = false;
      setCompletedSearch(null);
      searchPins(searchQuery).then(results => {
        if (cancelled) return;
        setPins(previous => {
          const merged = new Map(previous.map(pin => [pin.id, pin]));
          results.forEach(pin => merged.set(pin.id, pin));
          return Array.from(merged.values());
        });
        setCompletedSearch({ query: searchQuery, ids: new Set(results.map(pin => pin.id)) });
      }).catch(error => {
        if (cancelled) return;
        console.warn('Spot search unavailable:', error);
        setCompletedSearch({ query: searchQuery, ids: null });
      });
      return () => { cancelled = true; };
    }


    const canonical = normalizeCategory(selectedCategory);
    // Subscribe to discovery candidates. Sort mode (recent/popular/trending) is decoupled
    // and applied locally in displayedPins with 0 incremental Firestore reads.
    const unsubscribe = subscribeToDiscoveryPins(
      'all',
      selectedCategory,
      (discovered) => {
        setIsDiscoveryError(false);
        setPins((prev) => {
          const map = new Map<string, Pin>();
          // Only retain previous pins that match the current category filter
          prev.forEach((p) => {
            if (!canonical || matchesCategoryFilter(p.category, canonical)) {
              map.set(p.id, p);
            }
          });
          discovered.forEach((d) => {
            if (!canonical || matchesCategoryFilter(d.category, canonical)) {
              const existing = map.get(d.id);
              if (existing) {
                map.set(d.id, {
                  ...existing,
                  ...d,
                  category: normalizeCategory(d.category) || 'Other',
                  commentCount: typeof d.commentCount === 'number' ? d.commentCount : (existing.commentCount ?? 0),
                  likeCount: typeof d.likeCount === 'number' ? d.likeCount : (existing.likeCount ?? 0),
                });
              } else {
                map.set(d.id, {
                  ...d,
                  category: normalizeCategory(d.category) || 'Other',
                });
              }
            }
          });
          return Array.from(map.values());
        });
      },
      (err) => {
        console.warn('Discovery subscription notice:', err);
        setIsDiscoveryError(true);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [selectedCategory, isSearchActive, searchQuery, discoveryRetryCount]);

  // Viewport bounds handler with spatial deduplication and thresholding
  const handleBoundsChange = useCallback(async (bounds: LatLngBounds) => {
    const canonical = normalizeCategory(selectedCategory);
    // Only query by geohash viewport if no keyword search or category filter is active
    if (!isSearchActive && !canonical) {
      // Meaningful movement threshold check: skip micro-pans and container resizes (only if pins are already loaded)
      const prev = lastBoundsRef.current;
      if (prev && pins.length > 0) {
        const latSpan = Math.abs(bounds.north - bounds.south);
        const lngSpan = Math.abs(bounds.east - bounds.west);
        const latDiff = Math.abs((bounds.north + bounds.south) / 2 - (prev.north + prev.south) / 2);
        const lngDiff = Math.abs((bounds.east + bounds.west) / 2 - (prev.east + prev.west) / 2);
        const spanDiffLat = Math.abs(latSpan - Math.abs(prev.north - prev.south));
        const spanDiffLng = Math.abs(lngSpan - Math.abs(prev.east - prev.west));
        if (
          latDiff < latSpan * 0.1 &&
          lngDiff < lngSpan * 0.1 &&
          spanDiffLat < latSpan * 0.15 &&
          spanDiffLng < lngSpan * 0.15
        ) {
          // Viewport hasn't meaningfully changed; reuse in-memory pins
          return;
        }
      }

      lastBoundsRef.current = bounds;

      try {
        const viewportPins = await fetchPinsInViewport(bounds);
        if (viewportPins.length > 0) {
          // Merge viewport pins with existing state, strictly preserving authoritative commentCount & likeCount
          setPins((prevPins) => {
            const map = new Map<string, Pin>();
            prevPins.forEach((p) => map.set(p.id, p));
            viewportPins.forEach((vp) => {
              const existing = map.get(vp.id);
              if (existing) {
                map.set(vp.id, {
                  ...existing,
                  ...vp,
                  category: normalizeCategory(vp.category) || 'Other',
                  commentCount: typeof vp.commentCount === 'number' ? vp.commentCount : (existing.commentCount ?? 0),
                  likeCount: typeof vp.likeCount === 'number' ? vp.likeCount : (existing.likeCount ?? 0),
                });
              } else {
                map.set(vp.id, {
                  ...vp,
                  category: normalizeCategory(vp.category) || 'Other',
                });
              }
            });
            return Array.from(map.values());
          });
        }
      } catch (e) {
        console.warn('Viewport fetch notice:', e);
      }
    }
  }, [isSearchActive, selectedCategory]);

  // Real-time authoritative sync for selectedPin (only active when PinDetailModal is not open)
  const activeFocusPinId = detailPinId || selectedPinId;

  useEffect(() => {
    // If detailPinId is open, PinDetailModal manages its own listener directly
    if (activeFocusPinId && user?.uid && !detailPinId) {
      const unsubscribe = subscribeToPinLike(activeFocusPinId, user.uid, (liked) => {
        setLikedPinIds((prev) => ({ ...prev, [activeFocusPinId]: liked }));
      });
      return () => {
        unsubscribe();
      };
    }
  }, [activeFocusPinId, user?.uid, detailPinId]);

  // Real-time authoritative sync for pin document (only active when PinDetailModal is not open)
  useEffect(() => {
    // If detailPinId is open, PinDetailModal manages its own listener directly
    if (activeFocusPinId && !detailPinId) {
      const unsubscribe = subscribeToPinDocument(activeFocusPinId, ({ commentCount, likeCount }) => {
        setPins((prev) =>
          prev.map((p) => {
            if (p.id !== activeFocusPinId) return p;
            const updated = { ...p };
            if (typeof commentCount === 'number') updated.commentCount = commentCount;
            if (typeof likeCount === 'number') updated.likeCount = likeCount;
            return updated;
          })
        );
        if (typeof likeCount === 'number') {
          setSelectedPinFallback((prev) =>
            prev && prev.id === activeFocusPinId ? { ...prev, likeCount } : prev
          );
          setDetailPinFallback((prev) =>
            prev && prev.id === activeFocusPinId ? { ...prev, likeCount } : prev
          );
        }
        if (typeof commentCount === 'number') {
          setSelectedPinFallback((prev) =>
            prev && prev.id === activeFocusPinId ? { ...prev, commentCount } : prev
          );
          setDetailPinFallback((prev) =>
            prev && prev.id === activeFocusPinId ? { ...prev, commentCount } : prev
          );
          updateCachedPinCommentCount(activeFocusPinId, commentCount);
        }
      });
      return () => {
        unsubscribe();
      };
    }
  }, [activeFocusPinId, detailPinId]);

  const handleToggleLikePin = async (pinId: string) => {
    if (!user) {
      setPendingAuthAction({ type: 'like', pinId });
      setAuthMode('signin');
      setIsAuthOpen(true);
      return;
    }
    const wasLiked = !!likedPinIds[pinId];
    const newLiked = !wasLiked;
    const currentPin = pins.find((p) => p.id === pinId);
    const currentCount = currentPin?.likeCount || 0;
    const newCount = newLiked ? currentCount + 1 : Math.max(0, currentCount - 1);

    setLikedPinIds((prev) => ({ ...prev, [pinId]: newLiked }));
    handleLikeCountChanged(pinId, newCount);

    try {
      const confirmed = await toggleLike(pinId, user.uid);
      setLikedPinIds((prev) => ({ ...prev, [pinId]: confirmed }));
    } catch (err) {
      console.error('[Heyroq Like] Toggle like error:', err);
      // Revert on error
      setLikedPinIds((prev) => ({ ...prev, [pinId]: wasLiked }));
      handleLikeCountChanged(pinId, currentCount);
    }
  };

  // Resume a guest's explicit action once after successful authentication.
  // A create request opens the editor, never publishes automatically.
  useEffect(() => {
    if (!user || !pendingAuthAction) return;
    const action = pendingAuthAction;
    setPendingAuthAction(null);
    if (action.type === 'create') {
      setIsCreateOpen(true);
    } else {
      void handleToggleLikePin(action.pinId);
    }
  }, [user, pendingAuthAction]);

  // Map pin picked during creation flow
  const handleSelectCreateLocation = useCallback((loc: LatLngPoint) => {
    setNewPinLocation(loc);
    setMapCenter(loc);
    setCreatePinDraft((prev) =>
      prev
        ? {
            ...prev,
            customLat: loc.lat,
            customLng: loc.lng,
          }
        : null
    );
    if (isPickingLocationOnMap) {
      setIsPickingLocationOnMap(false);
    }
  }, [isPickingLocationOnMap]);

  const handleFlyToPin = (pin: Pin) => {
    setMapCenter({ lat: pin.latitude, lng: pin.longitude });
    handleSelectPin(pin);
  };

  // Keyboard navigation & Escape key dismiss for map selection & pin creation pick
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPickingLocationOnMap) {
          setIsPickingLocationOnMap(false);
        } else if (selectedPinId) {
          setSelectedPinId(null);
          setSelectedPinFallback(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPickingLocationOnMap, selectedPinId]);

  return (
    <div id="heyroq-app-root" className="h-screen h-[100dvh] w-full flex flex-col bg-[var(--heyroq-bg-canvas)] text-[var(--heyroq-text-primary)] font-sans selection:bg-[var(--brand-primary)] selection:text-white overflow-hidden">
      {/* Top Navigation */}
      <Navbar
        discoveryFilter={discoveryFilter}
        onFilterChange={setDiscoveryFilter}
        selectedCategory={selectedCategory}
        onCategoryChange={(category) => {
          setSelectedCategory(category);
          setSearchQuery('');
        }}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onOpenCreatePin={() => {
          if (!user) {
            setPendingAuthAction({ type: 'create' });
            setAuthMode('signin');
            setIsAuthOpen(true);
          } else {
            setIsCreateOpen(true);
          }
        }}
        onOpenAuth={(mode) => {
          setPendingAuthAction(null);
          setAuthMode(mode || 'signin');
          setIsAuthOpen(true);
        }}
        onOpenProfile={(uid) => {
          if (uid) setProfileUserId(uid);
        }}
        onOpenAccountSecurity={() => {
          if (user) {
            setIsAccountSecurityOpen(true);
          }
        }}
        onOpenProgression={() => {
          if (user) {
            setProfileUserId(null);
            setIsProgressionOpen(true);
          }
        }}
        onOpenAbout={() => setIsAboutOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenDiscoverPeople={() => setIsDiscoverPeopleOpen(true)}
        onSelectSpot={(pin) => {
          handleSelectPin(pin);
          setMapCenter({ lat: pin.latitude, lng: pin.longitude });
        }}
        onSelectPerson={(uid) => {
          if (uid) setProfileUserId(uid);
        }}
        onSelectCity={(cityName, lat, lng) => {
          setMapCenter({ lat, lng });
          handleSearchChange(cityName);
        }}
        onSelectTag={(tag) => handleSearchChange('#' + tag)}
      />

      {/* Main Map & Discovery Feed Workspace */}
      <main ref={mainContentRef} tabIndex={-1} className="flex-1 min-h-0 w-full flex flex-col lg:flex-row relative overflow-hidden bg-[var(--heyroq-bg-canvas)]">
        {/* The Interactive Social Map */}
        <div className="flex-1 relative w-full h-full min-h-0 overflow-hidden">
          <HeyroqMap
            pins={visibleMapPins}
            selectedPin={selectedPin}
            isDesktop={isDesktop}
            onSelectPin={(pin) => {
              if (pin) {
                handleSelectPin(pin);
                if (!isDesktop) {
                  handleOpenDetails(pin);
                }
              } else {
                handleSelectPin(null);
              }
            }}
            onOpenDetails={(pin) => {
              handleSelectPin(pin);
              handleOpenDetails(pin);
            }}
            onBoundsChange={handleBoundsChange}
            isCreating={isPickingLocationOnMap}
            createLocation={newPinLocation}
            onSelectCreateLocation={handleSelectCreateLocation}
            center={mapCenter}
            onToggleDrawer={() => setIsDrawerOpen(!isDrawerOpen)}
            isDrawerOpen={isDrawerOpen}
            displayedPinsCount={displayedPins.length}
            showPinMarkers={showPinMarkers}
            onTogglePinMarkers={handleTogglePinMarkers}
            onCancelCreateLocation={() => {
              setIsPickingLocationOnMap(false);
            }}
            onDropPin={() => {
              if (!user) {
                setPendingAuthAction({ type: 'create' });
                setAuthMode('signin');
                setIsAuthOpen(true);
              } else {
                setIsCreateOpen(true);
              }
            }}
          />

          {/* Floating Pin Preview Card on Map - Desktop only (bypassed on mobile below 768px, and dismissed when markers hidden) */}
          {selectedPin && !isPinDetailActive && isDesktop && showPinMarkers && (
            <div className="hidden md:block absolute top-3 inset-x-3 sm:inset-x-auto sm:top-6 sm:left-6 z-30 flex justify-center sm:block pointer-events-auto">
              <PinPreviewCard
                pin={selectedPin}
                onClose={() => handleSelectPin(null)}
                onOpenDetails={(pin) => {
                  handleSelectPin(null);
                  handleOpenDetails(pin);
                }}
                onOpenProfile={(uid) => {
                  if (uid) setProfileUserId(uid);
                }}
                isLiked={!!likedPinIds[selectedPin.id]}
                onToggleLike={handleToggleLikePin}
              />
            </div>
          )}
        </div>

        {/* Discovery Feed Side Drawer */}
        <PinFeedList
          pins={displayedPins}
          selectedPin={selectedPin}
          onSelectPin={(pin) => {
            handleSelectPin(pin);
            setMapCenter({ lat: pin.latitude, lng: pin.longitude });
          }}
          onOpenDetails={(pin) => handleOpenDetails(pin)}
          onFlyToPin={handleFlyToPin}
          isOpen={shouldRenderNearbySpots}
          onToggle={() => setIsDrawerOpen(!isDrawerOpen)}
          initialScrollTop={feedScrollTopRef.current}
          onScroll={(top) => {
            feedScrollTopRef.current = top;
          }}
          isDesktop={isDesktop}
          isLive={!isDiscoveryError && !isSearchActive}
          searchQuery={isSearchActive ? searchQuery.trim() : undefined}
          isSearching={isSearchActive && completedSearch?.query !== searchQuery}
          isError={
            displayedPins.length === 0 &&
            (isSearchActive ? completedSearch?.query === searchQuery && completedSearch.ids === null : isDiscoveryError)
          }
          onRetry={handleRetryDiscovery}
        />
      </main>

      {/* Discovery Coordinates, Legal Navigation & Rainbyte Studio Attribution Footer */}
      <footer className="h-9 bg-[var(--heyroq-bg-surface)] border-t border-[var(--heyroq-border-subtle)] px-3.5 sm:px-5 lg:px-6 flex items-center justify-between gap-3 z-40 text-xs font-medium text-[var(--heyroq-text-muted)] shrink-0">
        <div className="hidden md:flex items-center gap-3 font-sans tabular-nums text-[11px] text-[var(--heyroq-text-muted)] shrink-0">
          <span>
            {Math.abs(mapCenter.lat).toFixed(4)}° {mapCenter.lat >= 0 ? 'N' : 'S'},{' '}
            {Math.abs(mapCenter.lng).toFixed(4)}° {mapCenter.lng >= 0 ? 'E' : 'W'}
          </span>
        </div>

        <nav
          aria-label="Footer legal and support navigation"
          className="flex items-center gap-2.5 sm:gap-3.5 text-xs font-medium text-[var(--heyroq-text-secondary)] overflow-x-auto no-scrollbar"
        >
          <AppLink to="/about" className="hover:text-[var(--heyroq-text-primary)] transition-colors whitespace-nowrap">
            About
          </AppLink>
          <span aria-hidden="true" className="text-[var(--heyroq-text-muted)] opacity-40">·</span>
          <AppLink to="/privacy" className="hover:text-[var(--heyroq-text-primary)] transition-colors whitespace-nowrap">
            Privacy
          </AppLink>
          <span aria-hidden="true" className="text-[var(--heyroq-text-muted)] opacity-40">·</span>
          <AppLink to="/terms" className="hover:text-[var(--heyroq-text-primary)] transition-colors whitespace-nowrap">
            Terms
          </AppLink>
          <span aria-hidden="true" className="text-[var(--heyroq-text-muted)] opacity-40">·</span>
          <AppLink to="/support" className="hover:text-[var(--heyroq-text-primary)] transition-colors whitespace-nowrap">
            Support
          </AppLink>
          <span aria-hidden="true" className="hidden lg:inline text-[var(--heyroq-text-muted)] opacity-40">·</span>
          <a
            href={OPERATOR_IDENTITY.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:inline text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] transition-colors whitespace-nowrap"
          >
            by {OPERATOR_IDENTITY.name}
          </a>
        </nav>

        <button
          id="footer-about-version-btn"
          type="button"
          onClick={() => setIsAboutOpen(true)}
          aria-label={`About ${APP_VERSION.productName} ${APP_VERSION.displayVersion}`}
          className="inline-flex items-center gap-1.5 text-[11px] text-[var(--heyroq-text-muted)] hover:text-[var(--heyroq-text-primary)] transition-colors cursor-pointer font-sans tabular-nums heyroq-focus-ring rounded px-1.5 py-0.5 shrink-0"
        >
          <span className="hidden sm:inline">{APP_VERSION.productName}</span>
          <span aria-hidden="true" className="hidden sm:inline opacity-45">·</span>
          <span>{APP_VERSION.displayVersion}</span>
          <span aria-hidden="true" className="hidden sm:inline opacity-45">·</span>
          <span className="hidden sm:inline">{APP_VERSION.releaseChannel}</span>
        </button>
      </footer>

      {/* MODALS */}

      {/* 1. Full Pin Details Modal */}
      {detailPin && (
        <PinDetailModal
          key={detailPin.id}
          pin={detailPin}
          initialIsLiked={likedPinIds[detailPin.id]}
          onClose={() => handleOpenDetails(null)}
          onOpenProfile={(uid) => {
            handleOpenDetails(null);
            if (uid) setProfileUserId(uid);
          }}
          onOpenReport={(pinId, targetType, targetId) => {
            setReportTarget({ pinId, targetType, targetId });
          }}
          onPinDeleted={(deletedId) => {
            setPins((prev) => prev.filter((p) => p.id !== deletedId));
            setSelectedPinFallback((prev) => (prev?.id === deletedId ? null : prev));
            setDetailPinFallback((prev) => (prev?.id === deletedId ? null : prev));
            if (selectedPinId === deletedId) handleSelectPin(null);
            if (detailPinId === deletedId) handleOpenDetails(null);
          }}
          onLikeToggled={(pinId, isLiked, newCount) => {
            setLikedPinIds((prev) => ({ ...prev, [pinId]: isLiked }));
            handleLikeCountChanged(pinId, newCount);
          }}
          onLikeCountChanged={handleLikeCountChanged}
          onCommentCountChanged={handleCommentCountChanged}
          onAuthRequired={() => {
            setAuthMode('signin');
            setIsAuthOpen(true);
          }}
        />
      )}

      {/* 2. Create Location Pin Modal */}
      {isCreateOpen && (
        <CreatePinModal
          isPickingLocation={isPickingLocationOnMap}
          initialDraft={createPinDraft}
          onClose={() => {
            setIsPickingLocationOnMap(false);
            setIsCreateOpen(false);
            setCreatePinDraft(null);
            setNewPinLocation(null);
          }}
          selectedLocation={newPinLocation}
          onActivateMapPick={(draft) => {
            if (draft) {
              setCreatePinDraft(draft);
            }
            setIsPickingLocationOnMap(true);
          }}
          onLocationSelect={(loc) => {
            setNewPinLocation(loc);
            setMapCenter(loc);
          }}
          onPinCreated={async () => {
            setIsPickingLocationOnMap(false);
            setIsCreateOpen(false);
            setCreatePinDraft(null);
            setNewPinLocation(null);
            if (isSearchActive) {
              setDiscoveryRetryCount(count => count + 1);
              return;
            }
            const freshPins = await fetchPinsByDiscovery('all', selectedCategory);
            setPins(freshPins);
          }}
        />
      )}

      {/* 3. User Profile Modal */}
      {profileUserId && (
        <UserProfileModal
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onSelectPin={(pin) => {
            handleSelectPin(pin);
            setMapCenter({ lat: pin.latitude, lng: pin.longitude });
          }}
          onAuthRequired={() => {
            setAuthMode('signin');
            setIsAuthOpen(true);
          }}
          onOpenCreatePin={() => setIsCreateOpen(true)}
          onOpenOtherProfile={(uid) => {
            setProfileUserId(uid);
          }}
          onOpenAbout={() => setIsAboutOpen(true)}
          onAvatarUpdated={handleUserAvatarUpdated}
          onAccountDeleted={() => handleAccountDeletedCleanRedirect(profileUserId)}
        />
      )}

      {/* 3b. Standalone Account & Security Modal (opened from Navbar menu) */}
      {isAccountSecurityOpen && user && (
        <AccountSecurityModal
          isOpen={isAccountSecurityOpen}
          onClose={() => setIsAccountSecurityOpen(false)}
          onAccountDeleted={() => handleAccountDeletedCleanRedirect(user.uid)}
        />
      )}

      {/* 4. Admin Moderation Modal */}
      {isAdminOpen && (
        <AdminLoadBoundary onClose={() => setIsAdminOpen(false)}>
          <Suspense fallback={<p role="status" className="fixed bottom-4 right-4 z-[100] rounded bg-white p-4 text-slate-900 shadow">Loading moderation…</p>}>
            <AdminModal
              onClose={() => setIsAdminOpen(false)}
              onSelectPin={(pin) => {
                handleSelectPin(pin);
                setMapCenter({ lat: pin.latitude, lng: pin.longitude });
              }}
            />
          </Suspense>
        </AdminLoadBoundary>
      )}

      {/* 5. Report Inappropriate Content Modal */}
      {reportTarget && (
        <ReportModal
          pinId={reportTarget.pinId}
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          onClose={() => setReportTarget(null)}
        />
      )}

      {/* 6. Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen || needsProfile}
        onAuthenticated={() => { authSucceededRef.current = true; }}
        onClose={() => {
          setIsAuthOpen(false);
          if (!authSucceededRef.current) setPendingAuthAction(null);
          authSucceededRef.current = false;
        }}
        initialMode={authMode}
      />

      {/* 7. People Discovery Modal */}
      <DiscoverPeopleModal
        isOpen={isDiscoverPeopleOpen}
        onClose={() => setIsDiscoverPeopleOpen(false)}
        currentUserId={user?.uid}
        onOpenProfile={(uid) => {
          setProfileUserId(uid);
        }}
        onAuthRequired={() => {
          setAuthMode('signin');
          setIsAuthOpen(true);
        }}
      />

      {/* 8. Explorer Progression & Badges Modal */}
      {isProgressionOpen && user && (
        <AchievementsModal
          userId={user.uid}
          displayName={profile?.displayName}
          fallbackFocusRef={mainContentRef}
          onClose={() => setIsProgressionOpen(false)}
        />
      )}

      {/* 9. About Heyroq Modal */}
      <AboutHeyroqModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
}

function AppRouterSwitch() {
  const activeRoute = useAppRoute();

  switch (activeRoute) {
    case '/about':
      return <AboutPage />;
    case '/privacy':
      return <PrivacyPolicyPage />;
    case '/terms':
      return <TermsOfServicePage />;
    case '/support':
      return <HelpSupportPage />;
    case '/':
    default:
      return <HeyroqMainApp />;
  }
}

export default function App() {
  return (
    <MapsProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppRouterSwitch />
        </AuthProvider>
      </ThemeProvider>
    </MapsProvider>
  );
}
