/**
 * Heyroq Brand Foundation, Operator Attribution, Typography System & Legal Route Configuration.
 *
 * Confirmed Brand & Operator Identity:
 * - Product: Heyroq ("heyroq") — primary visual brand.
 * - Operator: Rainbyte Studio (https://rainbyte.studio).
 * - Brand relationship: Heyroq is an independent product operated by Rainbyte Studio.
 * - Attribution: "Heyroq — A social discovery platform by Rainbyte Studio."
 * - Support email: help@rainbyte.studio (confirmed operational support mailbox).
 * - Never invents unverified statutory entity names, physical addresses, registration/VAT numbers, or jurisdictions.
 */

import { HEYROQ_PUBLIC_CONFIG } from './publicConfig';

export const OPERATOR_IDENTITY = Object.freeze({
  name: HEYROQ_PUBLIC_CONFIG.operatorName,
  websiteUrl: HEYROQ_PUBLIC_CONFIG.operatorWebsiteUrl,
  websiteDisplay: HEYROQ_PUBLIC_CONFIG.operatorWebsiteDisplay,
  brandRelationship: 'Heyroq is an independent product operated by Rainbyte Studio.',
  attributionLine: 'Heyroq — A social discovery platform by Rainbyte Studio.',
  legalEntityNote:
    'Rainbyte Studio is identified as the platform operator. Registered statutory entity name, registered office address, company registration number, VAT number, and governing jurisdiction require legal confirmation prior to commercial publication.',
  proposedSupportEmail: HEYROQ_PUBLIC_CONFIG.supportEmail,
  supportEmail: HEYROQ_PUBLIC_CONFIG.supportEmail,
});

export const BRAND_IDENTITY = Object.freeze({
  productName: 'Heyroq',
  wordmarkText: 'heyroq',
  brandAttribution: OPERATOR_IDENTITY.attributionLine,
  shortDescription:
    'Modern social location-based discovery platform to explore places, hidden gems, and community pins on an interactive map.',
  tagline: 'Explore places, hidden gems, and community pins around the world.',
  operator: OPERATOR_IDENTITY,
  colors: Object.freeze({
    solarisPrimary: '#E87924',
    solarisHighlight: '#FF9B43',
    solarisDeep: '#B95318',
    darkCanvas: '#0A0A0C',
    darkSurface: '#111216',
    darkElevated: '#181A20',
    lightCanvas: '#F5F6F8',
    lightSurface: '#FFFFFF',
    lightElevated: '#ECEEF2',
  }),
});

export const FONT_FAMILIES = Object.freeze({
  brand: 'Momo Signature',
  heading: 'Space Grotesk',
  body: 'Manrope',
  mono: 'JetBrains Mono',
} as const);

export const FONT_WEIGHTS = Object.freeze({
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const);

/**
 * Reusable semantic typography tokens mapped to CSS classes in `src/index.css`.
 * Covers headings, body text, captions, labels, buttons, navigation, and tabular metadata.
 */
export const TYPOGRAPHY_TOKENS = Object.freeze({
  brandWordmark: 'heyroq-wordmark',
  headingDisplay: 'type-display',
  heading1: 'type-h1',
  heading2: 'type-h2',
  heading3: 'type-h3',
  bodyLarge: 'type-body-lg',
  body: 'type-body',
  bodyMedium: 'type-body-medium',
  caption: 'type-caption',
  label: 'type-label',
  overline: 'type-overline',
  button: 'type-button',
  buttonSmall: 'type-button-sm',
  nav: 'type-nav',
  monoMeta: 'type-mono-meta',
} as const);

export const INTERNAL_INFO_ROUTES = Object.freeze({
  about: '/about',
  privacyPolicy: '/privacy',
  termsOfService: '/terms',
  helpAndSupport: '/support',
} as const);

export type LegalResourceStatus = 'verified' | 'pending_review';

export interface PublicLegalResource {
  readonly label: string;
  /** Verified internal route (e.g. "/privacy") or verified external https:// / mailto: href */
  readonly href: string | null;
  readonly isInternalRoute: boolean;
  readonly displayValue: string | null;
  readonly status: LegalResourceStatus;
  readonly reviewNote: string | null;
}

export interface SupportContactResource extends PublicLegalResource {
  readonly proposedEmail: string;
  readonly mailboxOperationalConfirmed: boolean;
  readonly mailtoHref: string | null;
}

export interface BrandLegalAndSupportConfig {
  readonly about: PublicLegalResource;
  readonly privacyPolicy: PublicLegalResource;
  readonly termsOfService: PublicLegalResource;
  readonly supportContact: SupportContactResource;
}

function validateHttpsUrl(candidate: string | undefined): string | null {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function validateInternalRoute(candidate: string | undefined): string | null {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (
    trimmed === '/about' ||
    trimmed === '/privacy' ||
    trimmed === '/terms' ||
    trimmed === '/support'
  ) {
    return trimmed;
  }
  return null;
}

function validateSupportContact(
  candidate: string | undefined
): { href: string; display: string; isInternalRoute: boolean } | null {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  const internalRoute = validateInternalRoute(trimmed);
  if (internalRoute) {
    return {
      href: internalRoute,
      display: internalRoute === '/support' ? 'Help & Support (/support)' : internalRoute,
      isInternalRoute: true,
    };
  }

  if (trimmed.startsWith('https://')) {
    const validUrl = validateHttpsUrl(trimmed);
    if (validUrl) {
      return {
        href: validUrl,
        display: validUrl.replace(/^https:\/\//, ''),
        isInternalRoute: false,
      };
    }
    return null;
  }

  const rawEmail = trimmed.replace(/^mailto:/i, '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return { href: `mailto:${rawEmail}`, display: rawEmail, isInternalRoute: false };
  }

  return null;
}

export interface ResolveLegalConfigOptions {
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  supportContact?: string;
  supportMailboxConfirmed?: boolean | string;
  /**
   * When true (default in application runtime), uses Heyroq's integrated internal routes
   * (`/about`, `/privacy`, `/terms`, `/support`) as verified destinations unless overridden.
   * When false, validates explicit external inputs strictly.
   */
  useInternalRoutesDefault?: boolean;
}

/**
 * Resolves legal and support destinations using verified internal routes by default,
 * while strictly validating any external overrides and tracking operational confirmation
 * of `help@rainbyte.studio`.
 */
export function resolveLegalAndSupportConfig(
  options: ResolveLegalConfigOptions = {}
): BrandLegalAndSupportConfig {
  const useInternalDefaults = options.useInternalRoutesDefault !== false;
  const rawConfirmed = options.supportMailboxConfirmed;
  const mailboxConfirmed =
    rawConfirmed === undefined ||
    (typeof rawConfirmed === 'string' && rawConfirmed.trim() === '')
      ? true
      : rawConfirmed === true ||
        (typeof rawConfirmed === 'string' && rawConfirmed.trim().toLowerCase() === 'true');

  // Privacy Policy resolution
  const explicitPrivacyInternal = validateInternalRoute(options.privacyPolicyUrl);
  const explicitPrivacyHttps = validateHttpsUrl(options.privacyPolicyUrl);
  const hasPrivacyInput =
    typeof options.privacyPolicyUrl === 'string' && options.privacyPolicyUrl.trim().length > 0;

  let privacyHref: string | null = null;
  let privacyInternal = false;
  if (hasPrivacyInput) {
    if (explicitPrivacyInternal) {
      privacyHref = explicitPrivacyInternal;
      privacyInternal = true;
    } else if (explicitPrivacyHttps) {
      privacyHref = explicitPrivacyHttps;
      privacyInternal = false;
    }
  } else if (useInternalDefaults) {
    privacyHref = INTERNAL_INFO_ROUTES.privacyPolicy;
    privacyInternal = true;
  }

  // Terms of Service resolution
  const explicitTermsInternal = validateInternalRoute(options.termsOfServiceUrl);
  const explicitTermsHttps = validateHttpsUrl(options.termsOfServiceUrl);
  const hasTermsInput =
    typeof options.termsOfServiceUrl === 'string' && options.termsOfServiceUrl.trim().length > 0;

  let termsHref: string | null = null;
  let termsInternal = false;
  if (hasTermsInput) {
    if (explicitTermsInternal) {
      termsHref = explicitTermsInternal;
      termsInternal = true;
    } else if (explicitTermsHttps) {
      termsHref = explicitTermsHttps;
      termsInternal = false;
    }
  } else if (useInternalDefaults) {
    termsHref = INTERNAL_INFO_ROUTES.termsOfService;
    termsInternal = true;
  }

  // Support Contact resolution
  const hasSupportInput =
    typeof options.supportContact === 'string' && options.supportContact.trim().length > 0;
  const explicitSupport = validateSupportContact(options.supportContact);

  let supportHref: string | null = null;
  let supportDisplay: string | null = null;
  let supportInternal = false;

  if (hasSupportInput) {
    if (explicitSupport) {
      supportHref = explicitSupport.href;
      supportDisplay = explicitSupport.display;
      supportInternal = explicitSupport.isInternalRoute;
    }
  } else if (useInternalDefaults) {
    supportHref = INTERNAL_INFO_ROUTES.helpAndSupport;
    supportDisplay = 'Help & Support (/support)';
    supportInternal = true;
  }

  const confirmedMailto = mailboxConfirmed
    ? `mailto:${OPERATOR_IDENTITY.proposedSupportEmail}`
    : null;

  return Object.freeze({
    about: Object.freeze({
      label: 'About Heyroq',
      href: INTERNAL_INFO_ROUTES.about,
      isInternalRoute: true,
      displayValue: 'About Heyroq (/about)',
      status: 'verified',
      reviewNote: null,
    }),
    privacyPolicy: Object.freeze({
      label: 'Privacy Policy',
      href: privacyHref,
      isInternalRoute: privacyInternal,
      displayValue: privacyInternal ? 'Privacy Policy (/privacy)' : privacyHref,
      status: privacyHref ? 'verified' : 'pending_review',
      reviewNote: privacyHref ? null : 'Pending verification — valid destination required',
    }),
    termsOfService: Object.freeze({
      label: 'Terms of Service',
      href: termsHref,
      isInternalRoute: termsInternal,
      displayValue: termsInternal ? 'Terms of Service (/terms)' : termsHref,
      status: termsHref ? 'verified' : 'pending_review',
      reviewNote: termsHref ? null : 'Pending verification — valid destination required',
    }),
    supportContact: Object.freeze({
      label: 'Help & Support',
      href: supportHref,
      isInternalRoute: supportInternal,
      displayValue: supportDisplay,
      status: supportHref ? 'verified' : 'pending_review',
      reviewNote: mailboxConfirmed
        ? null
        : `Proposed email (${OPERATOR_IDENTITY.proposedSupportEmail}) requires operational mailbox confirmation before public launch.`,
      proposedEmail: OPERATOR_IDENTITY.proposedSupportEmail,
      mailboxOperationalConfirmed: mailboxConfirmed,
      mailtoHref: confirmedMailto,
    }),
  });
}

export const BRAND_LEGAL_SUPPORT: BrandLegalAndSupportConfig = resolveLegalAndSupportConfig({
  privacyPolicyUrl: HEYROQ_PUBLIC_CONFIG.legalAndSupport.privacyPolicyUrl,
  termsOfServiceUrl: HEYROQ_PUBLIC_CONFIG.legalAndSupport.termsOfServiceUrl,
  supportContact: HEYROQ_PUBLIC_CONFIG.legalAndSupport.supportContactUrl,
  supportMailboxConfirmed: HEYROQ_PUBLIC_CONFIG.supportMailboxConfirmed,
  useInternalRoutesDefault: true,
});
