import rootPackage from '../../package.json';
import { HEYROQ_PUBLIC_CONFIG } from './publicConfig';

export type ReleaseChannel = 'Alpha' | 'Beta' | 'RC' | 'Stable';

export interface ParsedSemVer {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  buildMetadata: string[];
}

export interface AppVersionConfig {
  /** Human-facing product name */
  readonly productName: 'Heyroq';
  /** Canonical npm package identifier from root package.json */
  readonly packageName: string;
  /** Canonical Semantic Version string from root package.json (e.g. "0.1.0-beta.1") */
  readonly version: string;
  /** Formatted display version prefixed with "v" (e.g. "v0.1.0-beta.1") */
  readonly displayVersion: string;
  /** Parsed Semantic Versioning 2.0.0 components */
  readonly semver: ParsedSemVer;
  /** Active release channel derived from SemVer pre-release identifier or explicit channel config */
  readonly releaseChannel: ReleaseChannel;
  /** ISO-8601 UTC build timestamp when available */
  readonly buildDate: string | null;
  /** Formatted UTC date (YYYY-MM-DD) for human display, or null if unavailable */
  readonly buildDateShort: string | null;
  /** Short 7-char Git commit SHA when available, or null when built outside a Git repository */
  readonly gitCommitSha: string | null;
  /** Deterministic SemVer-compatible build identifier (never exposes secrets) */
  readonly buildId: string;
}

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Parses and validates a Semantic Versioning 2.0.0 string.
 * Throws a descriptive error if the version violates SemVer syntax.
 */
export function parseSemVer(versionString: string): ParsedSemVer {
  const clean = versionString.trim().replace(/^v/i, '');
  const match = SEMVER_REGEX.exec(clean);
  if (!match) {
    throw new Error(`Invalid Semantic Version "${versionString}". Expected MAJOR.MINOR.PATCH[-prerelease][+build].`);
  }

  return {
    raw: clean,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
    buildMetadata: match[5] ? match[5].split('.') : [],
  };
}

/**
 * Derives the release channel from a parsed SemVer pre-release tag or an optional explicit channel name.
 */
export function deriveReleaseChannel(
  semver: ParsedSemVer,
  channelOverride?: string | null
): ReleaseChannel {
  if (channelOverride) {
    const normalized = channelOverride.trim().toLowerCase();
    if (normalized === 'alpha') return 'Alpha';
    if (normalized === 'beta') return 'Beta';
    if (normalized === 'rc' || normalized === 'release-candidate') return 'RC';
    if (normalized === 'stable' || normalized === 'production' || normalized === 'ga') return 'Stable';
  }

  const firstTag = (semver.prerelease[0] || '').toLowerCase();
  if (firstTag.startsWith('alpha')) return 'Alpha';
  if (firstTag.startsWith('beta')) return 'Beta';
  if (firstTag.startsWith('rc')) return 'RC';

  // Any other pre-release tag defaults to Beta in pre-1.0 development
  if (semver.prerelease.length > 0) return 'Beta';
  if (semver.major === 0) return 'Beta';

  return 'Stable';
}

/**
 * Sanitizes a candidate Git SHA so only valid hexadecimal commit hashes are accepted.
 */
export function sanitizeGitSha(rawSha: unknown): string | null {
  if (typeof rawSha !== 'string') return null;
  const trimmed = rawSha.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(trimmed)) return null;
  return trimmed.slice(0, 7).toLowerCase();
}

/**
 * Validates and normalizes an ISO-8601 build date string.
 */
export function normalizeBuildDate(rawDate: unknown): { iso: string | null; shortDate: string | null; compactDate: string | null } {
  if (typeof rawDate !== 'string' || !rawDate.trim()) {
    return { iso: null, shortDate: null, compactDate: null };
  }
  const parsed = new Date(rawDate.trim());
  if (Number.isNaN(parsed.getTime())) {
    return { iso: null, shortDate: null, compactDate: null };
  }
  const iso = parsed.toISOString();
  const shortDate = iso.slice(0, 10); // YYYY-MM-DD
  const compactDate = shortDate.replace(/-/g, ''); // YYYYMMDD
  return { iso, shortDate, compactDate };
}

/**
 * Constructs a deterministic, secret-free build identifier suitable for UI diagnostics and bug reports.
 */
export function formatBuildIdentifier(
  version: string,
  compactDate: string | null,
  gitSha: string | null
): string {
  const metadataParts: string[] = [];
  if (compactDate) metadataParts.push(compactDate);
  if (gitSha) metadataParts.push(gitSha);

  if (metadataParts.length === 0) {
    return `${version}+local`;
  }
  return `${version}+${metadataParts.join('.')}`;
}

export interface VersionConfigInputs {
  packageName?: string;
  version?: string;
  releaseChannelOverride?: string | null;
  buildDate?: string | null;
  gitCommitSha?: string | null;
}

/**
 * Pure factory for building a frozen, typed AppVersionConfig object.
 * Used both at runtime and in unit tests to verify fallback behavior when Git/build metadata is absent.
 */
export function createAppVersionConfig(inputs: VersionConfigInputs = {}): AppVersionConfig {
  const canonicalPkgName =
    (typeof inputs.packageName === 'string' && inputs.packageName.trim()) ||
    rootPackage.name ||
    'heyroq';

  const canonicalVersion =
    (typeof inputs.version === 'string' && inputs.version.trim()) ||
    rootPackage.version;

  const semver = parseSemVer(canonicalVersion);
  const releaseChannel = deriveReleaseChannel(semver, inputs.releaseChannelOverride);
  const gitCommitSha = sanitizeGitSha(inputs.gitCommitSha);
  const { iso: buildDate, shortDate: buildDateShort, compactDate } = normalizeBuildDate(inputs.buildDate);
  const buildId = formatBuildIdentifier(semver.raw, compactDate, gitCommitSha);

  return Object.freeze({
    productName: 'Heyroq',
    packageName: canonicalPkgName,
    version: semver.raw,
    displayVersion: `v${semver.raw}`,
    semver,
    releaseChannel,
    buildDate,
    buildDateShort,
    gitCommitSha,
    buildId,
  });
}

const injectedPackageName =
  typeof __HEYROQ_PACKAGE_NAME__ !== 'undefined' ? __HEYROQ_PACKAGE_NAME__ : rootPackage.name;
const injectedVersion =
  typeof __HEYROQ_APP_VERSION__ !== 'undefined' ? __HEYROQ_APP_VERSION__ : rootPackage.version;
const injectedBuildDate =
  typeof __HEYROQ_BUILD_DATE__ !== 'undefined' ? __HEYROQ_BUILD_DATE__ : null;
const injectedGitSha =
  typeof __HEYROQ_GIT_COMMIT_SHA__ !== 'undefined' ? __HEYROQ_GIT_COMMIT_SHA__ : null;

/**
 * Singleton application version and build configuration.
 * Guaranteed free of API keys, credentials, or private environment variables.
 */
export const APP_VERSION: AppVersionConfig = createAppVersionConfig({
  packageName: injectedPackageName,
  version: injectedVersion,
  releaseChannelOverride: HEYROQ_PUBLIC_CONFIG.releaseChannelOverride,
  buildDate: injectedBuildDate,
  gitCommitSha: injectedGitSha,
});
