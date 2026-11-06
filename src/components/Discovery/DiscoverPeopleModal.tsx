import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PublicUserProfile } from '../../types';
import { searchUsers, getSuggestedUsers, checkFollowingStatusBatch } from '../../services/userService';
import { toggleFollow } from '../../services/pinService';
import { UserCardRow } from '../Profile/UserCardRow';
import {
  X,
  Search,
  Users,
  Compass,
  Sparkles,
  Loader2,
  TrendingUp,
} from 'lucide-react';

interface DiscoverPeopleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  onOpenProfile: (userId: string) => void;
  onAuthRequired: () => void;
  onFollowToggled?: (targetUserId: string, isNowFollowing: boolean) => void;
}

export const DiscoverPeopleModal: React.FC<DiscoverPeopleModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  onOpenProfile,
  onAuthRequired,
  onFollowToggled,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUserProfile[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<PublicUserProfile[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchRequestIdRef = useRef(0);

  // Load suggestions when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingSuggestions(true);

    async function loadSuggestions() {
      try {
        const list = await getSuggestedUsers(currentUserId, 8);
        if (!isMounted) return;
        setSuggestedUsers(list);

        if (currentUserId && list.length > 0) {
          const ids = list.map((u) => u.id);
          const statusMap = await checkFollowingStatusBatch(currentUserId, ids);
          if (isMounted) {
            setFollowingMap((prev) => ({ ...prev, ...statusMap }));
          }
        }
      } catch (err) {
        console.error('[Heyroq People] Error loading suggestions:', err);
      } finally {
        if (isMounted) setIsLoadingSuggestions(false);
      }
    }

    loadSuggestions();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUserId]);

  // Handle live search with 300ms debounce and stale request race condition protection
  useEffect(() => {
    const q = searchQuery.trim();

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Require at least 2 characters to search
    if (q.length < 2) {
      setIsLoadingSearch(false);
      if (q.length === 0) {
        setSearchResults([]);
      }
      return;
    }

    setIsLoadingSearch(true);

    searchDebounceRef.current = setTimeout(async () => {
      const currentReqId = ++searchRequestIdRef.current;
      try {
        const results = await searchUsers(q, 20);

        // Stale request guard: drop results if a newer search was initiated
        if (currentReqId !== searchRequestIdRef.current) return;

        setSearchResults(results);

        if (currentUserId && results.length > 0) {
          const ids = results.map((u) => u.id);
          const statusMap = await checkFollowingStatusBatch(currentUserId, ids);
          if (currentReqId === searchRequestIdRef.current) {
            setFollowingMap((prev) => ({ ...prev, ...statusMap }));
          }
        }
      } catch (err) {
        if (currentReqId === searchRequestIdRef.current) {
          console.error('[Heyroq People] Error executing user search:', err);
        }
      } finally {
        if (currentReqId === searchRequestIdRef.current) {
          setIsLoadingSearch(false);
        }
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, currentUserId]);

  const handleToggleFollow = async (targetUserId: string) => {
    if (!currentUserId) {
      onAuthRequired();
      return;
    }

    const prev = Boolean(followingMap[targetUserId]);
    const next = !prev;

    setFollowingMap((prevMap) => ({ ...prevMap, [targetUserId]: next }));

    try {
      const actual = await toggleFollow(currentUserId, targetUserId);
      setFollowingMap((prevMap) => ({ ...prevMap, [targetUserId]: actual }));
      if (onFollowToggled) {
        onFollowToggled(targetUserId, actual);
      }
    } catch (err) {
      setFollowingMap((prevMap) => ({ ...prevMap, [targetUserId]: prev }));
      throw err;
    }
  };

  // Dynamic visualViewport tracking for mobile virtual keyboard resilience
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const updateHeight = () => {
      if (typeof window !== 'undefined' && window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      }
    };

    updateHeight();

    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (vv) {
      vv.addEventListener('resize', updateHeight);
      vv.addEventListener('scroll', updateHeight);
    }
    window.addEventListener('resize', updateHeight);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateHeight);
        vv.removeEventListener('scroll', updateHeight);
      }
      window.removeEventListener('resize', updateHeight);
    };
  }, [isOpen]);

  const handleModalClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur?.();
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.dispatchEvent(new Event('resize'));
    }
    onClose();
  }, [onClose]);

  // Ensure scroll position is restored when modal closes or unmounts
  useEffect(() => {
    if (!isOpen && typeof window !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur?.();
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.dispatchEvent(new Event('resize'));
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        (document.activeElement as HTMLElement)?.blur?.();
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.dispatchEvent(new Event('resize'));
      }
    };
  }, []);

  // Keyboard navigation & Escape key dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleModalClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleModalClose]);

  if (!isOpen) return null;

  const isSearching = searchQuery.trim().length > 0;

  const modalContent = (
    <div
      id="discover-people-overlay"
      onClick={handleModalClose}
      className="fixed inset-0 z-50 flex flex-col justify-start sm:items-center sm:justify-center p-0 sm:p-4 bg-black/85 md:backdrop-blur-2xl animate-in fade-in"
      style={viewportHeight ? { height: `${viewportHeight}px`, maxHeight: `${viewportHeight}px` } : undefined}
    >
      <div
        id="discover-people-dialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full sm:h-auto max-w-xl lg:max-w-2xl sm:max-h-[88vh] bg-[#121212] border-0 sm:border border-white/15 rounded-none sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white relative"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="shrink-0 p-3.5 sm:p-5 border-b border-white/10 flex items-center justify-between bg-black/40 pt-[max(0.875rem,env(safe-area-inset-top))] sm:pt-5">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#FF5F40] to-[#FF8C75] flex items-center justify-center text-white shadow-[0_0_15px_rgba(255,95,64,0.3)] shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-white flex items-center gap-2 truncate">
                <span className="truncate">Discover Explorers</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-[#FF5F40] tracking-wider shrink-0 hidden sm:inline-block">
                  Heyroq People
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-white/50 truncate">
                Connect with explorers uncovering secret spots
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleModalClose}
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar Input */}
        <div className="shrink-0 p-3 sm:p-4 border-b border-white/10 bg-black/20">
          <div className="relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3.5 sm:top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (typeof window !== 'undefined') {
                  window.scrollTo(0, 0);
                  document.documentElement.scrollTop = 0;
                  document.body.scrollTop = 0;
                }
              }}
              placeholder="Search by display name or @username..."
              className="w-full text-base sm:text-sm pl-10 pr-9 py-2.5 bg-white/5 border border-white/15 rounded-2xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF5F40] focus:ring-1 focus:ring-[#FF5F40] transition min-h-[42px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div
          className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 space-y-4 subtle-dark-scrollbar pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-4 overscroll-contain touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {isSearching ? (
            /* Search Results View */
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-[#FF5F40]" />
                  <span>Search Results ({searchResults.length})</span>
                </h3>
                {isLoadingSearch && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5F40]" />
                )}
              </div>

              {searchQuery.trim().length < 2 ? (
                <div className="py-12 text-center text-white/40 text-xs flex flex-col items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-2.5 text-white/30">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="font-semibold text-white/60">Type at least 2 characters</p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Search explorers by display name or @username
                  </p>
                </div>
              ) : isLoadingSearch && searchResults.length === 0 ? (
                <div className="py-16 text-center text-white/40 text-xs flex flex-col items-center justify-center">
                  <Loader2 className="w-7 h-7 text-[#FF5F40] animate-spin mb-3" />
                  <span>Searching explorers...</span>
                </div>
              ) : !isLoadingSearch && searchResults.length === 0 ? (
                <div className="py-16 text-center text-white/40 text-xs flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 text-white/20">
                    <Search className="w-6 h-6" />
                  </div>
                  <p className="font-semibold text-white/70">No people found</p>
                  <p className="text-[11px] text-white/40 mt-1 max-w-xs mx-auto">
                    We couldn't find anyone matching "{searchQuery}". Check the spelling or search by @username.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((u) => (
                    <UserCardRow
                      key={u.id}
                      user={u}
                      currentUserId={currentUserId}
                      isFollowing={Boolean(followingMap[u.id])}
                      onToggleFollow={handleToggleFollow}
                      onOpenProfile={(targetId) => {
                        handleModalClose();
                        onOpenProfile(targetId);
                      }}
                      onAuthRequired={onAuthRequired}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Suggestions View (No Query) */
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between px-1 mb-2.5">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF5F40]" />
                    <span>Active Explorers & Guides</span>
                  </h3>
                  <span className="text-[10px] text-white/30 font-mono">Suggested</span>
                </div>

                {isLoadingSuggestions ? (
                  <div className="py-12 text-center text-white/40 text-xs flex flex-col items-center justify-center">
                    <Loader2 className="w-6 h-6 text-[#FF5F40] animate-spin mb-2" />
                    <span>Discovering explorers...</span>
                  </div>
                ) : suggestedUsers.length === 0 ? (
                  <div className="py-8 text-center text-white/40 text-xs">
                    No suggestions available at the moment.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {suggestedUsers.map((u) => (
                      <UserCardRow
                        key={u.id}
                        user={u}
                        currentUserId={currentUserId}
                        isFollowing={Boolean(followingMap[u.id])}
                        onToggleFollow={handleToggleFollow}
                        onOpenProfile={(targetId) => {
                          handleModalClose();
                          onOpenProfile(targetId);
                        }}
                        onAuthRequired={onAuthRequired}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
