/// <reference types="vite/client" />

declare const __HEYROQ_PACKAGE_NAME__: string | undefined;
declare const __HEYROQ_APP_VERSION__: string | undefined;
declare const __HEYROQ_BUILD_DATE__: string | undefined;
declare const __HEYROQ_GIT_COMMIT_SHA__: string | null | undefined;
declare const __HEYROQ_BROWSER_EMULATOR__: boolean;

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
