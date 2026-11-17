import React from 'react';
import { UserProgressionSummary } from '../../types';
import { EXPLORER_LEVELS } from '../../services/gamificationService';
import {
  Compass,
  Trophy,
  ChevronRight,
} from 'lucide-react';

interface ExplorerProgressionBarProps {
  summary: UserProgressionSummary | null;
  isLoading?: boolean;
  onOpenAchievements?: () => void;
  className?: string;
}

export const ExplorerProgressionBar: React.FC<ExplorerProgressionBarProps> = ({
  summary,
  isLoading = false,
  onOpenAchievements,
  className = '',
}) => {
  if (isLoading && !summary) {
    return (
      <div className={`liquid-glass-card p-4 rounded-2xl animate-pulse ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 w-32 bg-slate-900/10 dark:bg-white/10 rounded-full" />
          <div className="h-5 w-20 bg-slate-900/10 dark:bg-white/10 rounded-full" />
        </div>
        <div className="h-2 w-full bg-slate-900/10 dark:bg-white/10 rounded-full" />
      </div>
    );
  }

  const level = summary?.level || 1;
  const title = summary?.title || 'New Explorer';
  const xp = summary?.xp || 0;
  const currentDef = EXPLORER_LEVELS.find((l) => l.level === level) || EXPLORER_LEVELS[0];
  const isMaxLevel = level >= 10;
  const currentBaseXp = summary?.currentLevelBaseXp ?? currentDef.minXp;
  const nextLevelXp = summary?.nextLevelXp ?? (isMaxLevel ? currentDef.minXp : currentDef.maxXp + 1);
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
  const unlockedAchievements = summary?.unlockedAchievementsCount ?? 0;
  const totalAchievements = summary?.totalAchievementsCount ?? 18;

  return (
    <div
      id="explorer-progression-bar"
      className={`liquid-glass-card rounded-2xl p-4 relative overflow-hidden transition-colors ${className}`}
    >
      {/* Header: Level, XP, and Achievements Action */}
      <div className="flex items-center justify-between gap-2 mb-3 relative z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold border border-slate-900/10 dark:border-white/15 shrink-0"
            style={{
              backgroundColor: `${currentDef.badgeColor}20`,
              color: currentDef.badgeColor,
            }}
          >
            <Compass className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-heading text-[11px] font-bold tabular-nums text-[var(--heyroq-accent-text)]">
                LVL {level}
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-white/25">
                ·
              </span>
              <h4 className="font-heading text-xs font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {title}
              </h4>
            </div>
            <p className="text-[11px] font-medium tabular-nums text-slate-500 dark:text-white/50 mt-0.5">
              {isMaxLevel ? (
                <span className="text-[var(--heyroq-accent-text)] font-semibold">
                  Max Explorer Rank Reached
                </span>
              ) : (
                <span>
                  {xpRemaining.toLocaleString()} XP to Level {level + 1}
                </span>
              )}
            </p>
          </div>
        </div>

        {onOpenAchievements && (
          <button
            type="button"
            onClick={onOpenAchievements}
            className="liquid-glass-pill group flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-full text-slate-800 dark:text-white/85 hover:text-slate-950 dark:hover:text-white transition-colors duration-150 cursor-pointer shrink-0 heyroq-focus-ring"
            title="View Explorer Achievements & Badges"
          >
            <Trophy className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
            <span className="font-heading text-xs tabular-nums font-bold tracking-tight">
              {unlockedAchievements}/{totalAchievements}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-white/45 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative z-10 mb-3">
        <div className="h-2 w-full bg-slate-900/8 dark:bg-black/50 rounded-full overflow-hidden p-0.5 border border-slate-900/8 dark:border-white/10">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${Math.max(4, Math.min(100, progressPercent))}%`,
              background: `linear-gradient(90deg, ${currentDef.badgeColor}, #E87924)`,
            }}
          />
        </div>

        <div className="flex justify-between items-center text-[10px] font-medium tabular-nums text-slate-500 dark:text-white/45 mt-1.5">
          <span>{xp.toLocaleString()} XP</span>
          <span>{progressPercent}%</span>
          <span>{isMaxLevel ? 'MAX' : `${nextLevelXp.toLocaleString()} XP`}</span>
        </div>
      </div>

      {/* Quick Footprint Stats Row (clean hairline grid without nested bordered boxes) */}
      <div className="grid grid-cols-4 divide-x divide-slate-900/8 dark:divide-white/10 pt-2.5 border-t border-slate-900/8 dark:border-white/10 text-center">
        <div className="px-1">
          <span className="font-heading tabular-nums text-xs font-bold text-slate-900 dark:text-white block">
            {summary?.totalSpotsCount ?? 0}
          </span>
          <span className="text-[10px] font-medium text-slate-500 dark:text-white/45">Spots</span>
        </div>

        <div className="px-1">
          <span className="font-heading tabular-nums text-xs font-bold text-slate-900 dark:text-white block">
            {summary?.citiesCount ?? 0}
          </span>
          <span className="text-[10px] font-medium text-slate-500 dark:text-white/45">Cities</span>
        </div>

        <div className="px-1">
          <span className="font-heading tabular-nums text-xs font-bold text-slate-900 dark:text-white block">
            {summary?.countriesCount ?? 0}
          </span>
          <span className="text-[10px] font-medium text-slate-500 dark:text-white/45">Nations</span>
        </div>

        <div className="px-1">
          <span className="font-heading tabular-nums text-xs font-bold text-slate-900 dark:text-white block">
            {summary?.likesReceivedCount ?? 0}
          </span>
          <span className="text-[10px] font-medium text-slate-500 dark:text-white/45">Likes</span>
        </div>
      </div>
    </div>
  );
};
