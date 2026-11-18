import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const HEYROQ_THEME_STORAGE_KEY = 'heyroq-theme-preference';

export const THEME_COLOR_TOKENS: Record<ResolvedTheme, string> = {
  light: '#FAF9F6',
  dark: '#17181B',
};

export function isValidThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemPrefersDark ? 'dark' : 'light';
}

export function readStoredThemePreference(
  storage?: Pick<Storage, 'getItem'> | null
): ThemePreference {
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!targetStorage) return 'system';
    const raw = targetStorage.getItem(HEYROQ_THEME_STORAGE_KEY);
    return isValidThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function persistThemePreference(
  preference: ThemePreference,
  storage?: Pick<Storage, 'setItem'> | null
): boolean {
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!targetStorage) return false;
    targetStorage.setItem(HEYROQ_THEME_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

export function getSystemPrefersDark(
  matchMediaFn?: ((query: string) => MediaQueryList) | null
): boolean {
  try {
    const matcher =
      matchMediaFn !== undefined
        ? matchMediaFn
        : typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia.bind(window)
          : null;
    if (!matcher) return true;
    return matcher('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

export function applyResolvedThemeToRoot(
  root: HTMLElement | null,
  resolvedTheme: ResolvedTheme,
  preference: ThemePreference
): void {
  if (!root) return;
  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.classList.toggle('light', resolvedTheme === 'light');
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;

  if (typeof document !== 'undefined') {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', THEME_COLOR_TOKENS[resolvedTheme]);
    }
  }
}

export interface ThemeContextValue {
  /** Explicit user selection: 'light' | 'dark' | 'system' */
  preference: ThemePreference;
  /** Active rendered appearance: 'light' | 'dark' */
  resolvedTheme: ResolvedTheme;
  /** Current OS prefers-color-scheme: dark state */
  systemPrefersDark: boolean;
  /** Update and persist user theme preference */
  setPreference: (next: ThemePreference) => void;
}

const fallbackContextValue: ThemeContextValue = {
  preference: 'system',
  resolvedTheme: 'dark',
  systemPrefersDark: true,
  setPreference: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(fallbackContextValue);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredThemePreference()
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    getSystemPrefersDark()
  );

  const resolvedTheme = useMemo(
    () => resolveThemePreference(preference, systemPrefersDark),
    [preference, systemPrefersDark]
  );

  // Synchronize root <html> classes, data attributes, color-scheme, and theme-color meta
  useEffect(() => {
    if (typeof document === 'undefined') return;
    applyResolvedThemeToRoot(document.documentElement, resolvedTheme, preference);
  }, [resolvedTheme, preference]);

  // Listen to live OS prefers-color-scheme changes without reload
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    let mediaQuery: MediaQueryList;
    try {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }

    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setSystemPrefersDark(Boolean(event.matches));
    };

    // Ensure state matches current OS value on mount
    setSystemPrefersDark(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    // Legacy Safari fallback
    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  // Cross-tab synchronization via storage events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== HEYROQ_THEME_STORAGE_KEY) return;
      const next = isValidThemePreference(event.newValue) ? event.newValue : 'system';
      setPreferenceState(next);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    if (!isValidThemePreference(next)) return;
    setPreferenceState(next);
    persistThemePreference(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      systemPrefersDark,
      setPreference,
    }),
    [preference, resolvedTheme, systemPrefersDark, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
