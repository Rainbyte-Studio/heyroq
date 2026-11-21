import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pin, Comment } from '../../types';
import { CategoryBadge } from '../Map/CategoryBadge';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../lib/firebase';
import {
  fetchComments,
  subscribeToComments,
  addComment,
  toggleLike,
  checkIfLiked,
  subscribeToPinLike,
  subscribeToPinDocument,
  checkIfFollowing,
  toggleFollow,
  deletePin,
  deleteComment,
} from '../../services/pinService';
import { LikeButton } from './LikeButton';
import { DeleteConfirmationModal } from '../Common/DeleteConfirmationModal';
import { UserAvatar } from '../Common/UserAvatar';
import { CloseButton } from '../Common/CloseButton';
import { SpotPhotoFallback } from '../Common/SpotPhotoFallback';
import {
  Heart,
  MessageCircle,
  MapPin,
  User,
  Share2,
  Flag,
  Trash2,
  Send,
  UserPlus,
  UserCheck,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';

interface PinDetailModalProps {
  pin: Pin;
  initialIsLiked?: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenReport: (pinId: string, targetType: 'pin' | 'comment', targetId: string) => void;
  onPinDeleted?: (pinId: string) => void;
  onAuthRequired: () => void;
  onLikeToggled?: (pinId: string, isLiked: boolean, likeCount: number) => void;
  onLikeCountChanged?: (pinId: string, newCount: number) => void;
  onCommentCountChanged?: (pinId: string, newCount: number) => void;
}

export const PinDetailModal: React.FC<PinDetailModalProps> = ({
  pin,
  initialIsLiked,
  onClose,
  onOpenProfile,
  onOpenReport,
  onPinDeleted,
  onAuthRequired,
  onLikeToggled,
  onLikeCountChanged,
  onCommentCountChanged,
}) => {
  const {
    user,
    profile,
    isAdmin,
    refreshProfile,
    optimisticUpdateFollowingCount,
  } = useAuth();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [deletingCommentIds, setDeletingCommentIds] = useState<Set<string>>(new Set());

  // Explicit State Machine for Pin Deletion (IDLE -> CONFIRMING -> DELETING -> SUCCESS)
  type DeleteState = 'IDLE' | 'CONFIRMING' | 'DELETING' | 'SUCCESS';
  const [pinDeleteState, setPinDeleteState] = useState<DeleteState>('IDLE');
  const isPinDeletingRef = useRef(false);
  const [pinDeleteError, setPinDeleteError] = useState<string | null>(null);

  // Explicit State Machine for Comment Deletion (IDLE -> CONFIRMING -> DELETING -> SUCCESS)
  const [commentDeleteState, setCommentDeleteState] = useState<DeleteState>('IDLE');
  const [commentToDelete, setCommentToDelete] = useState<Comment | null>(null);
  const isCommentDeletingRef = useRef(false);
  const [commentDeleteModalError, setCommentDeleteModalError] = useState<string | null>(null);

  const [isLiked, setIsLiked] = useState(initialIsLiked ?? false);
  const [likeCount, setLikeCount] = useState(pin.likeCount || 0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [copied, setCopied] = useState(false);

  // Synchronize local likeCount if parent pin is updated with fresher count
  useEffect(() => {
    if (typeof pin.likeCount === 'number') {
      setLikeCount(pin.likeCount);
    }
  }, [pin.likeCount]);

  // Reset all deletion state machines on pin.id change to strictly prevent stale operations
  useEffect(() => {
    setPinDeleteState('IDLE');
    isPinDeletingRef.current = false;
    setPinDeleteError(null);
    setCommentDeleteState('IDLE');
    setCommentToDelete(null);
    isCommentDeletingRef.current = false;
    setCommentDeleteModalError(null);
  }, [pin.id]);

  // Canonical Firebase Auth UID check
  const authUid = auth.currentUser?.uid || user?.uid;
  const canDeleteComment = (c: Comment) => {
    if (!authUid) return false;
    return authUid === c.userId || isAdmin;
  };

  // Guards against race conditions
  const activePinIdRef = useRef(pin.id);

  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const images = (pin.imageUrls || []).filter((url) => typeof url === 'string' && url.trim().length > 0);

  useEffect(() => {
    setFailedImages(new Set());
    setActiveImageIndex(0);
  }, [pin.id]);

  // Load real-time authoritative like status, follow status and comments
  useEffect(() => {
    activePinIdRef.current = pin.id;
    setLikeCount(pin.likeCount || 0);
    let isMounted = true;

    // 1. Authoritative real-time Firestore listener on pins/{pinId}/likes/{currentUser.uid}
    let unsubscribeLike: (() => void) | null = null;
    if (user?.uid) {
      unsubscribeLike = subscribeToPinLike(pin.id, user.uid, (liked) => {
        if (isMounted && activePinIdRef.current === pin.id) {
          setIsLiked(liked);
        }
      });
    } else {
      setIsLiked(false);
    }

    // 1b. Authoritative real-time Firestore listener on pin document for live likeCount & commentCount
    const unsubscribeDoc = subscribeToPinDocument(pin.id, ({ likeCount: remoteLikes, commentCount: remoteComments }) => {
      if (isMounted && activePinIdRef.current === pin.id) {
        if (typeof remoteLikes === 'number') {
          setLikeCount(remoteLikes);
          onLikeCountChanged?.(pin.id, remoteLikes);
        }
        if (typeof remoteComments === 'number') {
          onCommentCountChanged?.(pin.id, remoteComments);
        }
      }
    });

    // 2. Authoritative real-time Firestore listener on comments subcollection
    setIsLoadingComments(true);
    const unsubscribeComments = subscribeToComments(pin.id, (commentList) => {
      if (isMounted && activePinIdRef.current === pin.id) {
        setComments(commentList);
        setIsLoadingComments(false);
        onCommentCountChanged?.(pin.id, commentList.length);
      }
    });

    // 3. Parallel check for follow status
    if (user?.uid && user.uid !== pin.userId) {
      checkIfFollowing(user.uid, pin.userId)
        .then((following) => {
          if (isMounted && activePinIdRef.current === pin.id) {
            setIsFollowing(following);
          }
        })
        .catch((err) => {
          console.warn('Error checking follow status:', err);
        });
    } else {
      setIsFollowing(false);
    }

    return () => {
      isMounted = false;
      if (unsubscribeLike) {
        unsubscribeLike();
      }
      if (unsubscribeDoc) {
        unsubscribeDoc();
      }
      if (unsubscribeComments) {
        unsubscribeComments();
      }
    };
  }, [pin.id, pin.userId, user?.uid]);

  const handleToggleLike = async () => {
    if (!user) {
      onAuthRequired();
      return;
    }
    const targetLiked = !isLiked;
    const newCount = targetLiked ? likeCount + 1 : Math.max(0, likeCount - 1);

    // Optimistic UI update
    setIsLiked(targetLiked);
    setLikeCount(newCount);
    onLikeToggled?.(pin.id, targetLiked, newCount);
    onLikeCountChanged?.(pin.id, newCount);

    try {
      const confirmed = await toggleLike(pin.id, user.uid);
      if (activePinIdRef.current === pin.id) {
        setIsLiked(confirmed);
      }
      onLikeToggled?.(pin.id, confirmed, newCount);
      onLikeCountChanged?.(pin.id, newCount);
    } catch (err) {
      console.error('[Heyroq Like] Toggle like failed:', err);
      // Revert on failure
      if (activePinIdRef.current === pin.id) {
        setIsLiked(!targetLiked);
        setLikeCount(likeCount);
      }
      onLikeToggled?.(pin.id, !targetLiked, likeCount);
      onLikeCountChanged?.(pin.id, likeCount);
    }
  };

  const handleToggleFollow = async () => {
    if (!user) {
      onAuthRequired();
      return;
    }
    if (user.uid === pin.userId) return;

    setIsLoadingFollow(true);
    const prevFollowing = isFollowing;
    const nextFollowing = !prevFollowing;
    const delta = nextFollowing ? 1 : -1;

    // 1. Optimistic updates
    setIsFollowing(nextFollowing);
    optimisticUpdateFollowingCount(delta);

    try {
      // 2. Perform atomic document write
      const nowFollowing = await toggleFollow(user.uid, pin.userId);
      setIsFollowing(nowFollowing);

      // 3. Reconcile with Firestore profile state after Cloud Function execution
      setTimeout(async () => {
        try {
          await refreshProfile();
        } catch (e) {
          console.warn('Reconcile current user following count note:', e);
        }
      }, 1000);
    } catch (err) {
      console.error('Follow toggle error:', err);
      // Rollback on failure
      setIsFollowing(prevFollowing);
      optimisticUpdateFollowingCount(-delta);
    } finally {
      setIsLoadingFollow(false);
    }
  };

  const formatCommentTime = (dateString: string) => {
    if (!dateString) return 'just now';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return 'just now';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'just now';
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onAuthRequired();
      return;
    }
    const text = newComment.trim();
    if (!text) return;

    setIsSubmittingComment(true);
    setCommentError(null);
    try {
      const created = await addComment(
        pin.id,
        authUid || user.uid,
        profile?.displayName || user.email?.split('@')[0] || 'Explorer',
        profile?.avatarUrl,
        text,
        replyTo?.parentCommentId ?? replyTo?.id,
      );
      setNewComment('');
      setReplyTo(null);
      setComments((prev) => {
        if (prev.some((c) => c.id === created.id)) return prev;
        const next = [created, ...prev];
        onCommentCountChanged?.(pin.id, next.length);
        return next;
      });
    } catch (err: any) {
      console.error('[Heyroq Comments] Failed to post comment:', err);
      setCommentError(err?.message || 'Failed to post comment. Please try again.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleRequestDeleteComment = (comment: Comment, e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setCommentDeleteModalError(null);
    isCommentDeletingRef.current = false;
    setCommentToDelete(comment);
    setCommentDeleteState('CONFIRMING');
  };

  const handleCancelDeleteComment = () => {
    if (commentDeleteState === 'DELETING' || isCommentDeletingRef.current) return;
    setCommentDeleteState('IDLE');
    setCommentToDelete(null);
    isCommentDeletingRef.current = false;
    setCommentDeleteModalError(null);
  };

  const handleConfirmDeleteComment = async () => {
    // Transition Guard: Only CONFIRMING -> DELETING is permitted
    if (commentDeleteState !== 'CONFIRMING' || !commentToDelete || isCommentDeletingRef.current) {
      console.warn('[Heyroq Comment Delete] Rejected confirm: invalid state or already deleting', {
        commentDeleteState,
        inProgress: isCommentDeletingRef.current,
      });
      return;
    }
    const comment = commentToDelete;

    if (!user || !authUid) {
      onAuthRequired();
      return;
    }

    if (!canDeleteComment(comment)) {
      setCommentDeleteModalError('Permission denied: You can only delete your own comments.');
      return;
    }

    // Synchronous execution lock
    isCommentDeletingRef.current = true;
    setCommentDeleteState('DELETING');
    setCommentDeleteModalError(null);

    // Optimistic UI update: immediately remove comment from visible thread
    const previousComments = [...comments];
    const updatedComments = comments.filter((c) => c.id !== comment.id);
    setComments(updatedComments);
    setDeletingCommentIds((prev) => new Set(prev).add(comment.id));
    onCommentCountChanged?.(pin.id, updatedComments.length);

    try {
      await deleteComment(pin.id, comment.id, authUid, comment.userId);
      console.log('[Heyroq Comments] Comment successfully deleted:', {
        pinId: pin.id,
        commentId: comment.id,
        newCount: updatedComments.length,
      });
      setCommentDeleteState('SUCCESS');
      setCommentToDelete(null);
    } catch (err: any) {
      console.error('[Heyroq Comments] Failed to delete comment, rolling back optimistic UI:', err);
      // Safe rollback on error
      setComments(previousComments);
      onCommentCountChanged?.(pin.id, previousComments.length);
      isCommentDeletingRef.current = false;
      setCommentDeleteState('CONFIRMING');
      setCommentDeleteModalError(err?.message || 'Failed to delete comment. Please try again.');
    } finally {
      setDeletingCommentIds((prev) => {
        const next = new Set(prev);
        next.delete(comment.id);
        return next;
      });
    }
  };

  const restoreWindowScroll = () => {
    if (typeof window !== 'undefined') {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      window.dispatchEvent(new Event('resize'));
    }
  };

  const handleModalClose = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onClose();
  };

  const handleRequestDeletePin = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!user || !authUid) {
      onAuthRequired();
      return;
    }
    setPinDeleteError(null);
    isPinDeletingRef.current = false;
    setPinDeleteState('CONFIRMING');
  };

  const handleCancelDeletePin = () => {
    if (pinDeleteState === 'DELETING' || isPinDeletingRef.current) return;
    setPinDeleteState('IDLE');
    isPinDeletingRef.current = false;
    setPinDeleteError(null);
  };

  const handleConfirmDeletePin = async () => {
    // Transition Guard: Only CONFIRMING -> DELETING is permitted
    if (pinDeleteState !== 'CONFIRMING' || isPinDeletingRef.current) {
      console.warn('[Heyroq Pin Delete] Rejected confirm: not in CONFIRMING state or already deleting', {
        pinDeleteState,
        inProgress: isPinDeletingRef.current,
      });
      return;
    }

    if (!user || !authUid) {
      onAuthRequired();
      return;
    }
    const canDelete = authUid === pin.userId || isAdmin;
    if (!canDelete) {
      setPinDeleteError('Permission denied: You can only delete your own spots.');
      return;
    }

    // Synchronous execution lock
    isPinDeletingRef.current = true;
    setPinDeleteState('DELETING');
    setPinDeleteError(null);

    try {
      await deletePin(pin.id, pin.userId);
      setPinDeleteState('SUCCESS');
      onPinDeleted?.(pin.id);
      handleModalClose();
    } catch (err: any) {
      console.error('[Heyroq Pin] Error deleting pin:', err);
      isPinDeletingRef.current = false;
      setPinDeleteState('CONFIRMING');
      setPinDeleteError(err?.message || 'Failed to delete spot. Please try again.');
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canManage = Boolean(authUid && (authUid === pin.userId || isAdmin));

  // Software keyboard inset on mobile using Visual Viewport API
  // keyboardInset = window.innerHeight - visualViewport.height - visualViewport.offsetTop
  const [keyboardInset, setKeyboardInset] = useState<number>(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [androidModalHeight, setAndroidModalHeight] = useState<number>(0);

  const mobileComposerRef = useRef<HTMLDivElement>(null);
  const isKeyboardOpenRef = useRef<boolean>(false);
  const baseHeightRef = useRef<number>(0);
  const isInputFocusedRef = useRef<boolean>(false);
  const triggerViewportUpdateRef = useRef<(() => void) | null>(null);

  // Platform detection
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  const isAndroid =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateKeyboardInset = () => {
      // Mobile only (< 768px)
      if (window.innerWidth >= 768) {
        setKeyboardInset(0);
        setAndroidModalHeight(0);
        isKeyboardOpenRef.current = false;
        setIsKeyboardOpen(false);
        return;
      }

      const vv = window.visualViewport;
      if (!vv) {
        setKeyboardInset(0);
        setAndroidModalHeight(0);
        isKeyboardOpenRef.current = false;
        setIsKeyboardOpen(false);
        return;
      }

      if (isIOS) {
        // iOS Safari: Layout viewport does NOT resize when virtual keyboard opens.
        // Exact working formula (PRESERVED UNCHANGED):
        // keyboardInset = window.innerHeight - visualViewport.height - visualViewport.offsetTop
        const calculatedInset = window.innerHeight - vv.height - (vv.offsetTop || 0);
        // Clamp to >= 0; only consider virtual keyboard if > 50px
        const inset = calculatedInset > 50 ? Math.max(0, Math.round(calculatedInset)) : 0;
        setKeyboardInset(inset);
        const kbOpen = inset > 0;
        isKeyboardOpenRef.current = kbOpen;
        setIsKeyboardOpen(kbOpen);
        return;
      }

      // =========================================================
      // ANDROID / NON-IOS VIEWPORT HANDLING
      // =========================================================
      // Initialize base height when no input is focused
      if (!isInputFocusedRef.current && (!baseHeightRef.current || vv.height > baseHeightRef.current)) {
        baseHeightRef.current = vv.height;
      }

      // Detect keyboard presence: focused input or substantial viewport shrinkage (> 120px)
      const keyboardDetected =
        isInputFocusedRef.current ||
        (baseHeightRef.current > 0 && baseHeightRef.current - vv.height > 120);

      isKeyboardOpenRef.current = keyboardDetected;
      setIsKeyboardOpen(keyboardDetected);

      // Section 4: When keyboard OPEN on Android:
      // height: visualViewport.height + visualViewport.offsetTop;
      // When keyboard CLOSED: normal full mobile viewport (0 = no override).
      const effectiveModalHeight = keyboardDetected
        ? Math.round(vv.height + (vv.offsetTop || 0))
        : 0;

      setAndroidModalHeight(effectiveModalHeight);
      setKeyboardInset(0);
    };

    triggerViewportUpdateRef.current = updateKeyboardInset;
    updateKeyboardInset();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateKeyboardInset);
      vv.addEventListener('scroll', updateKeyboardInset);
    }
    window.addEventListener('resize', updateKeyboardInset);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateKeyboardInset);
        vv.removeEventListener('scroll', updateKeyboardInset);
      }
      window.removeEventListener('resize', updateKeyboardInset);
      triggerViewportUpdateRef.current = null;
    };
  }, [isIOS, isAndroid]);

  // Lock background body/html/root scroll while Pin Detail is active (critical on iOS Safari)
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPosition = document.body.style.position;
    const originalBodyTop = document.body.style.top;
    const originalBodyLeft = document.body.style.left;
    const originalBodyWidth = document.body.style.width;
    const originalBodyHeight = document.body.style.height;

    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalHtmlPosition = document.documentElement.style.position;
    const originalHtmlHeight = document.documentElement.style.height;

    const rootApp = document.getElementById('heyroq-app-root');
    const originalRootOverflow = rootApp?.style.overflow;

    // Lock html & body to prevent iOS Safari background viewport scrolling
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height = '100%';

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = '0px';
    document.body.style.left = '0px';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    if (rootApp) {
      rootApp.style.overflow = 'hidden';
    }

    return () => {
      // 1. Blur any active input
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // 2. Restore styles exactly
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.position = originalBodyPosition;
      document.body.style.top = originalBodyTop;
      document.body.style.left = originalBodyLeft;
      document.body.style.width = originalBodyWidth;
      document.body.style.height = originalBodyHeight;

      document.documentElement.style.overflow = originalHtmlOverflow;
      document.documentElement.style.position = originalHtmlPosition;
      document.documentElement.style.height = originalHtmlHeight;

      if (rootApp && originalRootOverflow !== undefined) {
        rootApp.style.overflow = originalRootOverflow;
      }

      // 3. Restore window position only after modal unmount / keyboard cleanup
      restoreWindowScroll();
    };
  }, []);

  // Keyboard navigation & Escape key dismiss for modal & sub-dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (commentDeleteState === 'CONFIRMING') {
          handleCancelDeleteComment();
        } else if (pinDeleteState === 'CONFIRMING') {
          handleCancelDeletePin();
        } else if (commentDeleteState === 'IDLE' && pinDeleteState === 'IDLE') {
          handleModalClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commentDeleteState, pinDeleteState, onClose]);

  const displayCommentCount =
    comments.length > 0
      ? comments.length
      : typeof pin.commentCount === 'number'
      ? pin.commentCount
      : 0;

  const renderGallery = (isMobile: boolean) => {
    const activeUrl = images[activeImageIndex];
    const showFallback = !activeUrl || failedImages.has(activeImageIndex);

    return (
      <div
        className={`w-full ${
          isMobile ? '' : 'h-full'
        } bg-[#F3F1ED] dark:bg-[#17181B] relative flex flex-col justify-center shrink-0 overflow-hidden group`}
      >
        <div
          className={`relative w-full ${
            isMobile
              ? 'aspect-[16/10] max-h-[42vh] landscape:max-h-[50vh]'
              : 'aspect-auto max-h-none h-full'
          } flex items-center justify-center overflow-hidden bg-[#F3F1ED] dark:bg-[#17181B]`}
        >
          {showFallback ? (
            <SpotPhotoFallback
              category={pin.category}
              title={pin.title}
              className="w-full h-full"
            />
          ) : (
            <>
              <img
                src={activeUrl}
                alt={pin.title}
                referrerPolicy="no-referrer"
                onError={() =>
                  setFailedImages((prev) => {
                    const next = new Set(prev);
                    next.add(activeImageIndex);
                    return next;
                  })
                }
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 pointer-events-none" />
            </>
          )}

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() =>
                  setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
                }
                className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 p-2 min-w-[40px] min-h-[40px] md:min-w-[38px] md:min-h-[38px] flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition border border-white/20 cursor-pointer z-10 touch-manipulation"
                aria-label="Previous image"
              >
                <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
                }
                className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 p-2 min-w-[40px] min-h-[40px] md:min-w-[38px] md:min-h-[38px] flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition border border-white/20 cursor-pointer z-10 touch-manipulation"
                aria-label="Next image"
              >
                <ChevronRight className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail navigation */}
        {images.length > 1 && (
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-2 px-4 z-10">
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveImageIndex(i)}
                className={`w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-xl overflow-hidden border-2 transition cursor-pointer touch-manipulation ${
                  activeImageIndex === i
                    ? 'border-[var(--brand-primary)] scale-105 shadow-md'
                    : 'border-white/25 opacity-65 hover:opacity-90'
                }`}
                aria-label={`View photo ${i + 1}`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAuthorBar = (isDesktop: boolean) => (
    <div className="p-3.5 sm:p-5 border-b border-[var(--heyroq-divider)] flex items-center justify-between bg-slate-900/[0.02] dark:bg-white/[0.02] shrink-0">
      <div
        onClick={() => pin.userId && onOpenProfile(pin.userId)}
        className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group min-w-0 pr-2 touch-manipulation"
      >
        <UserAvatar
          uid={pin.userId}
          displayName={pin.userName}
          imageUrl={pin.userAvatar}
          size="md"
          className="w-9 h-9 sm:w-10 sm:h-10"
          ringClassName="ring-2 ring-[var(--brand-primary)]/70"
        />
        <div className="min-w-0">
          <p className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-[var(--heyroq-accent-text)] transition truncate">
            @{pin.userName ? pin.userName.replace(/^@/, '') : 'explorer'}
          </p>
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-white/45 truncate">
            <Calendar className="w-3 h-3 shrink-0" />
            <span>{new Date(pin.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {user && user.uid !== pin.userId && (
          <button
            type="button"
            onClick={handleToggleFollow}
            disabled={isLoadingFollow}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer min-h-[36px] touch-manipulation ${
              isFollowing
                ? 'liquid-glass-pill text-slate-800 dark:text-white hover:bg-slate-900/[0.06] dark:hover:bg-white/15'
                : 'heyroq-btn-primary'
            }`}
          >
            {isFollowing ? (
              <>
                <UserCheck className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
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

        {isDesktop && (
          <CloseButton
            onClick={handleModalClose}
            ariaLabel="Close Spot Details"
            className="hidden md:inline-flex"
          />
        )}
      </div>
    </div>
  );

  const renderDetailsAndComments = () => (
    <>
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <CategoryBadge category={pin.category} size="sm" />
          {pin.locationName && (
            <span className="text-xs font-semibold text-slate-600 dark:text-white/55 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
              <span className="truncate max-w-[220px] sm:max-w-none">{pin.locationName}</span>
            </span>
          )}
        </div>
        <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-snug">
          {pin.title}
        </h2>
        <p className="text-sm text-slate-600 dark:text-white/75 leading-relaxed mt-2 whitespace-pre-line">
          {pin.description}
        </p>
      </div>

      {/* Quiet inline tags metadata */}
      {pin.tags && pin.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs font-medium text-slate-500 dark:text-white/50">
          {pin.tags.map((tag, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span aria-hidden="true">·</span>}
              <span>#{tag}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Action Bar (Like, Comment count, Share, Report, Delete) */}
      <div className="flex items-center justify-between py-2.5 border-y border-[var(--heyroq-divider)]">
        <div className="flex items-center gap-3 sm:gap-4">
          <LikeButton
            pinId={pin.id}
            isLiked={isLiked}
            likeCount={likeCount}
            onToggle={handleToggleLike}
            variant="detail"
          />
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-white/55 tabular-nums">
            <MessageCircle className="w-4 h-4 text-slate-400 dark:text-white/40" />
            <span>
              {displayCommentCount} {displayCommentCount === 1 ? 'Comment' : 'Comments'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleShare}
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white hover:bg-slate-900/[0.06] dark:hover:bg-white/10 rounded-full transition cursor-pointer touch-manipulation"
            title="Share link"
            aria-label="Share spot link"
          >
            <Share2 className="w-4 h-4" />
          </button>
          {copied && (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              Copied
            </span>
          )}
          <button
            type="button"
            onClick={() => onOpenReport(pin.id, 'pin', pin.id)}
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 dark:text-white/55 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-900/[0.06] dark:hover:bg-white/10 rounded-full transition cursor-pointer touch-manipulation"
            title="Report content"
            aria-label="Report spot"
          >
            <Flag className="w-4 h-4" />
          </button>
          {canManage && (
            <button
              type="button"
              onClick={handleRequestDeletePin}
              className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 dark:text-white/55 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-900/[0.06] dark:hover:bg-white/10 rounded-full transition cursor-pointer touch-manipulation"
              title="Delete spot"
              aria-label="Delete spot"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Comments Thread */}
      <div className="space-y-3 pt-1">
        <h4 className="text-xs font-bold text-slate-500 dark:text-white/45 tabular-nums">
          Comments ({displayCommentCount})
        </h4>

        {isLoadingComments && comments.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500 dark:text-white/45 font-medium">
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-white/45 py-4 text-center font-medium">
            Be the first explorer to comment on this location.
          </p>
        ) : (
          <div className="space-y-2.5">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2.5 items-start text-xs">
                <button
                  type="button"
                  onClick={() => c.userId && onOpenProfile(c.userId)}
                  aria-label={`Open ${c.userName}'s profile`}
                  className="shrink-0 rounded-full cursor-pointer heyroq-focus-ring"
                >
                  <UserAvatar
                    uid={c.userId}
                    displayName={c.userName}
                    imageUrl={c.userAvatar}
                    size="sm"
                    className="w-7 h-7"
                  />
                </button>
                <div className="flex-1 liquid-glass-card rounded-2xl px-3.5 py-2.5">
                  {c.parentCommentId && (
                    <p className="mb-1 text-[var(--heyroq-text-secondary)]">
                      {comments.find(parent => parent.id === c.parentCommentId)?.userName
                        ? 'Reply to @' + comments.find(parent => parent.id === c.parentCommentId)?.userName
                        : 'Reply to an earlier comment'}
                    </p>
                  )}
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                      @{c.userName}
                    </span>
                    <div className="flex items-center gap-1.5 relative z-10">
                      <span className="text-[10px] font-medium text-slate-500 dark:text-white/45 tabular-nums">
                        {formatCommentTime(c.createdAt)}
                      </span>
                      {user && !c.parentCommentId && (
                        <button type="button" className="min-h-11 px-2 heyroq-focus-ring rounded-full"
                          aria-label={'Reply to ' + c.userName}
                          onClick={() => {
                            setReplyTo(c);
                            const input = [...document.querySelectorAll<HTMLInputElement>('[data-heyroq-comment-input]')]
                              .find(element => element.getClientRects().length);
                            input?.focus();
                          }}>
                          Reply
                        </button>
                      )}
                      {canDeleteComment(c) && (
                        <button
                          type="button"
                          onClick={(e) => handleRequestDeleteComment(c, e)}
                          disabled={deletingCommentIds.has(c.id)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center p-1.5 -my-2 -mr-1 text-slate-400 dark:text-white/40 hover:text-rose-600 dark:hover:text-rose-400 active:text-rose-600 rounded-full transition cursor-pointer disabled:opacity-30 touch-manipulation pointer-events-auto relative z-10"
                          title="Delete comment"
                          aria-label="Delete comment"
                        >
                          <Trash2 className="w-3.5 h-3.5 pointer-events-none" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-700 dark:text-white/80 leading-relaxed">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const renderCommentComposer = (isMobile: boolean) => {
    let mobilePaddingBottom: string;
    if (isIOS) {
      // PRESERVED UNCHANGED: iOS Safari working padding
      mobilePaddingBottom =
        keyboardInset > 0
          ? `${keyboardInset + 12}px`
          : 'calc(0.75rem + env(safe-area-inset-bottom))';
    } else {
      // Android / other platforms:
      // Section 5 & 6: When Android keyboard opens:
      // composer padding-bottom = 12px (normal design padding; no safe area, no keyboard compensation).
      // When keyboard is closed: safe-area-inset-bottom may be used if necessary.
      if (isKeyboardOpen) {
        mobilePaddingBottom = '12px';
      } else {
        mobilePaddingBottom = 'calc(0.75rem + env(safe-area-inset-bottom))';
      }
    }

    return (
      <div
        ref={isMobile ? mobileComposerRef : undefined}
        id={isMobile ? 'pin-detail-mobile-composer' : 'pin-detail-desktop-composer'}
        className={`border-t border-[var(--heyroq-divider)] bg-[var(--heyroq-bg-surface)] shrink-0 p-3 sm:p-4 ${
          isMobile ? 'md:hidden' : 'hidden md:block'
        }`}
        style={isMobile ? { paddingBottom: mobilePaddingBottom } : undefined}
      >
        {commentError && (
          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mb-2 px-1">
            {commentError}
          </p>
        )}
        {user && replyTo && (
          <div role="status" className="flex justify-between items-center gap-2 text-xs">
            <span>Replying to @{replyTo.userName}</span>
            <button type="button" className="min-h-11 px-2 heyroq-focus-ring rounded-full" onClick={() => setReplyTo(null)}>
              Cancel reply
            </button>
          </div>
        )}
        {user ? (
          <form onSubmit={handleAddComment} className="flex gap-2 items-center">
            <input
              type="text"
              data-heyroq-comment-input
              value={newComment}
              onFocus={() => {
                isInputFocusedRef.current = true;
                triggerViewportUpdateRef.current?.();
                setTimeout(() => triggerViewportUpdateRef.current?.(), 150);
              }}
              onBlur={() => {
                isInputFocusedRef.current = false;
                triggerViewportUpdateRef.current?.();
                setTimeout(() => triggerViewportUpdateRef.current?.(), 150);
              }}
              onChange={(e) => {
                setNewComment(e.target.value);
                if (commentError) setCommentError(null);
              }}
              placeholder="Leave a recommendation or note..."
              className="liquid-glass-input flex-1 text-base sm:text-xs rounded-full px-4 py-2 sm:py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/25 transition min-h-[44px] sm:min-h-[40px]"
            />
            <button
              type="submit"
              disabled={isSubmittingComment || !newComment.trim()}
              className="heyroq-btn-primary px-4 py-2 sm:py-2.5 disabled:opacity-40 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 min-h-[44px] sm:min-h-[40px] touch-manipulation"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        ) : (
          <div className="text-center py-1">
            <button
              type="button"
              onClick={onAuthRequired}
              className="text-xs font-bold text-[var(--heyroq-accent-text)] hover:underline cursor-pointer py-1 min-h-[38px] flex items-center justify-center mx-auto"
            >
              Sign in to join the conversation and comment
            </button>
          </div>
        )}
      </div>
    );
  };

  const modalContent = (
    <div
      id="pin-detail-modal-overlay"
      onClick={handleModalClose}
      className={`fixed top-0 left-0 right-0 z-50 w-full ${
        isIOS ? 'bottom-0 h-[100dvh]' : ''
      } overflow-hidden flex items-center justify-center p-0 md:p-4 bg-[var(--heyroq-bg-canvas)] md:bg-[var(--heyroq-backdrop-scrim)] animate-in fade-in`}
      style={
        !isIOS && isAndroid && isKeyboardOpen && androidModalHeight > 0
          ? {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: `${androidModalHeight}px`,
              bottom: 'auto',
              overflow: 'hidden',
            }
          : !isIOS
          ? {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              height: '100%',
              overflow: 'hidden',
            }
          : undefined
      }
    >
      <div
        id={`pin-detail-${pin.id}`}
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--heyroq-bg-surface)] md:liquid-glass-modal md:rounded-[28px] lg:rounded-[32px] w-full h-full md:h-[560px] md:max-h-[86vh] lg:h-[620px] lg:max-h-[88vh] md:max-w-4xl flex flex-col md:flex-row border-0 md:border md:border-[var(--heyroq-glass-border-strong)] text-[var(--heyroq-text-primary)] relative overflow-hidden"
        style={
          !isIOS && isAndroid && isKeyboardOpen && androidModalHeight > 0
            ? { height: `${androidModalHeight}px` }
            : undefined
        }
      >
        {/* ========================================================= */}
        {/* MOBILE VIEW (< 768px): 3-PART FLEX COLUMN                 */}
        {/* 1. HEADER (shrink-0)                                      */}
        {/* 2. SCROLLABLE BODY (flex-1 min-h-0 overflow-y-auto)       */}
        {/* 3. COMMENT COMPOSER (shrink-0)                            */}
        {/* ========================================================= */}
        <div className="flex md:hidden flex-col w-full h-full min-h-0 overflow-hidden">
          {/* 1. HEADER */}
          <header className="shrink-0 z-30 liquid-glass-nav pt-[env(safe-area-inset-top)] px-3 py-2 flex items-center justify-between min-h-[calc(48px+env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={handleModalClose}
              className="flex items-center gap-1 text-slate-800 dark:text-white/85 hover:text-slate-950 dark:hover:text-white px-2 py-1.5 -ml-1 rounded-full active:bg-slate-900/10 dark:active:bg-white/10 transition cursor-pointer min-h-[44px] min-w-[44px] touch-manipulation"
              aria-label="Back to spots"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--brand-primary)] shrink-0" />
              <span className="text-xs font-bold">Spots</span>
            </button>

            <div className="flex-1 min-w-0 px-2 text-center">
              <span className="font-heading text-xs font-bold text-slate-900 dark:text-white truncate block">
                {pin.title}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleShare}
                className="p-2 text-slate-600 dark:text-white/65 hover:text-slate-950 dark:hover:text-white rounded-full active:bg-slate-900/10 dark:active:bg-white/10 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                title="Share link"
                aria-label="Share link"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <CloseButton
                onClick={handleModalClose}
                ariaLabel="Close Spot Details"
              />
            </div>
          </header>

          {/* 2. SCROLLABLE BODY */}
          <div
            id="pin-detail-mobile-scroll"
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {renderGallery(true)}
            <div className="bg-[var(--heyroq-bg-surface)] text-[var(--heyroq-text-primary)] flex flex-col">
              {renderAuthorBar(false)}
              <div className="p-4 space-y-4 pb-12">
                {renderDetailsAndComments()}
              </div>
            </div>
          </div>

          {/* 3. COMMENT COMPOSER */}
          {renderCommentComposer(true)}
        </div>

        {/* ========================================================= */}
        {/* DESKTOP VIEW (>= 768px): 2-COLUMN MODAL                   */}
        {/* ========================================================= */}
        <div className="hidden md:flex flex-row w-full h-full min-h-0 overflow-hidden">
          {/* Left Column: Photos Gallery */}
          <div className="w-1/2 h-full bg-[#F3F1ED] dark:bg-[#17181B] relative flex flex-col justify-center shrink-0 overflow-hidden group">
            {renderGallery(false)}
          </div>

          {/* Right Column: Details & Comments */}
          <div className="w-1/2 h-full flex flex-col min-h-0 bg-[var(--heyroq-bg-surface)] md:bg-transparent text-[var(--heyroq-text-primary)]">
            {renderAuthorBar(true)}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 subtle-glass-scrollbar">
              {renderDetailsAndComments()}
            </div>
            {renderCommentComposer(false)}
          </div>
        </div>
      </div>

      {/* Unified Spot Deletion Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={pinDeleteState === 'CONFIRMING' || pinDeleteState === 'DELETING'}
        title="Delete this spot?"
        description="Are you sure you want to delete this spot? All photos, comments, and details will be permanently removed."
        confirmLabel="Delete spot"
        cancelLabel="Cancel"
        isDeleting={pinDeleteState === 'DELETING'}
        error={pinDeleteError}
        onConfirm={handleConfirmDeletePin}
        onClose={handleCancelDeletePin}
      />

      {/* Unified Comment Deletion Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={Boolean(commentToDelete) && (commentDeleteState === 'CONFIRMING' || commentDeleteState === 'DELETING')}
        title="Delete comment?"
        description="Are you sure you want to delete this comment? This action cannot be undone."
        confirmLabel="Delete comment"
        cancelLabel="Cancel"
        isDeleting={commentDeleteState === 'DELETING'}
        error={commentDeleteModalError}
        onConfirm={handleConfirmDeleteComment}
        onClose={handleCancelDeleteComment}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
