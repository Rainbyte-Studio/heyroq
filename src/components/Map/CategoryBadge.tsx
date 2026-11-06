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
  { label: string; bg: string; text: string; ring: string; icon: React.ComponentType<{ className?: string }> }
> = {
  Food: { label: 'Food', bg: 'bg-amber-400', text: 'text-amber-400', ring: 'ring-amber-400', icon: Utensils },
  Travel: { label: 'Travel', bg: 'bg-blue-400', text: 'text-blue-400', ring: 'ring-blue-400', icon: Compass },
  Nature: { label: 'Nature', bg: 'bg-emerald-400', text: 'text-emerald-400', ring: 'ring-emerald-400', icon: Trees },
  Events: { label: 'Events', bg: 'bg-purple-400', text: 'text-purple-400', ring: 'ring-purple-400', icon: Sparkles },
  Activities: { label: 'Activities', bg: 'bg-rose-400', text: 'text-rose-400', ring: 'ring-rose-400', icon: Flame },
  'Hidden Gems': { label: 'Hidden Gems', bg: 'bg-indigo-400', text: 'text-indigo-400', ring: 'ring-indigo-400', icon: Gem },
  Photography: { label: 'Photography', bg: 'bg-cyan-400', text: 'text-cyan-400', ring: 'ring-cyan-400', icon: Camera },
  Other: { label: 'Other', bg: 'bg-slate-400', text: 'text-slate-400', ring: 'ring-slate-400', icon: MapPin },
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
    xs: 'px-2.5 py-0.5 text-[9px] gap-1.5 rounded-full',
    sm: 'px-3 py-1 text-[10px] gap-1.5 rounded-full',
    md: 'px-3.5 py-1.5 text-xs gap-1.5 rounded-full',
  }[size];

  const iconSizes = {
    xs: 'w-2.5 h-2.5',
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
  }[size];

  const dotSizes = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2 h-2',
  }[size];

  const stateClasses = active
    ? 'bg-[#FF5F40]/15 border border-[#FF5F40] text-white font-black shadow-[0_0_12px_rgba(255,95,64,0.25)] ring-1 ring-[#FF5F40]/40'
    : onClick
    ? 'bg-white/10 text-white/80 hover:text-white hover:bg-white/20 border border-white/10 font-bold backdrop-blur-md'
    : 'bg-white/10 text-white/90 border border-white/15 font-bold backdrop-blur-md shadow-sm';

  const badgeClasses = `inline-flex items-center whitespace-nowrap uppercase tracking-wider shrink-0 transition-all duration-150 ${sizeClasses} ${stateClasses} ${className}`;

  const content = (
    <>
      {showIcon && (
        <Icon
          className={`${iconSizes} ${
            active ? 'text-[#FF5F40]' : config.text
          } shrink-0`}
        />
      )}
      <span className="truncate">{config.label}</span>
      {showDot && (
        <span
          className={`${dotSizes} rounded-full ${config.bg} shadow-[0_0_6px_currentColor] shrink-0`}
        />
      )}
      {active && onClick && (
        <span className="w-3.5 h-3.5 rounded-full bg-[#FF5F40] flex items-center justify-center text-white shrink-0 shadow-sm ml-0.5">
          <Check className="w-2.5 h-2.5 stroke-[3]" />
        </span>
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
        className={`${badgeClasses} cursor-pointer`}
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
