import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  UserProgressionSummary,
  UserAchievement,
  XpEvent,
  AchievementCategory,
  ProgressionTier,
} from '../../types';
import {
  subscribeToUserProgression,
  subscribeToUserAchievements,
  subscribeToVerifiedGeographicCounts,
  fetchUserXpEvents,
  ACHIEVEMENTS_CATALOG,
  EXPLORER_LEVELS,
} from '../../services/gamificationService';
import { CloseButton } from '../Common/CloseButton';
import {
  geographyAchievementsAvailable,
  getAchievementPresentation,
  type VerifiedGeographicCounts,
} from '../../config/achievementAvailability';
import {
  Trophy,
  Compass,
  MapPin,
  Navigation,
  Award,
  Building,
  Milestone,
  Globe,
  Plane,
  Sparkles,
  Utensils,
  Trees,
  Camera,
  Heart,
  Flame,
  Star,
  Users,
  ShieldCheck,
  Crown,
  CheckCircle2,
  History,
  TrendingUp,
  Loader2,
} from 'lucide-react';

interface AchievementsModalProps {
  userId: string;
  displayName?: string;
  onClose: () => void;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
  focusAchievementId?: string;
}

const CATEGORIES: { id: 'All' | AchievementCategory; label: string }[] = [
  { id: 'All', label: 'All Badges' },
  { id: 'Exploration', label: 'Exploration' },
  { id: 'Geography', label: 'Geography' },
  { id: 'Discovery', label: 'Discovery' },
  { id: 'Community', label: 'Community' },
  { id: 'Special', label: 'Special' },
];

export const AchievementsModal: React.FC<AchievementsModalProps> = ({
  userId,
  displayName,
  onClose,
  fallbackFocusRef,
  focusAchievementId,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'All' | AchievementCategory>('All');
  const [summary, setSummary] = useState<UserProgressionSummary | null>(null);
  const [achievements, setAchievements] = useState<UserAchievement[]>([]);
  const [geographicProgress, setGeographicProgress] = useState<{
    userId: string;
    counts: VerifiedGeographicCounts | null;
  } | null>(null);
  const [xpEvents, setXpEvents] = useState<XpEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pointerStartedOnBackdrop = useRef(false);
  const dialogId = useId();

  useEffect(() => {
    if (!focusAchievementId || isLoading) return;
    const target = document.getElementById(dialogId + '-achievement-' + focusAchievementId);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }, [dialogId, focusAchievementId, isLoading]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const trigger = document.activeElement;
    dialog.showModal();
    closeButtonRef.current?.focus();

    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
        if (trigger !== document.body && document.activeElement === trigger) return;
      }
      fallbackFocusRef?.current?.focus({ preventScroll: true });
    };
  }, [fallbackFocusRef]);

  useEffect(() => {
    if (!userId) return;

    setIsLoading(true);

    const unsubProgression = subscribeToUserProgression(userId, (data) => {
      setSummary(data);
      setIsLoading(false);
    });

    const unsubAchievements = subscribeToUserAchievements(userId, (list) => {
      setAchievements(list);
    });

    const unsubGeography = geographyAchievementsAvailable
      ? subscribeToVerifiedGeographicCounts(userId, (counts) => setGeographicProgress({ userId, counts }))
      : undefined;

    fetchUserXpEvents(userId, 10).then((events) => {
      setXpEvents(events);
    });

    return () => {
      unsubProgression();
      unsubAchievements();
      unsubGeography?.();
    };
  }, [userId]);

  const level = summary?.level || 1;
  const currentDef = EXPLORER_LEVELS.find((l) => l.level === level) || EXPLORER_LEVELS[0];
  const isMaxLevel = level >= 10;
  const currentBaseXp = summary?.currentLevelBaseXp ?? currentDef.minXp;
  const nextLevelXp = summary?.nextLevelXp ?? (isMaxLevel ? currentDef.minXp : currentDef.maxXp + 1);
  const xp = summary?.xp || 0;
  const xpRemaining = isMaxLevel ? 0 : Math.max(0, nextLevelXp - xp);

  const calculatedPercent = isMaxLevel
    ? 100
    : Math.min(
        100,
        Math.max(
          0,
          Math.round(((xp - currentBaseXp) / Math.max(1, nextLevelXp - currentBaseXp)) * 100)
        )
      );
  const progressPercent = summary?.progressPercent ?? calculatedPercent;

  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;
  const totalCount = ACHIEVEMENTS_CATALOG.length;
  const completionPercent = Math.round((unlockedCount / Math.max(1, totalCount)) * 100);

  const verifiedGeography = geographicProgress?.userId === userId ? geographicProgress.counts : null;
  const filteredAchievements = achievements.filter((a) => {
    if (selectedCategory === 'All') return true;
    return a.category === selectedCategory;
  }).map((achievement) => ({ achievement, ...getAchievementPresentation(achievement, { verifiedGeography }) }));
  const showGeographyNotice = selectedCategory === 'Geography'
    && filteredAchievements.length > 0
    && filteredAchievements.every(({ state }) => state !== 'available')
    && filteredAchievements.some(({ state }) => state === 'coming_soon');

  const renderIcon = (iconName: string, isUnlocked: boolean, tier: ProgressionTier) => {
    const iconProps = { className: 'w-5 h-5', 'aria-hidden': true as const };
    let iconElement: React.ReactNode;

    switch (iconName) {
      case 'Compass':
        iconElement = <Compass {...iconProps} />;
        break;
      case 'MapPin':
        iconElement = <MapPin {...iconProps} />;
        break;
      case 'Navigation':
        iconElement = <Navigation {...iconProps} />;
        break;
      case 'Award':
        iconElement = <Award {...iconProps} />;
        break;
      case 'Building':
        iconElement = <Building {...iconProps} />;
        break;
      case 'Milestone':
        iconElement = <Milestone {...iconProps} />;
        break;
      case 'Globe':
        iconElement = <Globe {...iconProps} />;
        break;
      case 'Plane':
        iconElement = <Plane {...iconProps} />;
        break;
      case 'Sparkles':
        iconElement = <Sparkles {...iconProps} />;
        break;
      case 'Utensils':
        iconElement = <Utensils {...iconProps} />;
        break;
      case 'Trees':
        iconElement = <Trees {...iconProps} />;
        break;
      case 'Camera':
        iconElement = <Camera {...iconProps} />;
        break;
      case 'Heart':
        iconElement = <Heart {...iconProps} />;
        break;
      case 'Flame':
        iconElement = <Flame {...iconProps} />;
        break;
      case 'Star':
        iconElement = <Star {...iconProps} />;
        break;
      case 'Users':
        iconElement = <Users {...iconProps} />;
        break;
      case 'ShieldCheck':
        iconElement = <ShieldCheck {...iconProps} />;
        break;
      case 'Crown':
        iconElement = <Crown {...iconProps} />;
        break;
      default:
        iconElement = <Trophy {...iconProps} />;
    }

    const tierColors: Record<ProgressionTier, { bg: string; text: string; border: string }> = {
      bronze: {
        bg: 'bg-amber-500/12 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-600/25 dark:border-amber-700/40',
      },
      silver: {
        bg: 'bg-slate-500/12 dark:bg-slate-800/60',
        text: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-500/25 dark:border-slate-500/40',
      },
      gold: {
        bg: 'bg-yellow-500/14 dark:bg-yellow-950/40',
        text: 'text-yellow-700 dark:text-yellow-400',
        border: 'border-yellow-600/30 dark:border-yellow-600/40',
      },
      platinum: {
        bg: 'bg-cyan-500/12 dark:bg-cyan-950/40',
        text: 'text-cyan-700 dark:text-cyan-400',
        border: 'border-cyan-600/25 dark:border-cyan-500/40',
      },
    };

    const colors = tierColors[tier] || tierColors.bronze;

    return (
      <div
        className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-colors shrink-0 ${
          isUnlocked
            ? `${colors.bg} ${colors.text} ${colors.border}`
            : 'bg-slate-900/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-slate-900/10 dark:border-white/10'
        }`}
      >
        {iconElement}
      </div>
    );
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      // Native cancel closes this dialog. Keep the underlying profile open.
      event.stopPropagation();
    }
    if (event.key !== 'Tab') return;

    // The native modal makes the page inert. Wrap at the current boundaries
    // so Tab never lands in browser chrome when the dialog content changes.
    const dialog: HTMLDialogElement = event.currentTarget;
    const tabbable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, summary, iframe, [tabindex], [contenteditable]',
    )).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled')
      && !element.closest('[inert]') && element.getClientRects().length > 0
      && getComputedStyle(element).visibility === 'visible');
    const first = tabbable[0];
    const last = tabbable.at(-1);
    const boundary = event.shiftKey ? first : last;
    const wrapTarget = event.shiftKey ? last : first;
    if (document.activeElement === boundary && wrapTarget) {
      event.preventDefault();
      wrapTarget.focus();
    }
  };

  return (
    <dialog
      id="achievements-modal"
      ref={dialogRef}
      aria-labelledby={`${dialogId}-title`}
      className="liquid-glass-backdrop fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden p-3 backdrop:bg-transparent open:flex open:items-center open:justify-center sm:p-4"
      onPointerDown={(event) => {
        pointerStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget && pointerStartedOnBackdrop.current) onClose();
        pointerStartedOnBackdrop.current = false;
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={handleDialogKeyDown}
    >
      <div
        className="liquid-glass-modal rounded-[28px] sm:rounded-[32px] max-w-3xl lg:max-w-4xl w-full max-h-[min(92dvh,100%)] overflow-hidden flex flex-col text-slate-900 dark:text-white relative"
      >
        {/* Header Bar */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-900/8 dark:border-white/10 flex items-center justify-between relative z-20">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[var(--brand-primary)]/12 border border-[var(--brand-primary)]/25 flex items-center justify-center text-[var(--brand-primary)] shrink-0">
              <Trophy aria-hidden="true" className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 id={`${dialogId}-title`} className="font-heading text-lg sm:text-xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
                Explorer Progression
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-200 line-clamp-2 wrap-anywhere">
                {displayName ? `${displayName}'s journey & milestones` : 'Earn XP by discovering genuine places'}
              </p>
            </div>
          </div>

          <CloseButton
            ref={closeButtonRef}
            onClick={onClose}
            ariaLabel="Close Explorer Progression"
            className="focus-visible:outline-[var(--heyroq-accent-text)]!"
          />
        </div>

        {/* Modal Scroll Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain subtle-glass-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
          {/* Main Progression Card */}
          <div className="liquid-glass-card rounded-3xl p-5 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 relative z-10">
              <div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-1">
                  <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--heyroq-accent-text)] tabular-nums">
                    LEVEL {level}
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-white/25">
                    ·
                  </span>
                  <span className="font-heading text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                    {currentDef.title}
                  </span>
                </div>
                <p className="text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200">
                  {isMaxLevel ? (
                    <span className="text-[var(--heyroq-accent-text)] font-semibold">
                      Highest explorer rank achieved
                    </span>
                  ) : (
                    <span>
                      {xpRemaining.toLocaleString()} XP remaining until Level {level + 1}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div>
                  <span className="font-heading text-xl font-bold tabular-nums text-slate-900 dark:text-white block">
                    {xp.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    Total XP
                  </span>
                </div>
                <div className="h-8 w-px bg-slate-900/10 dark:bg-white/10" />
                <div>
                  <span className="font-heading text-xl font-bold tabular-nums text-[var(--heyroq-accent-text)] block">
                    {unlockedCount} / {totalCount}
                  </span>
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                    Badges ({completionPercent}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Level XP Progress Bar */}
            <div className="space-y-1.5 relative z-10">
              <div className="h-2.5 w-full bg-slate-900/8 dark:bg-black/50 rounded-full overflow-hidden p-0.5 border border-slate-900/8 dark:border-white/10">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${Math.max(4, Math.min(100, progressPercent))}%`,
                    background: `linear-gradient(90deg, ${currentDef.badgeColor}, #E87924)`,
                  }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] font-medium tabular-nums text-slate-700 dark:text-slate-200">
                <span>{xp.toLocaleString()} XP</span>
                <span className="text-slate-700 dark:text-slate-200 font-semibold">{progressPercent}%</span>
                <span>{isMaxLevel ? 'MAX' : `${nextLevelXp.toLocaleString()} XP`}</span>
              </div>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div role="group" aria-label="Filter badges by category" className="flex flex-wrap items-center gap-2 pb-1">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              const catCount =
                cat.id === 'All'
                  ? totalCount
                  : ACHIEVEMENTS_CATALOG.filter((a) => a.category === cat.id).length;
              const catUnlocked =
                cat.id === 'All'
                  ? unlockedCount
                  : achievements.filter((a) => a.category === cat.id && a.isUnlocked).length;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  aria-pressed={isSelected}
                  className={`px-3.5 py-2 min-h-[44px] rounded-full text-xs font-semibold transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 cursor-pointer heyroq-focus-ring focus-visible:outline-[var(--heyroq-accent-text)]! ${
                    isSelected
                      ? 'heyroq-btn-primary'
                      : 'liquid-glass-pill text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span aria-hidden="true" className="text-[10px] font-semibold tabular-nums">
                    {catUnlocked}/{catCount}
                  </span>
                  <span className="sr-only">{catUnlocked} of {catCount} completed</span>
                </button>
              );
            })}
          </div>

          {showGeographyNotice && (
            <p className="rounded-xl border border-slate-500/25 bg-slate-500/8 px-3.5 py-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
              Geographic Achievements are coming soon. Explore new places and share your discoveries while we prepare verified location-based rewards.
            </p>
          )}

          {/* Achievements Grid */}
          {isLoading ? (
            <div role="status" className="py-16 flex flex-col items-center justify-center gap-3 text-slate-700 dark:text-slate-200">
              <Loader2 className="w-7 h-7 animate-spin text-[var(--brand-primary)]" />
              <span className="text-xs font-medium">Loading progression...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredAchievements.map(({ achievement: ach, state, progress }) => {
                const isComingSoon = state === 'coming_soon';
                const isCompleted = state === 'completed';
                const earnedDate = isCompleted && ach.category === 'Geography' && ach.unlockedAt
                  ? new Date(ach.unlockedAt)
                  : null;
                const badgeTitleId = `${dialogId}-${ach.id}-title`;
                const badgeStatusId = `${dialogId}-${ach.id}-status`;

                return (
                  <article
                    key={ach.id}
                    id={dialogId + '-achievement-' + ach.id}
                    tabIndex={focusAchievementId === ach.id ? -1 : undefined}
                    aria-labelledby={badgeTitleId}
                    aria-describedby={isComingSoon || isCompleted || progress === null ? badgeStatusId : undefined}
                    className={`liquid-glass-card rounded-2xl p-4 transition-colors relative overflow-hidden flex flex-col justify-between ${
                      ach.isUnlocked
                        ? 'border-slate-900/14 dark:border-white/20'
                        : isComingSoon
                          ? 'border-dashed! border-slate-500/35! dark:border-slate-400/35!'
                          : ''
                    }`}
                  >
                    {/* Top Row: Icon, Title & Reward */}
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          {renderIcon(ach.iconName, ach.isUnlocked, ach.tier)}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 id={badgeTitleId} className="font-heading text-sm font-bold tracking-tight text-slate-900 dark:text-white wrap-anywhere">
                                {ach.title}
                              </h3>
                              {ach.isUnlocked && (
                                <CheckCircle2 aria-hidden="true" className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                              )}
                            </div>
                            <span className="text-[11px] capitalize text-slate-700 dark:text-slate-200">
                              {ach.category} · {ach.tier}
                            </span>
                          </div>
                        </div>

                        <span className="tabular-nums text-xs font-bold text-[var(--heyroq-accent-text)] shrink-0">
                          +{ach.xpReward} XP
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed mb-3">
                        {ach.description}
                      </p>
                    </div>

                    {isComingSoon ? (
                      // Locked legacy counts have no verified provenance. Keep
                      // the goal visible without presenting them as progress.
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        <span id={badgeStatusId} className="rounded-full border border-slate-500/25 bg-slate-500/10 px-2.5 py-1 font-semibold text-slate-700 dark:text-slate-200">
                          Coming Soon
                        </span>
                        <span className="tabular-nums">Goal {ach.target}</span>
                      </div>
                    ) : progress === null ? (
                      <div className="flex flex-wrap justify-between gap-2 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        <span id={badgeStatusId}>Progress unavailable</span>
                        <span className="tabular-nums">Goal {ach.target}</span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex justify-between items-center text-[11px] font-medium tabular-nums mb-1.5 text-slate-700 dark:text-slate-200">
                          <span id={isCompleted ? badgeStatusId : undefined}>
                            {isCompleted ? (
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                Completed
                              </span>
                            ) : (
                              <span>Progress</span>
                            )}
                          </span>
                          <span>
                            {progress} / {ach.target}
                          </span>
                        </div>

                        <div aria-hidden="true" className="h-1.5 w-full bg-slate-900/8 dark:bg-black/50 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              ach.isUnlocked
                                ? 'bg-gradient-to-r from-emerald-500 to-[var(--brand-primary)]'
                                : 'bg-slate-400 dark:bg-white/40'
                            }`}
                            style={{ width: `${Math.min(100, Math.round((progress / Math.max(1, ach.target)) * 100))}%` }}
                          />
                        </div>
                        {earnedDate && Number.isFinite(earnedDate.getTime()) && (
                          <p className="mt-2 text-[11px] text-slate-700 dark:text-slate-200">
                            Unlocked <time dateTime={ach.unlockedAt ?? undefined}>{earnedDate.toLocaleDateString(undefined, {
                              dateStyle: 'medium', timeZone: 'UTC',
                            })}</time>
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* XP History Ledger Section */}
          <div className="pt-2 border-t border-slate-900/8 dark:border-white/10">
            <button
              type="button"
              onClick={() => setShowHistory((shown) => !shown)}
              aria-labelledby={`${dialogId}-history-label`}
              aria-expanded={showHistory}
              aria-controls={`${dialogId}-history`}
              className="liquid-glass-card w-full flex items-center justify-between gap-2 p-3.5 min-h-[44px] rounded-xl text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white transition-colors duration-150 cursor-pointer heyroq-focus-ring focus-visible:outline-[var(--heyroq-accent-text)]!"
            >
              <div className="flex items-center gap-2">
                <History aria-hidden="true" className="w-4 h-4 shrink-0 text-[var(--brand-primary)]" />
                <span id={`${dialogId}-history-label`}>Recent Milestone Activity</span>
              </div>
              <span className="text-[11px] font-medium tabular-nums text-slate-700 dark:text-slate-200">
                {showHistory ? 'Hide' : `View ${xpEvents.length} Recent Events`}
              </span>
            </button>

            <div id={`${dialogId}-history`} hidden={!showHistory} className="mt-3 space-y-2 animate-in fade-in duration-150">
              {showHistory && (xpEvents.length === 0 ? (
                  <p className="text-xs text-slate-700 dark:text-slate-200 text-center py-4">
                    No recent XP events recorded yet.
                  </p>
                ) : (
                  xpEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="liquid-glass-card p-3 rounded-xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TrendingUp aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 dark:text-white block wrap-anywhere">
                            {ev.description}
                          </span>
                          <span className="text-[11px] font-medium tabular-nums text-slate-700 dark:text-slate-200">
                            {new Date(ev.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                      <span className="tabular-nums font-bold text-[var(--heyroq-accent-text)] text-xs shrink-0">
                        +{ev.xpEarned} XP
                      </span>
                    </div>
                  ))
              ))}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
};
