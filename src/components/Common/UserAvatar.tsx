import React, { useEffect, useState } from 'react';
import { Camera, Compass, Loader2 } from 'lucide-react';
import { resolveAvatarDescriptor } from '../../utils/avatarUtils';

export type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'profile';

export interface UserAvatarProps {
  uid?: string | null;
  displayName?: string | null;
  imageUrl?: string | null;
  size?: UserAvatarSize;
  className?: string;
  ringClassName?: string;
  editable?: boolean;
  isUploading?: boolean;
  onEditClick?: () => void;
  ariaLabel?: string;
}

const SIZE_CLASSES: Record<
  UserAvatarSize,
  {
    container: string;
    text: string;
    icon: string;
    badge: string;
    badgeIcon: string;
  }
> = {
  xs: {
    container: 'w-6 h-6',
    text: 'text-[10px]',
    icon: 'w-3.5 h-3.5',
    badge: 'w-4 h-4 -bottom-0.5 -right-0.5',
    badgeIcon: 'w-2.5 h-2.5',
  },
  sm: {
    container: 'w-8 h-8',
    text: 'text-xs',
    icon: 'w-4 h-4',
    badge: 'w-5 h-5 -bottom-0.5 -right-0.5',
    badgeIcon: 'w-3 h-3',
  },
  md: {
    container: 'w-10 h-10',
    text: 'text-sm',
    icon: 'w-5 h-5',
    badge: 'w-6 h-6 -bottom-0.5 -right-0.5',
    badgeIcon: 'w-3 h-3',
  },
  lg: {
    container: 'w-16 h-16',
    text: 'text-xl',
    icon: 'w-7 h-7',
    badge: 'w-7 h-7 bottom-0 right-0',
    badgeIcon: 'w-3.5 h-3.5',
  },
  profile: {
    container: 'w-24 h-24 sm:w-28 sm:h-28',
    text: 'text-2xl sm:text-3xl',
    icon: 'w-10 h-10 sm:w-11 sm:h-11',
    badge: 'w-9 h-9 sm:w-10 sm:h-10 -bottom-0.5 -right-0.5',
    badgeIcon: 'w-4 h-4',
  },
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  uid,
  displayName,
  imageUrl,
  size = 'md',
  className = '',
  ringClassName = 'ring-1 ring-inset ring-slate-900/10 dark:ring-white/18',
  editable = false,
  isUploading = false,
  onEditClick,
  ariaLabel,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    setImageLoaded(false);
  }, [imageUrl]);

  const descriptor = resolveAvatarDescriptor({
    uid,
    displayName,
    imageUrl,
    imageFailed,
  });

  const preset = SIZE_CLASSES[size];
  const gradientStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(135deg, ${descriptor.color.bg} 0%, ${descriptor.color.bgDeep} 100%)`,
    backgroundColor: descriptor.color.bg,
  };

  const innerCircle = (
    <div
      role={editable ? undefined : 'img'}
      aria-label={editable ? undefined : ariaLabel || descriptor.ariaLabel}
      style={descriptor.mode !== 'image' ? gradientStyle : undefined}
      className={`${preset.container} rounded-full relative overflow-hidden shrink-0 select-none flex items-center justify-center ${
        descriptor.mode === 'image' ? 'bg-slate-200 dark:bg-neutral-800' : ''
      } ${ringClassName} ${className}`}
    >
      {descriptor.mode === 'image' && descriptor.imageUrl ? (
        <>
          {!imageLoaded && (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-slate-200 dark:bg-white/10 animate-pulse"
            />
          )}
          <img
            src={descriptor.imageUrl}
            alt={ariaLabel || descriptor.ariaLabel}
            referrerPolicy="no-referrer"
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageFailed(true);
              setImageLoaded(false);
            }}
            className={`w-full h-full object-cover transition-opacity duration-150 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      ) : descriptor.mode === 'initials' ? (
        <span
          aria-hidden="true"
          className={`font-heading font-bold tracking-tight text-white leading-none ${preset.text}`}
        >
          {descriptor.initials}
        </span>
      ) : (
        <Compass aria-hidden="true" className={`${preset.icon} text-white/95`} />
      )}

      {isUploading && (
        <div className="absolute inset-0 bg-slate-950/65 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--brand-primary)]" />
        </div>
      )}
    </div>
  );

  if (!editable || !onEditClick) {
    return innerCircle;
  }

  return (
    <div className="relative inline-flex shrink-0 group/avatar">
      <button
        type="button"
        onClick={onEditClick}
        disabled={isUploading}
        aria-label={ariaLabel || 'Manage profile photo'}
        className="relative rounded-full cursor-pointer focus:outline-none heyroq-focus-ring disabled:cursor-not-allowed"
      >
        {innerCircle}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-slate-950/0 group-hover/avatar:bg-slate-950/30 transition-colors duration-150 pointer-events-none"
        />
        <span
          aria-hidden="true"
          className={`${preset.badge} absolute rounded-full liquid-glass-pill bg-white/95 dark:bg-neutral-900/95 border border-slate-900/12 dark:border-white/20 shadow-md flex items-center justify-center text-slate-800 dark:text-white group-hover/avatar:border-[var(--brand-primary)] group-hover/avatar:text-[var(--brand-primary)] transition-colors duration-150`}
        >
          {isUploading ? (
            <Loader2 className={`${preset.badgeIcon} animate-spin text-[var(--brand-primary)]`} />
          ) : (
            <Camera className={preset.badgeIcon} />
          )}
        </span>
      </button>
    </div>
  );
};
