import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PublicUserProfile } from '../../types';
import { fetchUserFollowers, fetchUserFollowing, checkFollowingStatusBatch } from '../../services/userService';
import { toggleFollow } from '../../services/pinService';
import { UserCardRow } from './UserCardRow';
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

        // Check follow states for authenticated user
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

    // Optimistic UI update
    setFollowingMap((prev) => ({ ...prev, [targetUserId]: nextFollowing }));

    try {
      const actualFollowing = await toggleFollow(currentUserId, targetUserId);
      setFollowingMap((prev) => ({ ...prev, [targetUserId]: actualFollowing }));
      if (onFollowToggled) {
        onFollowToggled(targetUserId, actualFollowing);
      }
    } catch (err) {
      // Revert on error
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-2xl animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg lg:max-w-xl max-h-[92dvh] sm:max-h-[85vh] bg-[#121212] border border-white/15 rounded-[28px] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white relative"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-white/10 flex items-center justify-between bg-black/30">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-8 h-8 rounded-full bg-[#FF5F40]/15 flex items-center justify-center text-[#FF5F40] shrink-0">
              {activeTab === 'followers' ? (
                <Users className="w-4 h-4" />
              ) : (
                <UserCheck className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black uppercase tracking-tight text-white truncate">
                {userDisplayName || 'Explorer'}
              </h3>
              <p className="text-[11px] text-white/50 truncate">
                {activeTab === 'followers' ? 'Community Followers' : 'Following Explorers'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 bg-black/20 px-4 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('followers')}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all relative cursor-pointer min-h-[44px] flex items-center justify-center ${
              activeTab === 'followers'
                ? 'text-[#FF5F40]'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <span>Followers</span>
            {activeTab === 'followers' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF5F40]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('following')}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all relative cursor-pointer min-h-[44px] flex items-center justify-center ${
              activeTab === 'following'
                ? 'text-[#FF5F40]'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <span>Following</span>
            {activeTab === 'following' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF5F40]" />
            )}
          </button>
        </div>

        {/* Search within list (Sticky) */}
        <div className="p-3 sm:p-3.5 border-b border-white/5 bg-black/10">
          <div className="relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3 sm:top-2.5" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full text-base sm:text-xs pl-9.5 pr-8 py-2 bg-white/5 border border-white/10 rounded-full text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF5F40] focus:ring-1 focus:ring-[#FF5F40] transition min-h-[40px]"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="absolute right-3 top-3 sm:top-2.5 text-white/40 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Users List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2.5 no-scrollbar min-h-[240px] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-white/40 text-xs">
              <Loader2 className="w-7 h-7 text-[#FF5F40] animate-spin mb-3" />
              <span>Loading explorers...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-white/40 text-xs flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 text-white/20">
                <Users className="w-6 h-6" />
              </div>
              {searchFilter ? (
                <>
                  <p className="font-semibold text-white/70">No explorers found</p>
                  <p className="text-[11px] text-white/40 mt-1">
                    No users match "{searchFilter}"
                  </p>
                </>
              ) : activeTab === 'followers' ? (
                <>
                  <p className="font-semibold text-white/70">No followers yet</p>
                  <p className="text-[11px] text-white/40 mt-1">
                    When people follow this profile, they will appear here.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-white/70">Not following anyone yet</p>
                  <p className="text-[11px] text-white/40 mt-1">
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
                    className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 mx-auto transition cursor-pointer"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5F40]" />
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
