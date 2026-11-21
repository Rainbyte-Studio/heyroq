import React, { useEffect, useState } from 'react';

export type InfoPageRoute = '/about' | '/privacy' | '/terms' | '/support';
export type SettingsSection = 'account' | 'notifications';
export type SettingsRoute = '/settings' | '/settings/account' | '/settings/notifications';
export type EngagementPageRoute = '/notifications' | '/activity';
export type AppRoute = '/' | InfoPageRoute | SettingsRoute | EngagementPageRoute;

export const APP_ROUTES = Object.freeze({
  map: '/' as AppRoute,
  about: '/about' as InfoPageRoute,
  privacy: '/privacy' as InfoPageRoute,
  terms: '/terms' as InfoPageRoute,
  support: '/support' as InfoPageRoute,
  settings: '/settings' as SettingsRoute,
  settingsAccount: '/settings/account' as SettingsRoute,
  settingsNotifications: '/settings/notifications' as SettingsRoute,
  notifications: '/notifications' as EngagementPageRoute,
  activity: '/activity' as EngagementPageRoute,
});

export const INFO_PAGE_NAV_ITEMS: ReadonlyArray<{
  readonly route: InfoPageRoute;
  readonly shortLabel: string;
  readonly fullTitle: string;
}> = Object.freeze([
  { route: '/about', shortLabel: 'About', fullTitle: 'About Heyroq' },
  { route: '/privacy', shortLabel: 'Privacy', fullTitle: 'Privacy Policy' },
  { route: '/terms', shortLabel: 'Terms', fullTitle: 'Terms of Service' },
  { route: '/support', shortLabel: 'Support', fullTitle: 'Help & Support' },
]);

const ROUTE_CHANGE_EVENT = 'heyroq:routechange';

export type PendingMapDestination =
  | { type: 'pin'; id: string }
  | { type: 'profile'; id: string }
  | { type: 'progression'; id?: string };

let pendingMapDestination: PendingMapDestination | null = null;

export function setPendingMapDestination(destination: PendingMapDestination | null): void {
  pendingMapDestination = destination;
}

export function consumePendingMapDestination(): PendingMapDestination | null {
  const next = pendingMapDestination;
  pendingMapDestination = null;
  return next;
}

/**
 * Normalizes any URL pathname into a clean, canonical Heyroq route.
 * Unknown paths safely resolve to `'/'` (the map workspace) without throwing.
 */
export function resolveAppRoute(rawPathname: string | null | undefined): AppRoute {
  if (typeof rawPathname !== 'string' || !rawPathname.trim()) {
    return '/';
  }

  // Strip query string or hash fragment if passed inadvertently
  const withoutQueryOrHash = rawPathname.split('?')[0]?.split('#')[0] ?? '/';
  const cleaned = withoutQueryOrHash.trim().replace(/\/+$/, '').toLowerCase();

  switch (cleaned) {
    case '/about':
      return '/about';
    case '/privacy':
      return '/privacy';
    case '/terms':
      return '/terms';
    case '/support':
      return '/support';
    case '/settings':
      return '/settings';
    case '/settings/account':
      return '/settings/account';
    case '/settings/notifications':
      return '/settings/notifications';
    case '/notifications':
      return '/notifications';
    case '/activity':
      return '/activity';
    case '':
    case '/':
    default:
      return '/';
  }
}

export function isInfoPageRoute(route: AppRoute): route is InfoPageRoute {
  return (
    route === '/about' ||
    route === '/privacy' ||
    route === '/terms' ||
    route === '/support'
  );
}

export function isSettingsRoute(route: AppRoute): route is SettingsRoute {
  return (
    route === '/settings' ||
    route === '/settings/account' ||
    route === '/settings/notifications'
  );
}

export function getSettingsSectionFromRoute(route: AppRoute): SettingsSection {
  return route === '/settings/notifications' ? 'notifications' : 'account';
}

export function isEngagementPageRoute(route: AppRoute): route is EngagementPageRoute {
  return route === '/notifications' || route === '/activity';
}

export function getDocumentTitleForRoute(route: AppRoute): string {
  switch (route) {
    case '/about':
      return 'About Heyroq — Heyroq';
    case '/privacy':
      return 'Privacy Policy — Heyroq';
    case '/terms':
      return 'Terms of Service — Heyroq';
    case '/support':
      return 'Help & Support — Heyroq';
    case '/settings':
    case '/settings/account':
      return 'Settings — Heyroq';
    case '/settings/notifications':
      return 'Notifications & Activity — Settings — Heyroq';
    case '/notifications':
      return 'Notifications — Heyroq';
    case '/activity':
      return 'Activity — Heyroq';
    case '/':
    default:
      return 'Heyroq';
  }
}

export function getCurrentBrowserRoute(): AppRoute {
  if (typeof window === 'undefined') {
    return '/';
  }
  return resolveAppRoute(window.location.pathname);
}

/**
 * Navigates to an internal Heyroq route using the HTML5 History API without triggering
 * a full browser reload or tearing down Firebase authentication state.
 */
export function navigateToRoute(
  target: AppRoute,
  options?: { replace?: boolean }
): void {
  const canonical = resolveAppRoute(target);
  if (typeof window === 'undefined') return;

  const currentPath = window.location.pathname;
  if (resolveAppRoute(currentPath) !== canonical || currentPath !== canonical) {
    if (options?.replace) {
      window.history.replaceState({ heyroqRoute: canonical }, '', canonical);
    } else {
      window.history.pushState({ heyroqRoute: canonical }, '', canonical);
    }
  }

  if (typeof document !== 'undefined') {
    document.title = getDocumentTitleForRoute(canonical);
  }

  window.dispatchEvent(new CustomEvent<AppRoute>(ROUTE_CHANGE_EVENT, { detail: canonical }));
}

/**
 * React hook subscribing to both browser Back/Forward (`popstate`) and programmatic
 * SPA navigation (`navigateToRoute`), keeping URL and document title synchronized.
 */
export function useAppRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => getCurrentBrowserRoute());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFromLocation = () => {
      const next = getCurrentBrowserRoute();
      setRoute(next);
      if (typeof document !== 'undefined') {
        document.title = getDocumentTitleForRoute(next);
      }
    };

    syncFromLocation();

    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener(ROUTE_CHANGE_EVENT, syncFromLocation as EventListener);

    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener(ROUTE_CHANGE_EVENT, syncFromLocation as EventListener);
    };
  }, []);

  return route;
}

export interface AppLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: AppRoute;
  replace?: boolean;
  onBeforeNavigate?: () => void;
}

/**
 * Accessible internal route anchor (`<a href={to}>`) that preserves native browser
 * middle-click / Cmd+Click / right-click behavior while handling plain primary clicks via SPA routing.
 */
export const AppLink: React.FC<AppLinkProps> = ({
  to,
  replace,
  onBeforeNavigate,
  onClick,
  children,
  ...rest
}) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;

    // Allow browser default behavior for new-tab / modifier-key clicks
    if (
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      rest.target === '_blank'
    ) {
      return;
    }

    e.preventDefault();
    onBeforeNavigate?.();
    navigateToRoute(to, { replace });
  };

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};
