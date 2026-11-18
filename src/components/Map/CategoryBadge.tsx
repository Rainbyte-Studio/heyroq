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
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }
> = {
  Food: {
    label: 'Food',
    bg: 'bg-[#D97706]',
    text: 'text-[#B45309] dark:text-[#FBBF24]',
    ring: 'ring-[#D97706]',
    icon: Utensils,
  },
  Travel: {
    label: 'Travel',
    bg: 'bg-[#2563EB]',
    text: 'text-[#1D4ED8] dark:text-[#60A5FA]',
    ring: 'ring-[#2563EB]',
    icon: Compass,
  },
  Nature: {
    label: 'Nature',
    bg: 'bg-[#059669]',
    text: 'text-[#047857] dark:text-[#34D399]',
    ring: 'ring-[#059669]',
    icon: Trees,
  },
  Events: {
    label: 'Events',
    bg: 'bg-[#7C3AED]',
    text: 'text-[#6D28D9] dark:text-[#A78BFA]',
    ring: 'ring-[#7C3AED]',
    icon: Sparkles,
  },
  Activities: {
    label: 'Activities',
    bg: 'bg-[#E11D48]',
    text: 'text-[#BE123C] dark:text-[#FB7185]',
    ring: 'ring-[#E11D48]',
    icon: Flame,
  },
  'Hidden Gems': {
    label: 'Hidden Gems',
    bg: 'bg-[#E87924]',
    text: 'text-[#B95318] dark:text-[#FF9B43]',
    ring: 'ring-[#E87924]',
    icon: Gem,
  },
  Photography: {
    label: 'Photography',
    bg: 'bg-[#0891B2]',
    text: 'text-[#0E7490] dark:text-[#22D3EE]',
    ring: 'ring-[#0891B2]',
    icon: Camera,
  },
  Other: {
    label: 'Other',
    bg: 'bg-[#66676B]',
    text: 'text-[#5C5D61] dark:text-[#B0B0B5]',
    ring: 'ring-[#66676B]',
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
  showDot = false,
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
    ? 'bg-[var(--brand-primary)]/12 dark:bg-[var(--brand-primary)]/18 border border-[var(--brand-primary)] text-[#202124] dark:text-[#F5F4F1] font-semibold shadow-[0_1px_4px_rgba(232,121,36,0.14)]'
    : onClick
      ? 'bg-[#F3F1ED] dark:bg-[#2B2C31] text-[#4D4E52] dark:text-[#B0B0B5] hover:text-[#202124] dark:hover:text-[#F5F4F1] hover:bg-[#ECE9E3] dark:hover:bg-[#33343A] border border-[#E6E3DE] dark:border-[#38393E] font-medium'
      : 'bg-[#FFFFFF]/95 dark:bg-[#222327]/95 text-[#202124] dark:text-[#F5F4F1] border border-[#E6E3DE] dark:border-[#38393E] font-medium shadow-sm';

  const badgeClasses = `inline-flex items-center whitespace-nowrap tracking-normal shrink-0 transition-colors duration-150 ${sizeClasses} ${stateClasses} ${className}`;

  const content = (
    <>
      {showIcon && (
        <Icon
          strokeWidth={1.75}
          className={`${iconSizes} ${
            active ? 'text-[var(--brand-primary)]' : 'text-[#5C5D61] dark:text-[#B0B0B5]'
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
        <Check className="w-3 h-3 text-[var(--brand-primary)] shrink-0" strokeWidth={2.5} />
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
