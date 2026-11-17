import React from 'react';
import {
  Utensils,
  Compass,
  Trees,
  Sparkles,
  Flame,
  Gem,
  Camera,
  MapPin,
  Check,
} from 'lucide-react';
import { PinCategory } from '../../types';
import { normalizeCategory } from '../../utils/categoryUtils';

export const CATEGORY_CONFIG: Record<
  PinCategory,
  {
    label: string;
    bg: string;
    text: string;
    ring: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  Food: {
    label: 'Food',
    bg: 'bg-amber-500 dark:bg-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-500 dark:ring-amber-400',
    icon: Utensils,
  },
  Travel: {
    label: 'Travel',
    bg: 'bg-blue-500 dark:bg-blue-400',
    text: 'text-blue-600 dark:text-blue-400',
    ring: 'ring-blue-500 dark:ring-blue-400',
    icon: Compass,
  },
  Nature: {
    label: 'Nature',
    bg: 'bg-emerald-500 dark:bg-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-500 dark:ring-emerald-400',
    icon: Trees,
  },
  Events: {
    label: 'Events',
    bg: 'bg-purple-500 dark:bg-purple-400',
    text: 'text-purple-600 dark:text-purple-400',
    ring: 'ring-purple-500 dark:ring-purple-400',
    icon: Sparkles,
  },
  Activities: {
    label: 'Activities',
    bg: 'bg-rose-500 dark:bg-rose-400',
    text: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-500 dark:ring-rose-400',
    icon: Flame,
  },
  'Hidden Gems': {
    label: 'Hidden Gems',
    bg: 'bg-indigo-500 dark:bg-indigo-400',
    text: 'text-indigo-600 dark:text-indigo-400',
    ring: 'ring-indigo-500 dark:ring-indigo-400',
    icon: Gem,
  },
  Photography: {
    label: 'Photography',
    bg: 'bg-cyan-600 dark:bg-cyan-400',
    text: 'text-cyan-700 dark:text-cyan-400',
    ring: 'ring-cyan-600 dark:ring-cyan-400',
    icon: Camera,
  },
  Other: {
    label: 'Other',
    bg: 'bg-slate-500 dark:bg-slate-400',
    text: 'text-slate-600 dark:text-slate-400',
    ring: 'ring-slate-500 dark:ring-slate-400',
    icon: MapPin,
  },
};

export interface CategoryBadgeProps {
  category: PinCategory | string;
  active?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  showDot?: boolean;
  showIcon?: boolean;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  category,
  active = false,
  onClick,
  size = 'md',
  className = '',
  showDot = true,
  showIcon = true,
}) => {
  const normalizedKey = normalizeCategory(category) || 'Other';

  const config = CATEGORY_CONFIG[normalizedKey] || CATEGORY_CONFIG.Other;
  const Icon = config.icon;

  const sizeClasses = {
    xs: 'px-2.5 py-0.5 text-[11px] leading-tight gap-1.5 rounded-full',
    sm: 'h-8 px-3 text-xs gap-1.5 rounded-full',
    md: 'h-9 px-3.5 text-xs gap-1.5 rounded-full',
  }[size];

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-3.5 h-3.5',
  }[size];

  const dotSizes = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
  }[size];

  const stateClasses = active
    ? 'bg-[var(--brand-primary)]/14 dark:bg-[var(--brand-primary)]/20 border border-[var(--brand-primary)] text-slate-950 dark:text-white font-semibold shadow-[0_1px_4px_rgba(232,121,36,0.14)]'
    : onClick
      ? 'bg-slate-900/[0.035] dark:bg-white/[0.06] text-slate-700 dark:text-white/82 hover:text-slate-950 dark:hover:text-white hover:bg-slate-900/[0.07] dark:hover:bg-white/[0.11] border border-slate-900/10 dark:border-white/12 font-medium'
      : 'bg-white/95 dark:bg-[#18191C]/92 text-slate-800 dark:text-white/92 border border-slate-900/10 dark:border-white/14 font-semibold shadow-sm';

  const badgeClasses = `inline-flex items-center whitespace-nowrap tracking-normal shrink-0 transition-colors duration-150 ${sizeClasses} ${stateClasses} ${className}`;

  const content = (
    <>
      {showIcon && (
        <Icon
          className={`${iconSizes} ${
            active ? 'text-[var(--brand-primary)]' : config.text
          } shrink-0`}
        />
      )}
      <span className="truncate">{config.label}</span>
      {showDot && !active && (
        <span
          className={`${dotSizes} rounded-full ${config.bg} shrink-0`}
        />
      )}
      {active && onClick && (
        <Check className="w-3 h-3 text-[var(--brand-primary)] stroke-[2.5] shrink-0" />
      )}
    </>
  );

  const elementId = `cat-badge-${config.label.toLowerCase().replace(/\s+/g, '-')}`;

  if (onClick) {
    return (
      <button
        id={elementId}
        type="button"
        onClick={onClick}
        className={`${badgeClasses} cursor-pointer heyroq-focus-ring`}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      id={elementId}
      className={`${badgeClasses} select-none pointer-events-none`}
    >
      {content}
    </span>
  );
};
