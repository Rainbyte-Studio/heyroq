import React, { useEffect, useRef, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemePreference, useTheme } from '../../context/ThemeContext';

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

interface ThemeSelectorProps {
  /** Compact mode uses slightly tighter padding for dropdowns */
  compact?: boolean;
  /** Show subtle status line indicating active appearance when System is selected */
  showSystemHint?: boolean;
  /** Optional id prefix for deterministic DOM testing */
  idPrefix?: string;
  className?: string;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  compact = false,
  showSystemHint = false,
  idPrefix = 'theme-selector',
  className = '',
}) => {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = THEME_OPTIONS.findIndex((opt) => opt.value === preference);
    if (currentIndex === -1) return;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % THEME_OPTIONS.length;
      setPreference(THEME_OPTIONS[nextIndex].value);
      buttonRefs.current[nextIndex]?.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = (currentIndex - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
      setPreference(THEME_OPTIONS[prevIndex].value);
      buttonRefs.current[prevIndex]?.focus();
    }
  };

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label="Appearance"
        onKeyDown={handleKeyDown}
        className={`liquid-glass-segmented grid grid-cols-3 items-center gap-1 p-1 rounded-xl ${
          compact ? 'min-h-[38px]' : 'min-h-[42px]'
        }`}
      >
        {THEME_OPTIONS.map(({ value, label, Icon }, index) => {
          const isSelected = preference === value;
          return (
            <button
              key={value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              id={`${idPrefix}-${value}-btn`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setPreference(value)}
              className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all duration-150 heyroq-focus-ring ${
                compact ? 'px-2 py-1.5 text-[11px]' : 'px-2.5 py-2 text-xs'
              } ${
                isSelected
                  ? 'bg-white dark:bg-white/14 text-slate-900 dark:text-white shadow-[0_1px_3px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.16)] border border-slate-900/8 dark:border-white/14'
                  : 'text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white/90 hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05] border border-transparent'
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 shrink-0 ${
                  isSelected
                    ? 'text-[var(--brand-primary)]'
                    : 'text-slate-500 dark:text-white/50'
                }`}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      {showSystemHint && (
        <p className="mt-1.5 px-1 text-[11px] text-slate-500 dark:text-white/45 flex items-center justify-between">
          <span>
            {preference === 'system'
              ? `Matching device setting (${resolvedTheme === 'dark' ? 'Dark' : 'Light'})`
              : `${preference === 'dark' ? 'Dark' : 'Light'} appearance active`}
          </span>
        </p>
      )}
    </div>
  );
};

interface ThemePopoverButtonProps {
  id?: string;
  align?: 'left' | 'right';
  showLabelOnDesktop?: boolean;
}

export const ThemePopoverButton: React.FC<ThemePopoverButtonProps> = ({
  id = 'nav-appearance-btn',
  align = 'right',
  showLabelOnDesktop = false,
}) => {
  const { preference, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const ActiveIcon =
    preference === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;

  const activeLabel =
    preference === 'system'
      ? 'System'
      : preference === 'dark'
        ? 'Dark'
        : 'Light';

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Appearance: ${activeLabel}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Appearance (${activeLabel})`}
        className="liquid-glass-pill w-10 h-10 min-w-[40px] min-h-[40px] sm:w-auto px-2.5 rounded-full flex items-center justify-center gap-1.5 text-slate-700 dark:text-white/80 hover:text-slate-950 dark:hover:text-white transition-all duration-150 active:scale-[0.98] cursor-pointer heyroq-focus-ring"
      >
        <ActiveIcon className="w-4 h-4 text-slate-700 dark:text-white/80" />
        {showLabelOnDesktop && (
          <span className="hidden md:inline text-xs font-semibold">{activeLabel}</span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Appearance settings"
          className={`liquid-glass-popover absolute top-full mt-2 w-64 rounded-2xl p-3 z-50 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-white/60">
              Appearance
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-white/45 capitalize">
              {resolvedTheme}
            </span>
          </div>
          <ThemeSelector
            compact
            showSystemHint
            idPrefix={`${id}-option`}
          />
        </div>
      )}
    </div>
  );
};
