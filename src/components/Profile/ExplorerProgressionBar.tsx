import React from 'react';
import { UserProgressionSummary } from '../../types';
import { EXPLORER_LEVELS } from '../../services/gamificationService';
import {
  Compass,
  Trophy,
  Sparkles,
  ChevronRight,
  MapPin,
  Globe,
  Heart,
  Award,
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
      <div className={`p-4 rounded-2xl bg-white/[0.03] border border-white/10 animate-pulse ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 w-32 bg-white/10 rounded-full" />
          <div className="h-5 w-20 bg-white/10 rounded-full" />
        </div>
        <div className="h-2 w-full bg-white/10 rounded-full" />
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
      className={`rounded-2xl p-4 bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/10 backdrop-blur-md relative overflow-hidden transition hover:border-white/20 ${className}`}
    >
      {/* Subtle background glow */}
      <div
        className="absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ backgroundColor: currentDef.badgeColor }}
      />

      {/* Header: Level Badge, XP, and Achievements Action */}
      <div className="flex items-center justify-between gap-2 mb-3 relative z-10">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shadow-md border border-white/20"
            style={{
              backgroundColor: `${currentDef.badgeColor}25`,
              color: currentDef.badgeColor,
            }}
          >
            <Compass className="w-4 h-4" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border"
                style={{
                  backgroundColor: `${currentDef.badgeColor}15`,
                  borderColor: `${currentDef.badgeColor}40`,
                  color: currentDef.badgeColor,
                }}
              >
                LVL {level}
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-white">
                {title}
              </h4>
            </div>
            <p className="text-[10px] font-mono text-white/50 mt-0.5">
              {isMaxLevel ? (
                <span className="text-[#FF8C75] font-semibold">Max Explorer Rank Reached</span>
              ) : (
                <span>{xpRemaining.toLocaleString()} XP to Level {level + 1}</span>
              )}
            </p>
          </div>
        </div>

        {onOpenAchievements && (
          <button
            type="button"
            onClick={onOpenAchievements}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#FF5F40]/50 text-white/80 hover:text-white transition cursor-pointer"
            title="View Explorer Achievements & Badges"
          >
            <Trophy className="w-3.5 h-3.5 text-[#FF5F40] group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-mono font-bold tracking-tight">
              {unlockedAchievements}/{totalAchievements}
            </span>
            <ChevronRight className="w-3 h-3 text-white/40 group-hover:text-white transition-colors" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative z-10 mb-3">
        <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden p-0.5 border border-white/10">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out relative"
            style={{
              width: `${Math.max(4, Math.min(100, progressPercent))}%`,
              background: `linear-gradient(90deg, ${currentDef.badgeColor}, #FF5F40)`,
            }}
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
          </div>
        </div>

        <div className="flex justify-between items-center text-[9px] font-mono text-white/40 mt-1.5">
          <span>{xp.toLocaleString()} XP</span>
          <span>{progressPercent}%</span>
          <span>{isMaxLevel ? 'MAX' : `${nextLevelXp.toLocaleString()} XP`}</span>
        </div>
      </div>

      {/* Quick Footprint Stats Chips */}
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/5 text-center">
        <div className="bg-black/30 rounded-xl py-1 px-1.5 border border-white/5">
          <div className="flex items-center justify-center gap-1 text-white/40 text-[9px]">
            <MapPin className="w-2.5 h-2.5 text-[#FF5F40]" />
            <span className="uppercase font-bold tracking-wider">Spots</span>
          </div>
          <span className="font-mono text-xs font-bold text-white block mt-0.5">
            {summary?.totalSpotsCount ?? 0}
          </span>
        </div>

        <div className="bg-black/30 rounded-xl py-1 px-1.5 border border-white/5">
          <div className="flex items-center justify-center gap-1 text-white/40 text-[9px]">
            <Award className="w-2.5 h-2.5 text-amber-400" />
            <span className="uppercase font-bold tracking-wider">Cities</span>
          </div>
          <span className="font-mono text-xs font-bold text-white block mt-0.5">
            {summary?.citiesCount ?? 0}
          </span>
        </div>

        <div className="bg-black/30 rounded-xl py-1 px-1.5 border border-white/5">
          <div className="flex items-center justify-center gap-1 text-white/40 text-[9px]">
            <Globe className="w-2.5 h-2.5 text-blue-400" />
            <span className="uppercase font-bold tracking-wider">Nations</span>
          </div>
          <span className="font-mono text-xs font-bold text-white block mt-0.5">
            {summary?.countriesCount ?? 0}
          </span>
        </div>

        <div className="bg-black/30 rounded-xl py-1 px-1.5 border border-white/5">
          <div className="flex items-center justify-center gap-1 text-white/40 text-[9px]">
            <Heart className="w-2.5 h-2.5 text-rose-400" />
            <span className="uppercase font-bold tracking-wider">Likes</span>
          </div>
          <span className="font-mono text-xs font-bold text-white block mt-0.5">
            {summary?.likesReceivedCount ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
};
