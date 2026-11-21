import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserProfile, Pin, UserProgressionSummary } from '../../types';
import { doc, getDoc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { subscribeToUserPins, checkIfFollowing, toggleFollow } from '../../services/pinService';
import {
  uploadProfileImageWithProgress,
  deletePreviousProfileImage,
  validateImageFile,
} from '../../services/storageService';
import { USERNAME_HINT } from '../../services/usernameService';
import { isCustomUploadedAvatarUrl } from '../../utils/avatarUtils';
import { FootprintSection } from './FootprintSection';
import { ExplorerProgressionBar } from './ExplorerProgressionBar';
import { AchievementsModal } from './AchievementsModal';
import { AccountSecurityModal } from './AccountSecurityModal';
import { subscribeToUserProgression } from '../../services/gamificationService';
import { CategoryBadge } from '../Map/CategoryBadge';
import { LikeIndicator } from '../Pin/LikeButton';
import { FollowListModal } from './FollowListModal';
import { ThemeSelector } from '../Common/ThemeSelector';
import { UserAvatar } from '../Common/UserAvatar';
import { CloseButton } from '../Common/CloseButton';
import {
  MapPin,
  Edit3,
  Check,
  UserPlus,
  UserCheck,
  Compass,
  Upload,
  Trash2,
  Loader2,
  Info,
  SunMoon,
  Settings,
  Shield,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { APP_VERSION } from '../../config/version';
import { OPERATOR_IDENTITY } from '../../config/brandConfig';
import { AppLink } from '../../utils/appRoutes';

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
  onSelectPin: (pin: Pin) => void;
  onAuthRequired: () => void;
  onOpenCreatePin?: () => void;
  onOpenOtherProfile?: (userId: string) => void;
  onOpenAbout?: () => void;
  onOpenEngagementSettings?: () => void;
  onAvatarUpdated?: (userId: string, newAvatarUrl: string) => void;
  onAccountDeleted?: () => void;
  initialOpenAccountSecurity?: boolean;
}

const ProfilePinImage: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="w-full h-full bg-[#F3F1ED] dark:bg-[#2B2C31] flex items-center justify-center text-[var(--heyroq-text-muted)]">
        <MapPin className="w-5 h-5 text-[var(--brand-primary)]/80" strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
    />
  );
};

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  userId,
  onClose,
  onSelectPin,
  onAuthRequired,
  onOpenCreatePin,
  onOpenOtherProfile,
  onOpenAbout,
  onOpenEngagementSettings,
  onAvatarUpdated,
  onAccountDeleted,
  initialOpenAccountSecurity = false,
}) => {
  const {
    user,
    profile: myProfile,
    providerStatus,
    updateUserProfile,
    refreshProfile,
    optimisticUpdateFollowingCount,
  } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userPins, setUserPins] = useState<Pin[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const originalUsername = useRef('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [bioInput, setBioInput] = useState('');

  // Avatar upload, preview, replace & remove state
  const [isAvatarControlsOpen, setIsAvatarControlsOpen] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreviewUrl, setPendingAvatarPreviewUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState<number>(0);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Settings & Account Security navigation state (Profile -> Settings -> Account & Security)
  const [isSettingsHighlighted, setIsSettingsHighlighted] = useState(false);
  const [showAccountSecurityModal, setShowAccountSecurityModal] =
    useState(initialOpenAccountSecurity);

  const [followListTab, setFollowListTab] = useState<'followers' | 'following' | null>(null);
  const [progressionSummary, setProgressionSummary] = useState<UserProgressionSummary | null>(null);
  const [isLoadingProgression, setIsLoadingProgression] = useState(true);
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileScrollContainerRef = useRef<HTMLDivElement>(null);
  const profileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const settingsSectionRef = useRef<HTMLDivElement>(null);
  const settingsHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up highlight timer on unmount
  useEffect(() => {
    return () => {
      if (settingsHighlightTimerRef.current) {
        clearTimeout(settingsHighlightTimerRef.current);
      }
    };
  }, []);

  const handleNavigateToSettings = () => {
    const sectionEl = settingsSectionRef.current;
    if (!sectionEl) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const scrollBehavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    const scrollContainer = profileScrollContainerRef.current;
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const sectionRect = sectionEl.getBoundingClientRect();
      const targetTop = Math.max(
        0,
        scrollContainer.scrollTop + (sectionRect.top - containerRect.top) - 16
      );
      scrollContainer.scrollTo({
        top: targetTop,
        behavior: scrollBehavior,
      });
    } else {
      sectionEl.scrollIntoView({
        behavior: scrollBehavior,
        block: 'start',
      });
    }

    setIsSettingsHighlighted(true);
    if (settingsHighlightTimerRef.current) {
      clearTimeout(settingsHighlightTimerRef.current);
    }
    settingsHighlightTimerRef.current = setTimeout(() => {
      setIsSettingsHighlighted(false);
    }, 1400);

    sectionEl.focus({ preventScroll: true });
  };

  // Clean up object URL on unmount or file swap
  useEffect(() => {
    return () => {
      if (pendingAvatarPreviewUrl) {
        URL.revokeObjectURL(pendingAvatarPreviewUrl);
      }
    };
  }, [pendingAvatarPreviewUrl]);

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
  const currentAvatarUrl = profile?.avatarUrl || profile?.photoURL || '';
  const hasCustomAvatar = isCustomUploadedAvatarUrl(currentAvatarUrl);

  const clearPendingAvatarSelection = () => {
    if (pendingAvatarPreviewUrl) {
      URL.revokeObjectURL(pendingAvatarPreviewUrl);
    }
    setPendingAvatarFile(null);
    setPendingAvatarPreviewUrl(null);
    setAvatarUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAvatarFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !isMe) return;

    setAvatarError(null);
    try {
      validateImageFile(file);
      if (pendingAvatarPreviewUrl) {
        URL.revokeObjectURL(pendingAvatarPreviewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      setPendingAvatarFile(file);
      setPendingAvatarPreviewUrl(previewUrl);
      setIsAvatarControlsOpen(true);
    } catch (err: any) {
      setAvatarError(err?.message || 'Unsupported image file.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmSaveAvatar = async () => {
    if (!pendingAvatarFile || !user || !isMe || isUploadingAvatar) return;

    setIsUploadingAvatar(true);
    setAvatarError(null);
    setAvatarUploadProgress(5);
    try {
      const oldAvatarUrl = profile?.photoURL || profile?.avatarUrl;
      const newAvatarUrl = await uploadProfileImageWithProgress(
        pendingAvatarFile,
        user.uid,
        (pct) => setAvatarUploadProgress(pct)
      );

      await updateUserProfile({
        photoURL: newAvatarUrl,
        avatarUrl: newAvatarUrl,
      });

      await deletePreviousProfileImage(oldAvatarUrl, user.uid);

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              photoURL: newAvatarUrl,
              avatarUrl: newAvatarUrl,
            }
          : null
      );
      onAvatarUpdated?.(user.uid, newAvatarUrl);
      clearPendingAvatarSelection();
      setIsAvatarControlsOpen(false);
    } catch (err: any) {
      console.error('Failed to update avatar photo:', err);
      setAvatarError(err?.message || 'Failed to upload profile photo. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
      setAvatarUploadProgress(0);
    }
  };

  const handleRemoveAvatarPhoto = async () => {
    if (!user || !isMe || isUploadingAvatar || !hasCustomAvatar) return;

    setIsUploadingAvatar(true);
    setAvatarError(null);
    try {
      const oldAvatarUrl = profile?.photoURL || profile?.avatarUrl;
      await updateUserProfile({
        photoURL: '',
        avatarUrl: '',
      });
      await deletePreviousProfileImage(oldAvatarUrl, user.uid);

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              photoURL: '',
              avatarUrl: '',
            }
          : null
      );
      onAvatarUpdated?.(user.uid, '');
      clearPendingAvatarSelection();
      setIsAvatarControlsOpen(false);
    } catch (err: any) {
      console.error('Failed to remove avatar photo:', err);
      setAvatarError(err?.message || 'Failed to remove profile photo. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  useEffect(() => {
    if (isMe && myProfile) {
      setProfile((prev) => ({
        ...(prev || {}),
        ...myProfile,
        followersCount: prev?.followersCount ?? myProfile.followersCount ?? 0,
        followingCount: prev?.followingCount ?? myProfile.followingCount ?? 0,
      }));
    }
  }, [isMe, myProfile]);

  useEffect(() => {
    setUserPins([]);
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
        }, isMe);

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
      const actualFollowing = await toggleFollow(user.uid, userId);
      setIsFollowing(actualFollowing);

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
    if (!isMe || isSavingProfile) return;
    setIsSavingProfile(true);
    setProfileSaveError('');
    try {
      await updateUserProfile({
        displayName: displayNameInput.trim() || 'Explorer',
        bio: bioInput.trim(),
        ...(usernameInput !== originalUsername.current ? { username: usernameInput } : {}),
      });
      setIsEditing(false);
    } catch (error) {
      setProfileSaveError(error instanceof Error ? error.message : 'Could not save your profile. Try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Keyboard navigation & Escape key dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showAccountSecurityModal || showAchievementsModal) return;
      if (e.key === 'Escape') {
        if (pendingAvatarFile || isAvatarControlsOpen) {
          clearPendingAvatarSelection();
          setIsAvatarControlsOpen(false);
        } else if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, isAvatarControlsOpen, pendingAvatarFile, showAccountSecurityModal, showAchievementsModal, onClose]);

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
      className="liquid-glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        id={`user-profile-modal-${userId}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={profile?.displayName ? `${profile.displayName}'s profile` : 'Explorer profile'}
        className="liquid-glass-modal rounded-[28px] sm:rounded-[32px] max-w-2xl sm:max-w-3xl lg:max-w-4xl w-full max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col text-slate-900 dark:text-white relative"
      >
        {/* Close Button */}
        <CloseButton
          ref={profileCloseButtonRef}
          onClick={onClose}
          ariaLabel="Close Profile"
          className="absolute top-3.5 sm:top-5 right-3.5 sm:right-5 z-20"
        />

        {/* Scrollable Profile Content */}
        <div
          ref={profileScrollContainerRef}
          className="flex-1 overflow-y-auto subtle-glass-scrollbar"
        >
          {/* Profile Info Header */}
          <div className="pt-5 sm:pt-6 px-4 sm:px-6 pb-4 relative">
            <div className="flex justify-between items-start gap-3 mb-4 pr-12">
              {/* Prominent Shared Avatar + Hidden File Input */}
              <div className="relative shrink-0">
                <UserAvatar
                  uid={userId}
                  displayName={isEditing ? displayNameInput || profile?.displayName : profile?.displayName}
                  imageUrl={pendingAvatarPreviewUrl || currentAvatarUrl}
                  size="profile"
                  ringClassName="ring-2 ring-slate-900/12 dark:ring-white/20 shadow-md"
                  editable={isMe}
                  isUploading={isUploadingAvatar}
                  onEditClick={() => {
                    setAvatarError(null);
                    setIsAvatarControlsOpen((prev) => !prev);
                  }}
                />
                {isMe && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif"
                    className="hidden"
                    onChange={handleAvatarFileSelected}
                    disabled={isUploadingAvatar}
                  />
                )}
              </div>

              {isMe ? (
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {onOpenAbout && (
                    <button
                      id="profile-about-heyroq-btn"
                      type="button"
                      onClick={onOpenAbout}
                      aria-label="About Heyroq"
                      className="liquid-glass-pill px-3.5 py-2 text-slate-700 dark:text-white/85 hover:text-slate-950 dark:hover:text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors duration-150 cursor-pointer min-h-[40px] whitespace-nowrap heyroq-focus-ring"
                    >
                      <Info className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                      <span>About</span>
                    </button>
                  )}

                  <button
                    id="profile-settings-btn"
                    type="button"
                    onClick={handleNavigateToSettings}
                    aria-controls="profile-settings-panel"
                    aria-label="Scroll to profile settings"
                    className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer min-h-[40px] whitespace-nowrap heyroq-focus-ring ${
                      isSettingsHighlighted
                        ? 'bg-slate-900/10 dark:bg-white/15 text-slate-950 dark:text-white border border-[var(--brand-primary)]/50'
                        : 'liquid-glass-pill text-slate-700 dark:text-white/85 hover:text-slate-950 dark:hover:text-white hover:bg-slate-900/[0.07] dark:hover:bg-white/[0.12]'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                    <span>Settings</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingProfile}
                    onClick={() => {
                      if (isEditing) {
                        void handleSaveProfile();
                      } else {
                        setDisplayNameInput(profile?.displayName || '');
                        setBioInput(profile?.bio || '');
                        originalUsername.current = profile?.username || '';
                        setUsernameInput(originalUsername.current);
                        setProfileSaveError('');
                        setIsEditing(true);
                      }
                    }}
                    className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 cursor-pointer min-h-[40px] whitespace-nowrap heyroq-focus-ring ${
                      isEditing
                        ? 'heyroq-btn-primary'
                        : 'liquid-glass-pill text-slate-800 dark:text-white hover:text-slate-950 dark:hover:text-white'
                    }`}
                  >
                    {isEditing ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSavingProfile ? 'Saving…' : 'Save Profile'}</span>
                      </>
                    ) : (
                      <>
                        <Edit3 className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                        <span>Edit Profile</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleFollow}
                  disabled={isLoadingFollow}
                  className={`px-4 sm:px-5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 cursor-pointer min-h-[40px] whitespace-nowrap heyroq-focus-ring ${
                    isFollowing
                      ? 'liquid-glass-pill text-slate-800 dark:text-white hover:text-slate-950 dark:hover:text-white'
                      : 'heyroq-btn-primary'
                  }`}
                >
                  {isFollowing ? (
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
              )}
            </div>

            {/* Owner Avatar Management Panel (Upload / Preview / Replace / Remove) */}
            {isMe && (isAvatarControlsOpen || pendingAvatarFile || avatarError) && (
              <div
                id="profile-avatar-controls"
                className="mb-4 liquid-glass-card rounded-2xl p-3.5 sm:p-4 space-y-3 animate-in fade-in duration-150"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-heading text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      Profile Photo
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-white/55 mt-0.5">
                      {pendingAvatarFile
                        ? `Previewing "${pendingAvatarFile.name}" (${(
                            pendingAvatarFile.size /
                            (1024 * 1024)
                          ).toFixed(2)} MB) — save to publish.`
                        : hasCustomAvatar
                          ? 'Upload a new photo or remove your custom photo to restore your default initials avatar.'
                          : 'Using your Heyroq initials avatar. Upload a JPEG, PNG, WebP, GIF, HEIC, or AVIF photo up to 10 MB.'}
                    </p>
                  </div>
                  <CloseButton
                    size="sm"
                    onClick={() => {
                      clearPendingAvatarSelection();
                      setAvatarError(null);
                      setIsAvatarControlsOpen(false);
                    }}
                    disabled={isUploadingAvatar}
                    ariaLabel="Close photo options"
                  />
                </div>

                {avatarError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200 flex items-center gap-2"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>{avatarError}</span>
                  </div>
                )}

                {isUploadingAvatar && avatarUploadProgress > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 dark:text-white/65 tabular-nums">
                      <span>Uploading photo...</span>
                      <span>{avatarUploadProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-900/10 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-[var(--brand-primary)] transition-all duration-150"
                        style={{ width: `${avatarUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {pendingAvatarFile ? (
                    <>
                      <button
                        id="confirm-save-avatar-btn"
                        type="button"
                        onClick={handleConfirmSaveAvatar}
                        disabled={isUploadingAvatar}
                        className="heyroq-btn-primary min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {isUploadingAvatar ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Saving Photo...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Save Photo</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingAvatar}
                        className="liquid-glass-pill min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-white/85 cursor-pointer whitespace-nowrap"
                      >
                        Choose Different File
                      </button>
                      <button
                        type="button"
                        onClick={clearPendingAvatarSelection}
                        disabled={isUploadingAvatar}
                        className="liquid-glass-pill min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-white/70 cursor-pointer whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        id="upload-or-change-avatar-btn"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingAvatar}
                        className="heyroq-btn-primary min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{hasCustomAvatar ? 'Change Photo' : 'Upload Photo'}</span>
                      </button>

                      {hasCustomAvatar && (
                        <button
                          id="remove-avatar-photo-btn"
                          type="button"
                          onClick={handleRemoveAvatarPhoto}
                          disabled={isUploadingAvatar}
                          className="liquid-glass-pill min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {isUploadingAvatar ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          <span>Remove Photo</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Name & Bio */}
            {isEditing ? (
              <div className="space-y-2.5 mb-3">
                <input
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="Display Name"
                  className="liquid-glass-input w-full text-base sm:text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[var(--brand-primary)] min-h-[42px]"
                />
                <label className="block text-xs font-semibold" htmlFor="profile-username">Username</label>
                <input
                  id="profile-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby="profile-username-hint"
                  value={usernameInput}
                  onChange={event => setUsernameInput(event.target.value)}
                  className="liquid-glass-input w-full text-base sm:text-sm rounded-xl px-3.5 py-2.5 min-h-[42px]"
                />
                <p id="profile-username-hint" className="text-xs text-[var(--heyroq-text-secondary)]">{USERNAME_HINT}</p>
                {profileSaveError && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{profileSaveError}</p>}
                <textarea
                  rows={2}
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  placeholder="Bio"
                  className="liquid-glass-input w-full text-base sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 rounded-xl px-3.5 py-2.5 resize-none focus:outline-none focus:border-[var(--brand-primary)]"
                />
              </div>
            ) : (
              <div>
                <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {profile?.displayName || 'Explorer'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-white/45 font-medium mt-0.5">
                  @
                  {profile?.username
                    ? profile.username.replace(/^@/, '')
                    : profile?.email
                      ? profile.email.split('@')[0]
                      : 'explorer'}
                </p>
                <p className="text-sm text-slate-600 dark:text-white/75 mt-2 leading-relaxed max-w-2xl">
                  {profile?.bio || 'Heyroq explorer finding unique spots.'}
                </p>
              </div>
            )}

            {/* Stats Bar with Clickable Followers & Following */}
            <div className="flex items-center gap-6 sm:gap-8 mt-4 pt-3.5 border-t border-slate-900/8 dark:border-white/10 text-xs">
              <div className="text-left">
                <span className="font-heading font-bold text-slate-900 dark:text-white block text-lg tabular-nums">
                  {userPins.length}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-white/50">Pins</span>
              </div>

              <button
                type="button"
                onClick={() => setFollowListTab('followers')}
                title="View followers"
                className="text-left group/stat cursor-pointer transition-colors duration-150 heyroq-focus-ring rounded-lg p-1.5 -m-1.5 min-h-[44px]"
              >
                <span className="font-heading font-bold text-slate-900 dark:text-white block text-lg tabular-nums group-hover/stat:text-[var(--heyroq-accent-text)] transition-colors">
                  {profile?.followersCount || 0}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-white/50 group-hover/stat:text-[var(--heyroq-accent-text)] transition-colors underline decoration-slate-900/20 dark:decoration-white/20 underline-offset-4">
                  Followers
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFollowListTab('following')}
                title="View following"
                className="text-left group/stat cursor-pointer transition-colors duration-150 heyroq-focus-ring rounded-lg p-1.5 -m-1.5 min-h-[44px]"
              >
                <span className="font-heading font-bold text-slate-900 dark:text-white block text-lg tabular-nums group-hover/stat:text-[var(--heyroq-accent-text)] transition-colors">
                  {profile?.followingCount || 0}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-white/50 group-hover/stat:text-[var(--heyroq-accent-text)] transition-colors underline decoration-slate-900/20 dark:decoration-white/20 underline-offset-4">
                  Following
                </span>
              </button>
            </div>

            {/* Explorer Progression Bar */}
            <div className="mt-4">
              <ExplorerProgressionBar
                summary={progressionSummary}
                isLoading={isLoadingProgression}
                onOpenAchievements={() => setShowAchievementsModal(true)}
              />
            </div>

            {/* Own Profile Settings (Appearance + Account & Security) */}
            {isMe && (
              <div
                ref={settingsSectionRef}
                id="profile-settings-panel"
                tabIndex={-1}
                aria-label="Profile Settings"
                className="mt-5 sm:mt-6 flex flex-col focus:outline-none"
              >
                <div
                  className={`space-y-3 rounded-2xl transition-colors duration-200 ${
                    isSettingsHighlighted
                      ? 'ring-2 ring-[var(--brand-primary)]/45 bg-[var(--brand-primary)]/[0.04] px-3 py-2.5 -mx-3 -my-2.5'
                      : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-white/80">
                      <SunMoon className="w-4 h-4 text-[var(--brand-primary)] shrink-0" />
                      <span>Appearance</span>
                    </div>
                    <ThemeSelector
                      compact
                      idPrefix="profile-theme"
                      className="w-full sm:w-64"
                    />
                  </div>

                  {onOpenEngagementSettings && (
                    <button type="button" onClick={onOpenEngagementSettings} aria-haspopup="dialog"
                      className="liquid-glass-card heyroq-focus-ring flex min-h-[54px] w-full flex-col justify-center rounded-2xl px-4 py-3 text-left hover:border-[var(--brand-primary)]/50">
                      <span className="text-sm font-bold">Notifications &amp; Activity</span>
                      <span className="text-xs text-[var(--heyroq-text-secondary)]">In-app notifications and activity privacy</span>
                    </button>
                  )}

                  {/* Account & Security Entry Row (Profile -> Settings -> Account & Security) */}
                  <button
                    id="profile-account-security-btn"
                    type="button"
                    onClick={() => setShowAccountSecurityModal(true)}
                    className="liquid-glass-card w-full rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-left hover:border-[var(--brand-primary)]/50 transition cursor-pointer group heyroq-focus-ring min-h-[54px]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[var(--brand-primary)]/12 border border-[var(--brand-primary)]/25 flex items-center justify-center text-[var(--brand-primary)] shrink-0">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-[var(--heyroq-accent-text)] transition-colors">
                          Account &amp; Security
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-white/55 truncate">
                          Email · {providerStatus.hasPassword ? 'Password enabled' : 'Set password'} ·{' '}
                          {providerStatus.hasGoogle ? 'Google connected' : 'Connect Google'} · Delete
                          account
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 dark:text-white/45 group-hover:text-slate-900 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Profile Footprint Section */}
          <FootprintSection
            userId={userId}
            isMe={isMe}
            displayName={profile?.displayName}
            onSelectPin={onSelectPin}
            onOpenCreatePin={onOpenCreatePin}
            onCloseProfileModal={onClose}
            pins={userPins.filter(pin => pin.publicAccess === true)}
          />

          {/* Pins Section */}
          <div className="border-t border-slate-900/8 dark:border-white/10 p-4 sm:p-6 bg-slate-900/[0.02] dark:bg-black/25 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 tabular-nums">
                <Compass className="w-4 h-4 text-[var(--brand-primary)]" />
                <span>Pins Created ({userPins.length})</span>
              </h3>
            </div>

            {userPins.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-white/45 text-xs">
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
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectPin(pin);
                        onClose();
                      }
                    }}
                    className="liquid-glass-card rounded-2xl overflow-hidden hover:border-[var(--brand-primary)]/55 cursor-pointer transition-all duration-150 group heyroq-focus-ring"
                  >
                    <div className="h-28 bg-slate-200/70 dark:bg-black/50 relative overflow-hidden">
                      <ProfilePinImage src={pin.publicAccess === true ? pin.imageUrls?.[0] : undefined} alt={pin.title} />
                      <div className="absolute top-2 left-2">
                        <CategoryBadge category={pin.category} size="xs" />
                      </div>
                      <div className="absolute bottom-2 right-2">
                        <LikeIndicator count={pin.likeCount || 0} variant="badge" />
                      </div>
                    </div>
                    <div className="p-3">
                      <h4 className="font-heading font-semibold text-xs text-slate-900 dark:text-white tracking-tight truncate">
                        {pin.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-white/50 truncate mt-0.5">
                        {pin.locationName || pin.category}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Profile Version, Operator Attribution & Legal Links Footer */}
            {onOpenAbout && (
              <div className="mt-6 pt-4 border-t border-slate-900/8 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-white/55">
                <div className="space-y-1">
                  <div className="text-xs font-sans font-medium tabular-nums text-[var(--heyroq-text-secondary)]">
                    {APP_VERSION.productName} {APP_VERSION.displayVersion} ·{' '}
                    {APP_VERSION.releaseChannel} · Operated by {OPERATOR_IDENTITY.name}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-white/50">
                    <AppLink
                      to="/about"
                      onBeforeNavigate={onClose}
                      className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline"
                    >
                      About
                    </AppLink>
                    <span aria-hidden="true">·</span>
                    <AppLink
                      to="/privacy"
                      onBeforeNavigate={onClose}
                      className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline"
                    >
                      Privacy
                    </AppLink>
                    <span aria-hidden="true">·</span>
                    <AppLink
                      to="/terms"
                      onBeforeNavigate={onClose}
                      className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline"
                    >
                      Terms
                    </AppLink>
                    <span aria-hidden="true">·</span>
                    <AppLink
                      to="/support"
                      onBeforeNavigate={onClose}
                      className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline"
                    >
                      Support
                    </AppLink>
                  </div>
                </div>
                <button
                  id="profile-footer-about-btn"
                  type="button"
                  onClick={onOpenAbout}
                  className="min-h-[38px] self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-white/75 hover:text-slate-950 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/10 transition-colors duration-150 cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap heyroq-focus-ring"
                >
                  <Info className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                  <span>About Heyroq</span>
                </button>
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
          fallbackFocusRef={profileCloseButtonRef}
          onClose={() => setShowAchievementsModal(false)}
        />
      )}

      {/* Account & Security Modal (Owner only) */}
      {isMe && (
        <AccountSecurityModal
          isOpen={showAccountSecurityModal}
          onClose={() => setShowAccountSecurityModal(false)}
          onAccountDeleted={() => {
            setShowAccountSecurityModal(false);
            onClose();
            onAccountDeleted?.();
          }}
        />
      )}
    </div>
  );
};
