export interface AvatarPaletteEntry {
  id: 'solaris' | 'ocean' | 'violet' | 'forest' | 'rose';
  label: string;
  /** Reference brand palette hex from design spec */
  refHex: string;
  /** Accessible solid background hex (>= 4.5:1 WCAG AA contrast with #FFFFFF) */
  bg: string;
  /** Subtle gradient companion stop (>= 4.5:1 WCAG AA contrast with #FFFFFF) */
  bgDeep: string;
  /** Foreground text color */
  text: '#FFFFFF';
}

/**
 * Curated Heyroq deterministic avatar palette.
 * Every background stop maintains >= 4.75:1 contrast with #FFFFFF text in both Light and Dark themes.
 */
export const CURATED_AVATAR_PALETTE: readonly AvatarPaletteEntry[] = [
  {
    id: 'solaris',
    label: 'Solaris Orange',
    refHex: '#E87924',
    bg: '#B95318',
    bgDeep: '#9E4412',
    text: '#FFFFFF',
  },
  {
    id: 'ocean',
    label: 'Ocean Blue',
    refHex: '#4776A8',
    bg: '#4776A8',
    bgDeep: '#39618C',
    text: '#FFFFFF',
  },
  {
    id: 'violet',
    label: 'Violet',
    refHex: '#8A5AA7',
    bg: '#8A5AA7',
    bgDeep: '#72488C',
    text: '#FFFFFF',
  },
  {
    id: 'forest',
    label: 'Forest Green',
    refHex: '#277A65',
    bg: '#277A65',
    bgDeep: '#1E6251',
    text: '#FFFFFF',
  },
  {
    id: 'rose',
    label: 'Dusty Rose',
    refHex: '#B65D72',
    bg: '#AD5469',
    bgDeep: '#914356',
    text: '#FFFFFF',
  },
] as const;

/**
 * Computes WCAG 2.1 relative luminance for a 6-digit hex color.
 */
export function getRelativeLuminance(hex: string): number {
  const clean = hex.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return 0;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Computes WCAG 2.1 contrast ratio between two 6-digit hex colors.
 */
export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA);
  const lumB = getRelativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Deterministic 32-bit FNV-1a hash mapping a Firebase UID to a stable palette index.
 * Never uses Math.random(); identical UIDs always resolve to the exact same color.
 */
export function hashUidToPaletteIndex(
  uid?: string | null,
  paletteLength: number = CURATED_AVATAR_PALETTE.length
): number {
  if (paletteLength <= 0) return 0;
  const normalized = (uid ?? '').trim();
  if (!normalized) return 0;

  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % paletteLength;
}

/**
 * Returns the deterministic curated avatar palette entry for a given Firebase UID.
 */
export function getAvatarColorForUid(uid?: string | null): AvatarPaletteEntry {
  const index = hashUidToPaletteIndex(uid, CURATED_AVATAR_PALETTE.length);
  return CURATED_AVATAR_PALETTE[index];
}

/**
 * Determines whether an avatar URL represents an actual user-uploaded custom profile photo.
 * Rejects empty strings, legacy DiceBear URLs, and default Google provider avatar URLs
 * so users without a custom uploaded photo consistently receive Heyroq's deterministic initials avatar.
 */
export function isCustomUploadedAvatarUrl(url?: string | null): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();

  // Reject legacy generated bottts/DiceBear URLs and external Google OAuth default photos
  if (
    lower.includes('dicebear.com') ||
    lower.includes('googleusercontent.com') ||
    lower.includes('ggpht.com')
  ) {
    return false;
  }

  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('blob:') ||
    lower.startsWith('data:image/')
  );
}

/**
 * Picks the first valid user-uploaded custom avatar URL from candidate fields, or null.
 */
export function resolveCustomAvatarUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (isCustomUploadedAvatarUrl(candidate)) {
      return candidate!.trim();
    }
  }
  return null;
}

const LETTER_RUN_REGEX = /\p{L}+/gu;

/**
 * Extracts 1–2 uppercase Unicode initials from a public display name.
 *
 * Rules:
 * - Never derives initials from email addresses (rejects strings containing '@', except leading '@handle'
 *   only when it is not an email address; however if displayName contains '@' inside an email, returns null).
 * - Supports Latin, Greek (e.g., Νίκος Καλογερογιάννης -> ΝΚ), Cyrillic, accented, and other Unicode letters.
 * - Two or more word segments -> first letter of first two segments (Alex Morgan -> AM, Sofia K. -> SK).
 * - Single word segment -> first letter (John -> J).
 * - Missing, whitespace-only, or punctuation/symbol-only strings -> null (triggers neutral Explorer icon).
 */
export function extractInitials(displayName?: string | null): string | null {
  if (typeof displayName !== 'string') return null;

  const trimmed = displayName.trim();
  if (!trimmed) return null;

  // Never derive public avatar initials from an email address
  if (trimmed.includes('@') && !trimmed.startsWith('@')) {
    return null;
  }
  // Even if prefixed with '@', reject if the remainder looks like an email
  const withoutLeadingHandle = trimmed.replace(/^@+/, '').trim();
  if (!withoutLeadingHandle || withoutLeadingHandle.includes('@')) {
    return null;
  }

  // Split by whitespace first so multi-word names with hyphenated given/family names
  // (e.g. "Jean-Luc Picard" -> "JP", "Élodie Saint-Claire" -> "ÉS") use first + second word;
  // if there is only a single whitespace token with hyphens/underscores (e.g. "Jean-Luc" -> "JL"),
  // split that token on hyphens/underscores.
  const whitespaceWords = withoutLeadingHandle.split(/\s+/).filter(Boolean);
  const rawParts =
    whitespaceWords.length >= 2
      ? whitespaceWords
      : withoutLeadingHandle.split(/[\s\-–—_]+/).filter(Boolean);

  const letterTokens: string[] = [];

  for (const part of rawParts) {
    const matches = part.match(LETTER_RUN_REGEX);
    if (matches && matches.length > 0 && matches[0].length > 0) {
      letterTokens.push(matches[0]);
    }
  }

  if (letterTokens.length === 0) {
    return null;
  }

  const firstChar = Array.from(letterTokens[0])[0];
  if (!firstChar) return null;

  if (letterTokens.length >= 2) {
    const secondChar = Array.from(letterTokens[1])[0];
    if (secondChar) {
      return `${firstChar}${secondChar}`.toLocaleUpperCase();
    }
  }

  return firstChar.toLocaleUpperCase();
}

export interface ResolvedAvatarDescriptor {
  mode: 'image' | 'initials' | 'icon';
  imageUrl: string | null;
  initials: string | null;
  color: AvatarPaletteEntry;
  ariaLabel: string;
}

/**
 * Pure deterministic resolver implementing Heyroq's strict avatar priority order:
 * 1. User-uploaded custom profile photo (unless imageError is true)
 * 2. Deterministic initials avatar seeded by Firebase UID
 * 3. Neutral Explorer icon when usable display name is unavailable
 */
export function resolveAvatarDescriptor(params: {
  uid?: string | null;
  displayName?: string | null;
  imageUrl?: string | null;
  imageFailed?: boolean;
}): ResolvedAvatarDescriptor {
  const color = getAvatarColorForUid(params.uid);
  const initials = extractInitials(params.displayName);
  const customUrl = !params.imageFailed ? resolveCustomAvatarUrl(params.imageUrl) : null;

  const cleanLabelName =
    typeof params.displayName === 'string' &&
    params.displayName.trim() &&
    !params.displayName.includes('@')
      ? params.displayName.trim()
      : 'Explorer';

  if (customUrl) {
    return {
      mode: 'image',
      imageUrl: customUrl,
      initials,
      color,
      ariaLabel: `${cleanLabelName}'s profile photo`,
    };
  }

  if (initials) {
    return {
      mode: 'initials',
      imageUrl: null,
      initials,
      color,
      ariaLabel: `${cleanLabelName}'s avatar (${initials})`,
    };
  }

  return {
    mode: 'icon',
    imageUrl: null,
    initials: null,
    color,
    ariaLabel: 'Explorer default avatar',
  };
}
