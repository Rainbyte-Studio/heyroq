import React, { useState } from 'react';
import { PublicUserProfile } from '../../types';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { UserAvatar } from '../Common/UserAvatar';

interface UserCardRowProps {
  user: PublicUserProfile;
  currentUserId?: string;
  isFollowing: boolean;
  onToggleFollow?: (targetUserId: string) => Promise<void>;
  onOpenProfile: (userId: string) => void;
  onAuthRequired?: () => void;
  compact?: boolean;
}

export const UserCardRow: React.FC<UserCardRowProps> = ({
  user,
  currentUserId,
  isFollowing,
  onToggleFollow,
  onOpenProfile,
  onAuthRequired,
  compact = false,
}) => {
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);

  const isMe = Boolean(currentUserId && (currentUserId === user.id || currentUserId === user.uid));
  const avatarUrl = user.avatarUrl || user.photoURL;

  const handleFollowClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) {
      if (onAuthRequired) onAuthRequired();
      return;
    }
    if (isMe || !onToggleFollow || isLoadingFollow) return;

    setIsLoadingFollow(true);
    try {
      await onToggleFollow(user.id);
    } catch (err) {
      console.error('[Heyroq Follow] Error toggling follow from card:', err);
    } finally {
      setIsLoadingFollow(false);
    }
  };

  return (
    <div
      onClick={() => onOpenProfile(user.id)}
      className="liquid-glass-card group flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-2xl hover:border-[var(--brand-primary)]/45 transition-colors duration-150 cursor-pointer text-slate-900 dark:text-white heyroq-focus-ring"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenProfile(user.id);
        }
      }}
    >
      {/* Left: Avatar + Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Avatar */}
        <UserAvatar
          uid={user.uid || user.id}
          displayName={user.displayName}
          imageUrl={avatarUrl}
          size="md"
          className="w-11 h-11 sm:w-12 sm:h-12"
          ringClassName="ring-1 ring-inset ring-slate-900/10 dark:ring-white/15 group-hover:ring-[var(--brand-primary)]/60 transition"
        />

        {/* Text Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <h4 className="font-heading text-sm font-bold text-slate-900 dark:text-white group-hover:text-[var(--heyroq-accent-text)] transition-colors truncate">
              {user.displayName}
            </h4>
            <span className="text-xs text-slate-500 dark:text-white/45 font-medium truncate">
              @{user.username.replace(/^@/, '')}
            </span>
          </div>

          {/* Bio or Suggestion Reason */}
          {user.suggestionReason ? (
            <p className="text-[11px] text-[var(--heyroq-accent-text)] font-medium truncate mt-0.5">
              {user.suggestionReason}
            </p>
          ) : user.bio ? (
            <p className="text-xs text-slate-600 dark:text-white/60 truncate mt-0.5 font-sans">
              {user.bio}
            </p>
          ) : null}

          {/* Compact Stats (unboxed inline metadata with subtle · separators) */}
          {!compact && (
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-white/50 tabular-nums">
              <span>
                <strong className="font-semibold text-slate-800 dark:text-white/80">
                  {user.pinsCount || 0}
                </strong>{' '}
                pins
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong className="font-semibold text-slate-800 dark:text-white/80">
                  {user.followersCount || 0}
                </strong>{' '}
                followers
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Right: Follow / Following Button */}
      {!isMe && (
        <div className="shrink-0 ml-2">
          <button
            type="button"
            onClick={handleFollowClick}
            disabled={isLoadingFollow}
            className={`px-3.5 sm:px-4 py-2 min-h-[38px] rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 cursor-pointer whitespace-nowrap heyroq-focus-ring ${
              isFollowing
                ? 'liquid-glass-pill text-slate-800 dark:text-white/90 hover:text-slate-950 dark:hover:text-white'
                : 'heyroq-btn-primary'
            }`}
          >
            {isLoadingFollow ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isFollowing ? (
              <>
                <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Following</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Follow</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
