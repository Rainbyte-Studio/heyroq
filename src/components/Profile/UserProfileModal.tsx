import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserProfile, Pin, UserProgressionSummary } from '../../types';
import { doc, getDoc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { fetchUserPins, subscribeToUserPins, checkIfFollowing, toggleFollow } from '../../services/pinService';
import { uploadProfileImage, deletePreviousProfileImage } from '../../services/storageService';
import { FootprintSection } from './FootprintSection';
import { ExplorerProgressionBar } from './ExplorerProgressionBar';
import { AchievementsModal } from './AchievementsModal';
import { subscribeToUserProgression } from '../../services/gamificationService';
import { CategoryBadge } from '../Map/CategoryBadge';
import { LikeIndicator } from '../Pin/LikeButton';
import { FollowListModal } from './FollowListModal';
import {
  X,
  User,
  MapPin,
  Calendar,
  Edit3,
  Check,
  UserPlus,
  UserCheck,
  Compass,
  Camera,
  Loader2,
  Users,
  Trophy,
} from 'lucide-react';

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
  onSelectPin: (pin: Pin) => void;
  onAuthRequired: () => void;
  onOpenCreatePin?: () => void;
  onOpenOtherProfile?: (userId: string) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  userId,
  onClose,
  onSelectPin,
  onAuthRequired,
  onOpenCreatePin,
  onOpenOtherProfile,
}) => {
  const {
    user,
    profile: myProfile,
    updateUserProfile,
    refreshProfile,
    optimisticUpdateFollowingCount,
  } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userPins, setUserPins] = useState<Pin[]>([]);
  const [activeTab, setActiveTab] = useState<'pins' | 'about'>('pins');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [followListTab, setFollowListTab] = useState<'followers' | 'following' | null>(null);
  const [progressionSummary, setProgressionSummary] = useState<UserProgressionSummary | null>(null);
  const [isLoadingProgression, setIsLoadingProgression] = useState(true);
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to real-time Explorer Progression
  useEffect(() => {
    if (!userId) return;
    setIsLoadingProgression(true);
    const unsub = subscribeToUserProgression(
      userId,
      (summary) => {
        setProgressionSummary(summary);
        setIsLoadingProgression(false);
      },
      () => {
        setIsLoadingProgression(false);
      }
    );
    return () => unsub();
  }, [userId]);

  const isMe = Boolean(user?.uid && userId && user.uid === userId);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !isMe) return;

    setIsUploadingAvatar(true);
    try {
      const newAvatarUrl = await uploadProfileImage(file, user.uid);
      const oldAvatarUrl = profile?.photoURL || profile?.avatarUrl;
      await deletePreviousProfileImage(oldAvatarUrl, user.uid);

      await updateUserProfile({
        photoURL: newAvatarUrl,
        avatarUrl: newAvatarUrl,
      });

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              photoURL: newAvatarUrl,
              avatarUrl: newAvatarUrl,
            }
          : null
      );
    } catch (err) {
      console.error('Failed to update avatar photo:', err);
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    let unsubscribeUserSnapshot: (() => void) | null = null;
    let unsubscribeFollowers: (() => void) | null = null;
    let unsubscribeFollowing: (() => void) | null = null;
    let unsubscribePins: (() => void) | null = null;

    async function loadProfile() {
      if (!userId) return;

      try {
        if (isMe && myProfile) {
          setProfile(myProfile);
          setDisplayNameInput(myProfile.displayName);
          setBioInput(myProfile.bio || '');
        } else if (userId) {
          const docRef = doc(db, 'users', userId);
          unsubscribeUserSnapshot = onSnapshot(
            docRef,
            (snap) => {
              if (snap.exists() && isMounted) {
                const data = snap.data() as UserProfile;
                setProfile((prev) => {
                  return {
                    ...(prev || {}),
                    ...data,
                    followersCount:
                      typeof data.followersCount === 'number'
                        ? data.followersCount
                        : prev?.followersCount ?? 0,
                    followingCount:
                      typeof data.followingCount === 'number'
                        ? data.followingCount
                        : prev?.followingCount ?? 0,
                  } as UserProfile;
                });
                setDisplayNameInput((prev) => (prev ? prev : data.displayName));
                setBioInput((prev) => (prev ? prev : data.bio || ''));
              }
            },
            (err) => {
              console.warn('Target profile snapshot note:', err);
            }
          );
        }

        // Canonical real-time followers count listener from subcollection
        const followersColl = collection(db, 'users', userId, 'followers');
        unsubscribeFollowers = onSnapshot(
          followersColl,
          (snap) => {
            if (isMounted) {
              setProfile((prev) => (prev ? { ...prev, followersCount: snap.size } : prev));
            }
          },
          (err) => {
            console.warn('Followers subcollection listener notice:', err);
          }
        );

        // Canonical real-time following count listener from subcollection
        const followingColl = collection(db, 'users', userId, 'following');
        unsubscribeFollowing = onSnapshot(
          followingColl,
          (snap) => {
            if (isMounted) {
              setProfile((prev) => (prev ? { ...prev, followingCount: snap.size } : prev));
            }
          },
          (err) => {
            console.warn('Following subcollection listener notice:', err);
          }
        );

        // Subscribe to user pins so likeCount and commentCount stay 100% authoritative and live
        unsubscribePins = subscribeToUserPins(userId, (pins) => {
          if (isMounted) setUserPins(pins);
        });

        if (user && !isMe) {
          const following = await checkIfFollowing(user.uid, userId);
          if (isMounted) setIsFollowing(following);
        }
      } catch (err) {
        console.error('Error fetching user profile:', err);
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
      if (unsubscribeUserSnapshot) unsubscribeUserSnapshot();
      if (unsubscribeFollowers) unsubscribeFollowers();
      if (unsubscribeFollowing) unsubscribeFollowing();
      if (unsubscribePins) unsubscribePins();
    };
  }, [userId, isMe, user?.uid]);

  const handleToggleFollow = async () => {
    if (!user) {
      onAuthRequired();
      return;
    }
    if (!userId || isMe) return;

    setIsLoadingFollow(true);
    const prevFollowing = isFollowing;
    const nextFollowing = !prevFollowing;
    const delta = nextFollowing ? 1 : -1;

    // 1. Optimistic updates:
    // - User B: followersCount +1 (or -1)
    // - User A (current user): followingCount +1 (or -1)
    setIsFollowing(nextFollowing);
    setProfile((prev) => {
      if (!prev) return null;
      const current = typeof prev.followersCount === 'number' ? prev.followersCount : 0;
      const nextCount = current + delta;
      return {
        ...prev,
        followersCount: nextCount < 0 ? 0 : nextCount,
      };
    });
    optimisticUpdateFollowingCount(delta);

    try {
      // 2. Perform atomic document write in Firestore (followers and following subcollections)
      const actualFollowing = await toggleFollow(user.uid, userId);
      setIsFollowing(actualFollowing);

      // 3. Asynchronous server reconciliation:
      setTimeout(async () => {
        try {
          if (userId) {
            const docRef = doc(db, 'users', userId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              const data = snap.data();
              setProfile((prev) =>
                prev
                  ? {
                      ...prev,
                      followersCount:
                        typeof data.followersCount === 'number'
                          ? data.followersCount
                          : prev.followersCount,
                      followingCount:
                        typeof data.followingCount === 'number'
                          ? data.followingCount
                          : prev.followingCount,
                    }
                  : null
              );
            }
          }
          await refreshProfile();
        } catch (reconcileErr) {
          console.warn('Profile count reconciliation note:', reconcileErr);
        }
      }, 1000);
    } catch (err) {
      console.error('Error toggling follow:', err);
      // Roll back both profiles on write failure
      setIsFollowing(prevFollowing);
      setProfile((prev) => {
        if (!prev) return null;
        const current = typeof prev.followersCount === 'number' ? prev.followersCount : 0;
        const nextCount = current - delta;
        return {
          ...prev,
          followersCount: nextCount < 0 ? 0 : nextCount,
        };
      });
      optimisticUpdateFollowingCount(-delta);
    } finally {
      setIsLoadingFollow(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!isMe) return;
    try {
      await updateUserProfile({
        displayName: displayNameInput.trim(),
        bio: bioInput.trim(),
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving profile:', err);
    }
  };

  // Keyboard navigation & Escape key dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, onClose]);

  const handleBackdropClick = () => {
    if (isEditing) {
      setIsEditing(false);
    } else {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-2xl animate-in fade-in"
    >
      <div
        id={`user-profile-modal-${userId}`}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0E0E0E] rounded-[28px] sm:rounded-[32px] max-w-2xl sm:max-w-3xl lg:max-w-4xl w-full max-h-[92dvh] sm:max-h-[90vh] overflow-hidden shadow-2xl flex flex-col border border-white/20 text-white relative"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close profile"
          className="absolute top-3.5 sm:top-5 right-3.5 sm:right-5 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-full transition cursor-pointer border border-white/15 z-20 backdrop-blur-md"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrollable Profile Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {/* Profile Info Header */}
          <div className="pt-5 sm:pt-6 px-4 sm:px-6 pb-4 relative">
            <div className="flex justify-between items-start mb-4 pr-12">
              <div className="relative group shrink-0">
                {profile?.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    referrerPolicy="no-referrer"
                    className="w-18 h-18 sm:w-24 sm:h-24 rounded-full border-2 border-white/20 shadow-xl object-cover bg-neutral-900"
                  />
                ) : (
                  <div className="w-18 h-18 sm:w-24 sm:h-24 rounded-full border-2 border-white/20 shadow-xl bg-neutral-900 flex items-center justify-center text-white/50 border border-white/10">
                    <User className="w-9 h-9 sm:w-10 sm:h-10 text-[#FF5F40]" />
                  </div>
                )}

                {isMe && isEditing && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileChange}
                      disabled={isUploadingAvatar}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      title="Change profile avatar"
                      className="absolute inset-0 rounded-full bg-black/60 flex flex-col items-center justify-center text-white transition hover:bg-black/75 cursor-pointer border border-white/20"
                    >
                      {isUploadingAvatar ? (
                        <Loader2 className="w-6 h-6 animate-spin text-[#FF5F40]" />
                      ) : (
                        <>
                          <Camera className="w-5 h-5 text-white" />
                          <span className="text-[9px] font-bold mt-1 tracking-wider uppercase">Photo</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>

              {isMe ? (
                <button
                  type="button"
                  onClick={() => (isEditing ? handleSaveProfile() : setIsEditing(true))}
                  className="px-3.5 sm:px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer min-h-[36px]"
                >
                  {isEditing ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Save Profile</span>
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-3.5 h-3.5 text-[#FF5F40]" />
                      <span>Edit Profile</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleFollow}
                  disabled={isLoadingFollow}
                  className={`px-4 sm:px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition shadow-lg cursor-pointer min-h-[36px] ${
                    isFollowing
                      ? 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                      : 'bg-[#FF5F40] text-white hover:bg-[#ff7256] shadow-[0_0_15px_rgba(255,95,64,0.4)]'
                  }`}
                >
                  {isFollowing ? (
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
              )}
            </div>

            {/* Name & Bio */}
            {isEditing ? (
              <div className="space-y-2 mb-3">
                <input
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="Display Name"
                  className="w-full text-base sm:text-sm font-semibold bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-[#FF5F40] min-h-[40px]"
                />
                <textarea
                  rows={2}
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  placeholder="Bio"
                  className="w-full text-base sm:text-xs bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-[#FF5F40]"
                />
              </div>
            ) : (
              <div>
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                  {profile?.displayName || 'Explorer'}
                </h2>
                <p className="text-xs text-white/40 font-mono mt-0.5">
                  @{profile?.username ? profile.username.replace(/^@/, '') : (profile?.email ? profile.email.split('@')[0] : 'explorer')}
                </p>
                <p className="text-xs text-white/70 mt-2 leading-relaxed">
                  {profile?.bio || 'Heyroq explorer finding unique spots.'}
                </p>
              </div>
            )}

            {/* Stats Bar with Clickable Followers & Following */}
            <div className="flex gap-5 sm:gap-6 mt-4 pt-3 border-t border-white/10 text-xs">
              <div className="text-center">
                <span className="font-black text-white block text-lg font-mono">
                  {userPins.length}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Pins</span>
              </div>

              <button
                type="button"
                onClick={() => setFollowListTab('followers')}
                title="View followers"
                className="text-center group/stat cursor-pointer hover:opacity-80 transition focus:outline-none p-1 -m-1"
              >
                <span className="font-black text-white block text-lg font-mono group-hover/stat:text-[#FF8C75] transition-colors">
                  {profile?.followersCount || 0}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover/stat:text-[#FF5F40] transition-colors underline decoration-white/20 underline-offset-4">
                  Followers
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFollowListTab('following')}
                title="View following"
                className="text-center group/stat cursor-pointer hover:opacity-80 transition focus:outline-none p-1 -m-1"
              >
                <span className="font-black text-white block text-lg font-mono group-hover/stat:text-[#FF8C75] transition-colors">
                  {profile?.followingCount || 0}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover/stat:text-[#FF5F40] transition-colors underline decoration-white/20 underline-offset-4">
                  Following
                </span>
              </button>
            </div>

            {/* EXPLORER PROGRESSION BAR */}
            <div className="mt-4">
              <ExplorerProgressionBar
                summary={progressionSummary}
                isLoading={isLoadingProgression}
                onOpenAchievements={() => setShowAchievementsModal(true)}
              />
            </div>
          </div>

          {/* PROFILE FOOTPRINT SECTION */}
          <FootprintSection
            userId={userId}
            isMe={isMe}
            displayName={profile?.displayName}
            onSelectPin={onSelectPin}
            onOpenCreatePin={onOpenCreatePin}
            onCloseProfileModal={onClose}
            pins={userPins}
          />

          {/* Pins Section */}
          <div className="border-t border-white/10 p-4 sm:p-6 bg-black/40 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-[#FF5F40]" />
                <span>Pins Created ({userPins.length})</span>
              </h3>
            </div>

            {userPins.length === 0 ? (
              <div className="text-center py-8 text-white/40 text-xs">
                <p>No location pins created yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                {userPins.map((pin) => (
                  <div
                    key={pin.id}
                    onClick={() => {
                      onSelectPin(pin);
                      onClose();
                    }}
                    className="bg-[#141414] rounded-2xl overflow-hidden border border-white/15 hover:border-[#FF5F40]/60 cursor-pointer transition group"
                  >
                    <div className="h-28 bg-black relative overflow-hidden">
                      <img
                        src={
                          pin.imageUrls?.[0] ||
                          'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80'
                        }
                        alt={pin.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute top-2 left-2">
                        <CategoryBadge category={pin.category} size="xs" />
                      </div>
                      <div className="absolute bottom-2 right-2">
                        <LikeIndicator count={pin.likeCount || 0} variant="badge" />
                      </div>
                    </div>
                    <div className="p-3">
                      <h4 className="font-black text-xs text-white uppercase tracking-tight truncate">
                        {pin.title}
                      </h4>
                      <p className="text-[10px] text-white/40 truncate mt-0.5">
                        {pin.locationName || pin.category}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Followers / Following List Modal */}
      {followListTab && (
        <FollowListModal
          userId={userId}
          userDisplayName={profile?.displayName}
          initialTab={followListTab}
          currentUserId={user?.uid}
          onClose={() => setFollowListTab(null)}
          onOpenProfile={(targetUid) => {
            setFollowListTab(null);
            if (onOpenOtherProfile) {
              onOpenOtherProfile(targetUid);
            }
          }}
          onAuthRequired={onAuthRequired}
          onFollowToggled={(targetUid, isNowFollowing) => {
            if (targetUid === userId) {
              setIsFollowing(isNowFollowing);
              setProfile((prev) => {
                if (!prev) return null;
                const current = typeof prev.followersCount === 'number' ? prev.followersCount : 0;
                const nextCount = current + (isNowFollowing ? 1 : -1);
                return {
                  ...prev,
                  followersCount: nextCount < 0 ? 0 : nextCount,
                };
              });
            }
            if (isMe) {
              optimisticUpdateFollowingCount(isNowFollowing ? 1 : -1);
            }
          }}
        />
      )}

      {/* Achievements Modal */}
      {showAchievementsModal && (
        <AchievementsModal
          userId={userId}
          displayName={profile?.displayName}
          onClose={() => setShowAchievementsModal(false)}
        />
      )}
    </div>
  );
};
