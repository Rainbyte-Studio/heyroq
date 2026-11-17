/**
 * Centralized, typed, browser-safe public configuration for Heyroq.
 *
 * Security & Architecture Contract:
 * - Contains ONLY public, non-secret product, operator, route, contact, and release metadata.
 * - Uses deterministic code defaults rather than client-prefixed environment variables so
 *   Google AI Studio never prompts for non-secret public metadata when opening the preview.
 * - Never stores API keys, credentials, or sensitive tokens (client-bundled env values are public;
 *   genuine secrets belong exclusively in secure server-side runtime configuration).
 */

export type ReleaseChannelConfigOption = 'Alpha' | 'Beta' | 'RC' | 'Stable' | null;

export interface HeyroqPublicConfig {
  readonly productName: 'Heyroq';
  readonly operatorName: 'Rainbyte Studio';
  readonly operatorWebsiteUrl: 'https://rainbyte.studio';
  readonly operatorWebsiteDisplay: 'rainbyte.studio';
  /** Confirmed operational Rainbyte Studio support mailbox */
  readonly supportEmail: 'help@rainbyte.studio';
  /** Controls whether mailto: links to supportEmail are active in UI */
  readonly supportMailboxConfirmed: boolean;
  /** Canonical public informational, legal, and support destinations */
  readonly legalAndSupport: {
    readonly aboutUrl: string;
    readonly privacyPolicyUrl: string;
    readonly termsOfServiceUrl: string;
    readonly supportContactUrl: string;
  };
  /**
   * Optional explicit release channel override.
   * When `null` (default), `src/config/version.ts` derives the active channel
   * automatically from the SemVer string in root `package.json` (e.g. `0.1.0-beta.1` -> `Beta`).
   */
  readonly releaseChannelOverride: ReleaseChannelConfigOption;
  /**
   * Optional verified HTTPS URL for hosted release notes / changelog.
   * Kept `null` until an official hosted changelog page is published (never uses placeholder URLs;
   * repository release notes live in `/CHANGELOG.md`).
   */
  readonly releaseChangelogUrl: string | null;
}

export const HEYROQ_PUBLIC_CONFIG: HeyroqPublicConfig = Object.freeze({
  productName: 'Heyroq',
  operatorName: 'Rainbyte Studio',
  operatorWebsiteUrl: 'https://rainbyte.studio',
  operatorWebsiteDisplay: 'rainbyte.studio',
  supportEmail: 'help@rainbyte.studio',
  supportMailboxConfirmed: true,
  legalAndSupport: Object.freeze({
    aboutUrl: '/about',
    privacyPolicyUrl: '/privacy',
    termsOfServiceUrl: '/terms',
    supportContactUrl: '/support',
  }),
  releaseChannelOverride: null,
  releaseChangelogUrl: null,
});
