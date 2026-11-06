import React, { useState } from 'react';
import { PublicUserProfile } from '../../types';
import { User, UserPlus, UserCheck, Loader2, MapPin, Compass } from 'lucide-react';

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
  const [avatarError, setAvatarError] = useState(false);

  const isMe = Boolean(currentUserId && (currentUserId === user.id || currentUserId === user.uid));
  const avatarUrl = user.photoURL || user.avatarUrl;

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
      className="group flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/15 transition-all duration-200 cursor-pointer text-white"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onOpenProfile(user.id);
        }
      }}
    >
      {/* Left: Avatar + Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Avatar */}
        <div className="relative shrink-0">
          {avatarUrl && !avatarError ? (
            <img
              src={avatarUrl}
              alt={user.displayName}
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover border border-white/15 group-hover:border-[#FF5F40]/60 transition-colors shadow-md bg-neutral-900"
            />
          ) : (
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-neutral-900 border border-white/15 flex items-center justify-center text-white/50 group-hover:border-[#FF5F40]/60 transition-colors shadow-md">
              <User className="w-5 h-5 text-[#FF5F40]" />
            </div>
          )}
        </div>

        {/* Text Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <h4 className="text-sm font-bold text-white group-hover:text-[#FF8C75] transition-colors truncate">
              {user.displayName}
            </h4>
            <span className="text-xs text-white/40 font-mono truncate">
              @{user.username.replace(/^@/, '')}
            </span>
          </div>

          {/* Bio or Suggestion Reason */}
          {user.suggestionReason ? (
            <p className="text-[11px] text-[#FF5F40] font-medium truncate mt-0.5">
              {user.suggestionReason}
            </p>
          ) : user.bio ? (
            <p className="text-xs text-white/60 truncate mt-0.5 font-sans">
              {user.bio}
            </p>
          ) : null}

          {/* Compact Stats */}
          {!compact && (
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-white/50">
              <span className="flex items-center gap-1 font-mono">
                <Compass className="w-3 h-3 text-[#FF5F40]" />
                <span className="font-bold text-white/80">{user.pinsCount || 0}</span> pins
              </span>
              <span className="text-white/20">•</span>
              <span className="font-mono">
                <span className="font-bold text-white/80">{user.followersCount || 0}</span> followers
              </span>
              {typeof user.citiesCount === 'number' && user.citiesCount > 0 && (
                <>
                  <span className="text-white/20">•</span>
                  <span className="flex items-center gap-1 font-mono hidden sm:inline-flex">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    <span>{user.citiesCount} cities</span>
                  </span>
                </>
              )}
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
            className={`px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition shadow cursor-pointer active:scale-95 ${
              isFollowing
                ? 'bg-white/10 text-white/90 border border-white/20 hover:bg-white/20 hover:text-white'
                : 'bg-[#FF5F40] text-white hover:bg-[#ff7256] shadow-[0_0_12px_rgba(255,95,64,0.35)]'
            }`}
          >
            {isLoadingFollow ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
            ) : isFollowing ? (
              <>
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
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
