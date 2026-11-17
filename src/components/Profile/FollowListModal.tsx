import React, { useState, useEffect, useMemo } from 'react';
import { PublicUserProfile } from '../../types';
import { fetchUserFollowers, fetchUserFollowing, checkFollowingStatusBatch } from '../../services/userService';
import { toggleFollow } from '../../services/pinService';
import { UserCardRow } from './UserCardRow';
import { CloseButton } from '../Common/CloseButton';
import { X, Search, Users, UserCheck, Loader2, ArrowRight } from 'lucide-react';
import { DocumentSnapshot } from 'firebase/firestore';

interface FollowListModalProps {
  userId: string;
  userDisplayName?: string;
  initialTab?: 'followers' | 'following';
  currentUserId?: string;
  onClose: () => void;
  onOpenProfile: (targetUserId: string) => void;
  onAuthRequired?: () => void;
  onFollowToggled?: (targetUserId: string, isNowFollowing: boolean) => void;
}

export const FollowListModal: React.FC<FollowListModalProps> = ({
  userId,
  userDisplayName,
  initialTab = 'followers',
  currentUserId,
  onClose,
  onOpenProfile,
  onAuthRequired,
  onFollowToggled,
}) => {
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
  const [users, setUsers] = useState<PublicUserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  // Fetch initial list when target userId or activeTab changes
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setSearchFilter('');
    setUsers([]);
    setLastDoc(null);
    setHasMore(false);

    async function loadInitial() {
      try {
        const res =
          activeTab === 'followers'
            ? await fetchUserFollowers(userId, 25, null)
            : await fetchUserFollowing(userId, 25, null);

        if (!isMounted) return;

        setUsers(res.users);
        setLastDoc(res.lastDoc);
        setHasMore(res.hasMore);

        if (currentUserId && res.users.length > 0) {
          const userIds = res.users.map((u) => u.id);
          const statusMap = await checkFollowingStatusBatch(currentUserId, userIds);
          if (isMounted) {
            setFollowingMap((prev) => ({ ...prev, ...statusMap }));
          }
        }
      } catch (err) {
        console.error('[Heyroq Follow] Error loading follow list:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadInitial();

    return () => {
      isMounted = false;
    };
  }, [userId, activeTab, currentUserId]);

  // Load more pagination handler
  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);

    try {
      const res =
        activeTab === 'followers'
          ? await fetchUserFollowers(userId, 25, lastDoc)
          : await fetchUserFollowing(userId, 25, lastDoc);

      setUsers((prev) => {
        const existingIds = new Set(prev.map((u) => u.id));
        const filteredNew = res.users.filter((u) => !existingIds.has(u.id));
        return [...prev, ...filteredNew];
      });
      setLastDoc(res.lastDoc);
      setHasMore(res.hasMore);

      if (currentUserId && res.users.length > 0) {
        const userIds = res.users.map((u) => u.id);
        const statusMap = await checkFollowingStatusBatch(currentUserId, userIds);
        setFollowingMap((prev) => ({ ...prev, ...statusMap }));
      }
    } catch (err) {
      console.error('[Heyroq Follow] Error loading more users:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Toggle follow directly from list
  const handleToggleFollow = async (targetUserId: string) => {
    if (!currentUserId) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    const prevFollowing = Boolean(followingMap[targetUserId]);
    const nextFollowing = !prevFollowing;

    setFollowingMap((prev) => ({ ...prev, [targetUserId]: nextFollowing }));

    try {
      const actualFollowing = await toggleFollow(currentUserId, targetUserId);
      setFollowingMap((prev) => ({ ...prev, [targetUserId]: actualFollowing }));
      if (onFollowToggled) {
        onFollowToggled(targetUserId, actualFollowing);
      }
    } catch (err) {
      setFollowingMap((prev) => ({ ...prev, [targetUserId]: prevFollowing }));
      throw err;
    }
  };

  // Filter list by username or display name
  const filteredUsers = useMemo(() => {
    const q = searchFilter.trim().toLowerCase().replace(/^@/, '');
    if (!q) return users;
    return users.filter((u) => {
      const uLower = (u.usernameLower || u.username).toLowerCase();
      const dLower = (u.displayNameLower || u.displayName).toLowerCase();
      return uLower.includes(q) || dLower.includes(q);
    });
  }, [users, searchFilter]);

  // Keyboard navigation & Escape key dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="liquid-glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-modal w-full max-w-lg lg:max-w-xl max-h-[92dvh] sm:max-h-[85vh] rounded-[28px] sm:rounded-3xl flex flex-col overflow-hidden text-slate-900 dark:text-white relative"
        role="dialog"
        aria-modal="true"
        aria-label={activeTab === 'followers' ? 'Followers' : 'Following'}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-slate-900/8 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-2xl bg-[var(--brand-primary)]/12 border border-[var(--brand-primary)]/25 flex items-center justify-center text-[var(--brand-primary)] shrink-0">
              {activeTab === 'followers' ? (
                <Users className="w-4 h-4" />
              ) : (
                <UserCheck className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-heading text-base font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {userDisplayName || 'Explorer'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-white/50 truncate">
                {activeTab === 'followers' ? 'Community Followers' : 'Following Explorers'}
              </p>
            </div>
          </div>

          <CloseButton
            onClick={onClose}
            ariaLabel="Close Followers & Following"
          />
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-900/8 dark:border-white/10 px-4 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('followers')}
            className={`flex-1 py-3 text-xs font-semibold transition-colors duration-150 relative cursor-pointer min-h-[44px] flex items-center justify-center heyroq-focus-ring ${
              activeTab === 'followers'
                ? 'text-[var(--heyroq-accent-text)]'
                : 'text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white/85'
            }`}
          >
            <span>Followers</span>
            {activeTab === 'followers' && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-[var(--brand-primary)]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('following')}
            className={`flex-1 py-3 text-xs font-semibold transition-colors duration-150 relative cursor-pointer min-h-[44px] flex items-center justify-center heyroq-focus-ring ${
              activeTab === 'following'
                ? 'text-[var(--heyroq-accent-text)]'
                : 'text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white/85'
            }`}
          >
            <span>Following</span>
            {activeTab === 'following' && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-[var(--brand-primary)]" />
            )}
          </button>
        </div>

        {/* Search within list */}
        <div className="p-3 sm:p-3.5 border-b border-slate-900/6 dark:border-white/8">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-white/40 absolute left-3.5 top-3 sm:top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="liquid-glass-input w-full text-base sm:text-xs pl-9.5 pr-8 py-2 rounded-full text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-[var(--brand-primary)] transition-colors duration-150 min-h-[40px]"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-2 text-slate-400 dark:text-white/45 hover:text-slate-900 dark:hover:text-white p-1 rounded-full cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Users List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2.5 subtle-glass-scrollbar min-h-[240px] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500 dark:text-white/45 text-xs">
              <Loader2 className="w-7 h-7 text-[var(--brand-primary)] animate-spin mb-3" />
              <span>Loading explorers...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-slate-500 dark:text-white/45 text-xs flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-slate-900/5 dark:bg-white/5 flex items-center justify-center mb-3 text-slate-400 dark:text-white/25">
                <Users className="w-6 h-6" />
              </div>
              {searchFilter ? (
                <>
                  <p className="font-semibold text-slate-700 dark:text-white/75">No explorers found</p>
                  <p className="text-[11px] text-slate-500 dark:text-white/45 mt-1">
                    No users match &ldquo;{searchFilter}&rdquo;
                  </p>
                </>
              ) : activeTab === 'followers' ? (
                <>
                  <p className="font-semibold text-slate-700 dark:text-white/75">No followers yet</p>
                  <p className="text-[11px] text-slate-500 dark:text-white/45 mt-1">
                    When people follow this profile, they will appear here.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-slate-700 dark:text-white/75">Not following anyone yet</p>
                  <p className="text-[11px] text-slate-500 dark:text-white/45 mt-1">
                    Explorers followed by this profile will appear here.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {filteredUsers.map((u) => (
                <UserCardRow
                  key={u.id}
                  user={u}
                  currentUserId={currentUserId}
                  isFollowing={Boolean(followingMap[u.id])}
                  onToggleFollow={handleToggleFollow}
                  onOpenProfile={(targetId) => {
                    onClose();
                    onOpenProfile(targetId);
                  }}
                  onAuthRequired={onAuthRequired}
                />
              ))}

              {/* Load More Button for Pagination */}
              {hasMore && !searchFilter && (
                <div className="pt-3 pb-1 text-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="liquid-glass-pill px-5 py-2 min-h-[40px] rounded-full text-slate-800 dark:text-white text-xs font-semibold flex items-center gap-2 mx-auto transition-colors duration-150 cursor-pointer whitespace-nowrap heyroq-focus-ring"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--brand-primary)]" />
                        <span>Loading more...</span>
                      </>
                    ) : (
                      <>
                        <span>Load More</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
