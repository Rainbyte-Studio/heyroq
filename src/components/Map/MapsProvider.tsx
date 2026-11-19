import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { APIProvider, APILoadingStatus, useApiLoadingStatus } from '@vis.gl/react-google-maps';

const PREVIEW_ORIGIN =
  'https://ais-dev-hjlwzipwguj6sg5hbpjbbi-618018389009.europe-west2.run.app';
const mapsApiKey = (
  import.meta.env.DEV && window.location.origin === PREVIEW_ORIGIN
    ? import.meta.env.VITE_GOOGLE_MAPS_PREVIEW_API_KEY
    : import.meta.env.VITE_GOOGLE_MAPS_API_KEY
)?.trim();

const MapsAuthFailed = createContext(false);

export function useHeyroqMapsStatus() {
  const status = useApiLoadingStatus();
  const authFailed = useContext(MapsAuthFailed);
  if (authFailed) return APILoadingStatus.AUTH_FAILURE;
  return mapsApiKey ? status : APILoadingStatus.FAILED;
}

export function MapsProvider({ children }: React.PropsWithChildren) {
  const [authFailed, setAuthFailed] = useState(false);

  useLayoutEffect(() => {
    if (!mapsApiKey) return;

    const mapsWindow = window as Window & { gm_authFailure?: () => void };
    const previous = mapsWindow.gm_authFailure;
    const onAuthFailure = () => {
      setAuthFailed(true);
      previous?.();
    };
    mapsWindow.gm_authFailure = onAuthFailure;
    return () => {
      if (mapsWindow.gm_authFailure === onAuthFailure) mapsWindow.gm_authFailure = previous;
    };
  }, []);

  if (!mapsApiKey) return children;

  return (
    <MapsAuthFailed.Provider value={authFailed}>
      <APIProvider apiKey={mapsApiKey} libraries={['marker', 'places', 'geocoding']}>
        {children}
      </APIProvider>
    </MapsAuthFailed.Provider>
  );
}

export class MapErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  declare readonly props: React.PropsWithChildren;
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <p role="status" className="absolute inset-0 grid place-items-center bg-[var(--heyroq-bg-canvas)]">
        Google Maps is currently unavailable.
      </p>
    ) : this.props.children;
  }
}
