import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PublicUserProfile } from '../../types';
import { searchUsers, getSuggestedUsers, checkFollowingStatusBatch } from '../../services/userService';
import { toggleFollow } from '../../services/pinService';
import { UserCardRow } from '../Profile/UserCardRow';
import { CloseButton } from '../Common/CloseButton';
import {
  X,
  Search,
  Users,
  Loader2,
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

  useEffect(() => {
    const query = searchQuery.trim();
    setSearchResults([]);
    if (!isOpen || query.replace(/^@/, '').length < 2) {
      setIsLoadingSearch(false);
      return;
    }

    let cancelled = false;
    setIsLoadingSearch(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchUsers(query, 20);
        if (cancelled) return;
        setSearchResults(results);
        setIsLoadingSearch(false);

        if (currentUserId && results.length > 0) {
          const statusMap = await checkFollowingStatusBatch(currentUserId, results.map(user => user.id));
          if (!cancelled) setFollowingMap(previous => ({ ...previous, ...statusMap }));
        }
      } catch (error) {
        if (!cancelled) console.error('[Heyroq People] Error executing user search:', error);
      } finally {
        if (!cancelled) setIsLoadingSearch(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, searchQuery, currentUserId]);

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
      className="liquid-glass-backdrop fixed inset-0 z-50 flex flex-col justify-start sm:items-center sm:justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      style={viewportHeight ? { height: `${viewportHeight}px`, maxHeight: `${viewportHeight}px` } : undefined}
    >
      <div
        id="discover-people-dialog"
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-modal w-full h-full sm:h-auto max-w-xl lg:max-w-2xl sm:max-h-[88vh] border-0 sm:border rounded-none sm:rounded-3xl flex flex-col overflow-hidden text-slate-900 dark:text-white relative"
        role="dialog"
        aria-modal="true"
        aria-label="Discover Explorers"
      >
        {/* Header */}
        <div className="shrink-0 p-3.5 sm:p-5 border-b border-slate-900/8 dark:border-white/10 flex items-center justify-between pt-[max(0.875rem,env(safe-area-inset-top))] sm:pt-5">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-2xl bg-[var(--brand-primary)]/12 border border-[var(--brand-primary)]/25 flex items-center justify-center text-[var(--brand-primary)] shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
                Discover Explorers
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-white/50 truncate">
                Connect with explorers uncovering genuine spots
              </p>
            </div>
          </div>

          <CloseButton
            onClick={handleModalClose}
            ariaLabel="Close Discover Explorers"
          />
        </div>

        {/* Search Bar Input */}
        <div className="shrink-0 p-3 sm:p-4 border-b border-slate-900/8 dark:border-white/10">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-white/40 absolute left-3.5 top-3.5 sm:top-3 pointer-events-none" />
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
              aria-label="Search people"
              placeholder="First name, last name or @username"
              className="liquid-glass-input w-full text-base sm:text-sm pl-10 pr-9 py-2.5 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-[var(--brand-primary)] transition-colors duration-150 min-h-[44px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-2.5 p-1 text-slate-400 dark:text-white/45 hover:text-slate-900 dark:hover:text-white rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div
          className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 space-y-4 subtle-glass-scrollbar pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-4 overscroll-contain touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {isSearching ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-white/50">
                  Search Results ({searchResults.length})
                </h3>
                {isLoadingSearch && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--brand-primary)]" />
                )}
              </div>

              {searchQuery.trim().replace(/^@/, '').length < 2 ? (
                <div className="py-12 text-center text-slate-500 dark:text-white/45 text-xs flex flex-col items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-slate-900/5 dark:bg-white/5 flex items-center justify-center mb-2.5 text-slate-400 dark:text-white/35">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="font-semibold text-slate-700 dark:text-white/70">Type at least 2 characters</p>
                  <p className="text-[11px] text-slate-500 dark:text-white/45 mt-0.5">
                    Search by first name, last name or @username
                  </p>
                </div>
              ) : isLoadingSearch && searchResults.length === 0 ? (
                <div className="py-16 text-center text-slate-500 dark:text-white/45 text-xs flex flex-col items-center justify-center">
                  <Loader2 className="w-7 h-7 text-[var(--brand-primary)] animate-spin mb-3" />
                  <span>Searching explorers...</span>
                </div>
              ) : !isLoadingSearch && searchResults.length === 0 ? (
                <div className="py-16 text-center text-slate-500 dark:text-white/45 text-xs flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-slate-900/5 dark:bg-white/5 flex items-center justify-center mb-3 text-slate-400 dark:text-white/25">
                    <Search className="w-6 h-6" />
                  </div>
                  <p className="font-semibold text-slate-700 dark:text-white/75">No people found</p>
                  <p className="text-[11px] text-slate-500 dark:text-white/45 mt-1 max-w-xs mx-auto">
                    We couldn&apos;t find anyone matching &ldquo;{searchQuery}&rdquo;. Check the spelling or search by @username.
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
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between px-1 mb-2.5">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-white/50">
                    Active Explorers &amp; Guides
                  </h3>
                  <span className="text-[11px] text-slate-400 dark:text-white/35">Suggested</span>
                </div>

                {isLoadingSuggestions ? (
                  <div className="py-12 text-center text-slate-500 dark:text-white/45 text-xs flex flex-col items-center justify-center">
                    <Loader2 className="w-6 h-6 text-[var(--brand-primary)] animate-spin mb-2" />
                    <span>Discovering explorers...</span>
                  </div>
                ) : suggestedUsers.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 dark:text-white/45 text-xs">
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
