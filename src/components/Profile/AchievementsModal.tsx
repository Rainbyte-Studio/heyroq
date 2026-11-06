import React, { useState, useEffect } from 'react';
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
  fetchUserXpEvents,
  EXPLORER_LEVELS,
} from '../../services/gamificationService';
import {
  X,
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
  Lock,
  History,
  TrendingUp,
  Loader2,
} from 'lucide-react';

interface AchievementsModalProps {
  userId: string;
  displayName?: string;
  onClose: () => void;
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
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'All' | AchievementCategory>('All');
  const [summary, setSummary] = useState<UserProgressionSummary | null>(null);
  const [achievements, setAchievements] = useState<UserAchievement[]>([]);
  const [xpEvents, setXpEvents] = useState<XpEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

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

    fetchUserXpEvents(userId, 10).then((events) => {
      setXpEvents(events);
    });

    return () => {
      unsubProgression();
      unsubAchievements();
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
  const totalCount = achievements.length || 18;
  const completionPercent = Math.round((unlockedCount / Math.max(1, totalCount)) * 100);

  const filteredAchievements = achievements.filter((a) => {
    if (selectedCategory === 'All') return true;
    return a.category === selectedCategory;
  });

  const renderIcon = (iconName: string, isUnlocked: boolean, tier: ProgressionTier) => {
    const iconProps = { className: 'w-5 h-5' };
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
      bronze: { bg: 'bg-amber-950/40', text: 'text-amber-400', border: 'border-amber-700/40' },
      silver: { bg: 'bg-slate-800/60', text: 'text-slate-300', border: 'border-slate-500/40' },
      gold: { bg: 'bg-yellow-950/40', text: 'text-yellow-400', border: 'border-yellow-600/40' },
      platinum: { bg: 'bg-cyan-950/40', text: 'text-cyan-400', border: 'border-cyan-500/40' },
    };

    const colors = tierColors[tier] || tierColors.bronze;

    return (
      <div
        className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${
          isUnlocked
            ? `${colors.bg} ${colors.text} ${colors.border} shadow-lg`
            : 'bg-white/5 text-white/30 border-white/10'
        }`}
      >
        {iconElement}
      </div>
    );
  };

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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-2xl animate-in fade-in"
    >
      <div
        id="achievements-modal"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0E0E0E] rounded-[28px] sm:rounded-[32px] max-w-3xl lg:max-w-4xl w-full max-h-[92dvh] sm:max-h-[92vh] overflow-hidden shadow-2xl flex flex-col border border-white/20 text-white relative"
      >
        {/* Header Bar */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10 flex items-center justify-between bg-black/40 relative z-20">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#FF5F40]/15 border border-[#FF5F40]/30 flex items-center justify-center text-[#FF5F40] shrink-0">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white flex items-center gap-2 truncate">
                Explorer Progression
              </h2>
              <p className="text-[11px] sm:text-xs text-white/50 truncate">
                {displayName ? `${displayName}'s journey & milestones` : 'Earn XP by discovering genuine places'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close achievements"
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-full transition cursor-pointer border border-white/15 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
          {/* Main Progression Card */}
          <div className="rounded-3xl p-5 bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/15 relative overflow-hidden">
            <div
              className="absolute -right-12 -top-12 w-44 h-44 rounded-full blur-3xl opacity-20 pointer-events-none"
              style={{ backgroundColor: currentDef.badgeColor }}
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border"
                    style={{
                      backgroundColor: `${currentDef.badgeColor}20`,
                      borderColor: `${currentDef.badgeColor}50`,
                      color: currentDef.badgeColor,
                    }}
                  >
                    LEVEL {level}
                  </span>
                  <span className="text-lg font-black uppercase tracking-wider text-white">
                    {currentDef.title}
                  </span>
                </div>
                <p className="text-xs font-mono text-white/60">
                  {isMaxLevel ? (
                    <span className="text-[#FF8C75]">Highest explorer rank achieved</span>
                  ) : (
                    <span>{xpRemaining.toLocaleString()} XP remaining until Level {level + 1}</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div>
                  <span className="text-xl font-black font-mono text-white block">
                    {xp.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/40">
                    Total XP
                  </span>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div>
                  <span className="text-xl font-black font-mono text-[#FF5F40] block">
                    {unlockedCount} / {totalCount}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/40">
                    Badges ({completionPercent}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Level XP Progress Bar */}
            <div className="space-y-1.5 relative z-10">
              <div className="h-2.5 w-full bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/10">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.max(4, Math.min(100, progressPercent))}%`,
                    background: `linear-gradient(90deg, ${currentDef.badgeColor}, #FF5F40)`,
                  }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono text-white/40">
                <span>{xp.toLocaleString()} XP</span>
                <span className="text-white/60 font-bold">{progressPercent}%</span>
                <span>{isMaxLevel ? 'MAX' : `${nextLevelXp.toLocaleString()} XP`}</span>
              </div>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              const catCount =
                cat.id === 'All'
                  ? achievements.length
                  : achievements.filter((a) => a.category === cat.id).length;
              const catUnlocked =
                cat.id === 'All'
                  ? unlockedCount
                  : achievements.filter((a) => a.category === cat.id && a.isUnlocked).length;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer border ${
                    isSelected
                      ? 'bg-[#FF5F40] text-white border-[#FF5F40] shadow-md shadow-[#FF5F40]/20'
                      : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border-white/10'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-black/30 text-white' : 'bg-white/10 text-white/50'
                    }`}
                  >
                    {catUnlocked}/{catCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Achievements Grid */}
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-white/40">
              <Loader2 className="w-7 h-7 animate-spin text-[#FF5F40]" />
              <span className="text-xs font-mono">Synchronizing progression state...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredAchievements.map((ach) => {
                const percent = Math.min(100, Math.round((ach.progress / Math.max(1, ach.target)) * 100));

                return (
                  <div
                    key={ach.id}
                    className={`rounded-2xl p-4 border transition-all relative overflow-hidden flex flex-col justify-between ${
                      ach.isUnlocked
                        ? 'bg-gradient-to-br from-white/[0.06] to-white/[0.02] border-white/20'
                        : 'bg-black/30 border-white/10 opacity-75'
                    }`}
                  >
                    {/* Top Row: Icon, Title & Reward */}
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-3">
                          {renderIcon(ach.iconName, ach.isUnlocked, ach.tier)}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-sm font-black uppercase tracking-tight text-white">
                                {ach.title}
                              </h4>
                              {ach.isUnlocked && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">
                              {ach.category} · {ach.tier}
                            </span>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-md bg-[#FF5F40]/15 border border-[#FF5F40]/30 text-[#FF5F40] font-mono text-[10px] font-black shrink-0">
                          +{ach.xpReward} XP
                        </span>
                      </div>

                      <p className="text-xs text-white/60 leading-relaxed mb-3">
                        {ach.description}
                      </p>
                    </div>

                    {/* Bottom Row: Progress */}
                    <div>
                      <div className="flex justify-between items-center text-[10px] font-mono mb-1.5 text-white/50">
                        <span>
                          {ach.isUnlocked ? (
                            <span className="text-emerald-400 font-bold">Completed</span>
                          ) : (
                            <span>Progress</span>
                          )}
                        </span>
                        <span>
                          {ach.progress} / {ach.target}
                        </span>
                      </div>

                      <div className="h-1.5 w-full bg-black/60 rounded-full overflow-hidden border border-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            ach.isUnlocked
                              ? 'bg-gradient-to-r from-emerald-500 to-[#FF5F40]'
                              : 'bg-white/40'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* XP History Ledger Section */}
          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 text-xs font-bold text-white/70 hover:text-white transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#FF5F40]" />
                <span>Recent Milestone Activity</span>
              </div>
              <span className="text-[10px] font-mono text-white/40">
                {showHistory ? 'Hide' : `View ${xpEvents.length} Recent Events`}
              </span>
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2 animate-in fade-in">
                {xpEvents.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-4 font-mono">
                    No recent XP events recorded yet.
                  </p>
                ) : (
                  xpEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-semibold text-white block">{ev.description}</span>
                          <span className="text-[10px] font-mono text-white/40">
                            {new Date(ev.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[#FF8C75] text-xs">
                        +{ev.xpEarned} XP
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
