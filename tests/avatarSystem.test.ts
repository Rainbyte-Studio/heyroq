import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURATED_AVATAR_PALETTE,
  extractInitials,
  getAvatarColorForUid,
  getContrastRatio,
  hashUidToPaletteIndex,
  isCustomUploadedAvatarUrl,
  resolveAvatarDescriptor,
  resolveCustomAvatarUrl,
} from '../src/utils/avatarUtils';
import { isOwnedProfileStorageUrl, validateImageFile } from '../src/services/storageService';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Unified Default Avatar System — Initials, Deterministic Palette, Priority & Storage Guards', () => {
  it('1. Single-word, two-word, punctuated, and hyphenated display names generate clean initials', () => {
    assert.equal(extractInitials('Alex Morgan'), 'AM');
    assert.equal(extractInitials('John'), 'J');
    assert.equal(extractInitials('Sofia K.'), 'SK');
    assert.equal(extractInitials('  elena   rodriguez  '), 'ER');
    assert.equal(extractInitials('Jean-Luc Picard'), 'JP');
    assert.equal(extractInitials('@trailblazer'), 'T');
  });

  it('2. Greek and Unicode display names generate accurate uppercase Unicode initials', () => {
    assert.equal(extractInitials('Νίκος Καλογερογιάννης'), 'ΝΚ');
    assert.equal(extractInitials('Μαρία'), 'Μ');
    assert.equal(extractInitials('Élodie Saint-Claire'), 'ÉS');
    assert.equal(extractInitials('Łukasz Żółć'), 'ŁŻ');
  });

  it('3. Missing, whitespace-only, symbol-only, or email-address display names never leak emails and return null', () => {
    assert.equal(extractInitials(''), null);
    assert.equal(extractInitials('     '), null);
    assert.equal(extractInitials(null), null);
    assert.equal(extractInitials(undefined), null);
    assert.equal(extractInitials('12345 !!! ---'), null);
    assert.equal(extractInitials('explorer@heyroq.com'), null);
    assert.equal(extractInitials('@explorer@heyroq.com'), null);
  });

  it('4. Deterministic UID color hashing is stable across repeated calls and never uses randomness', () => {
    const sampleUids = [
      '1XUiIYnfOWTG7uFU736I25CskZU2',
      'uid_alpha_explorer_01',
      'uid_beta_explorer_02',
      'uid_gamma_explorer_03',
      'uid_delta_explorer_04',
      'uid_epsilon_explorer_05',
    ];

    for (const uid of sampleUids) {
      const firstColor = getAvatarColorForUid(uid);
      for (let i = 0; i < 25; i++) {
        assert.deepEqual(getAvatarColorForUid(uid), firstColor);
      }
      const idx = hashUidToPaletteIndex(uid);
      assert.ok(idx >= 0 && idx < CURATED_AVATAR_PALETTE.length);
    }

    // Empty/null UID safely falls back to palette index 0
    assert.equal(hashUidToPaletteIndex(''), 0);
    assert.equal(hashUidToPaletteIndex(null), 0);
  });

  it('5. Every curated avatar palette background satisfies WCAG AA >= 4.5:1 contrast with white initials', () => {
    assert.equal(CURATED_AVATAR_PALETTE.length, 5);
    const expectedRefHexes = ['#E87924', '#4776A8', '#8A5AA7', '#277A65', '#B65D72'];
    assert.deepEqual(
      CURATED_AVATAR_PALETTE.map((p) => p.refHex),
      expectedRefHexes
    );

    for (const entry of CURATED_AVATAR_PALETTE) {
      const primaryContrast = getContrastRatio(entry.bg, entry.text);
      const deepContrast = getContrastRatio(entry.bgDeep, entry.text);
      assert.ok(
        primaryContrast >= 4.5,
        `${entry.label} bg (${entry.bg}) contrast ${primaryContrast.toFixed(2)} must be >= 4.5`
      );
      assert.ok(
        deepContrast >= 4.5,
        `${entry.label} bgDeep (${entry.bgDeep}) contrast ${deepContrast.toFixed(2)} must be >= 4.5`
      );
    }
  });

  it('6. Strict fallback priority: Custom uploaded photo -> Deterministic initials -> Explorer icon (ignoring DiceBear & Google OAuth URLs)', () => {
    const customStorageUrl =
      'https://firebasestorage.googleapis.com/v0/b/rainbyte-studio.firebasestorage.app/o/profile-images%2Fuid123%2Favatar.webp?alt=media';
    const googleDefaultUrl = 'https://lh3.googleusercontent.com/a/ACg8ocSamplePhoto=s96-c';
    const legacyDicebearUrl = 'https://api.dicebear.com/7.x/bottts/svg?seed=uid123';

    assert.equal(isCustomUploadedAvatarUrl(customStorageUrl), true);
    assert.equal(isCustomUploadedAvatarUrl('blob:http://localhost:3000/preview-1'), true);
    assert.equal(isCustomUploadedAvatarUrl(googleDefaultUrl), false);
    assert.equal(isCustomUploadedAvatarUrl(legacyDicebearUrl), false);
    assert.equal(isCustomUploadedAvatarUrl(''), false);

    assert.equal(
      resolveCustomAvatarUrl(googleDefaultUrl, legacyDicebearUrl, customStorageUrl),
      customStorageUrl
    );
    assert.equal(resolveCustomAvatarUrl(googleDefaultUrl, legacyDicebearUrl), null);

    // Priority 1: Custom uploaded photo
    const customDesc = resolveAvatarDescriptor({
      uid: 'uid123',
      displayName: 'Alex Morgan',
      imageUrl: customStorageUrl,
    });
    assert.equal(customDesc.mode, 'image');
    assert.equal(customDesc.imageUrl, customStorageUrl);
    assert.equal(customDesc.initials, 'AM');

    // Image load failure falls back cleanly to Priority 2: Deterministic initials
    const failedImgDesc = resolveAvatarDescriptor({
      uid: 'uid123',
      displayName: 'Alex Morgan',
      imageUrl: customStorageUrl,
      imageFailed: true,
    });
    assert.equal(failedImgDesc.mode, 'initials');
    assert.equal(failedImgDesc.imageUrl, null);
    assert.equal(failedImgDesc.initials, 'AM');

    // Google OAuth default photo is ignored in favor of deterministic initials
    const googleUserDesc = resolveAvatarDescriptor({
      uid: 'uid123',
      displayName: 'Νίκος Καλογερογιάννης',
      imageUrl: googleDefaultUrl,
    });
    assert.equal(googleUserDesc.mode, 'initials');
    assert.equal(googleUserDesc.initials, 'ΝΚ');

    // Priority 3: Neutral explorer icon when displayName is missing or email-only
    const iconFallbackDesc = resolveAvatarDescriptor({
      uid: 'uid123',
      displayName: 'private@example.com',
      imageUrl: '',
    });
    assert.equal(iconFallbackDesc.mode, 'icon');
    assert.equal(iconFallbackDesc.initials, null);
    assert.equal(iconFallbackDesc.ariaLabel.includes('private@example.com'), false);
  });

  it('7. Avatar upload validation & Storage deletion ownership guards enforce strict user boundaries', () => {
    const validFile = {
      name: 'portrait.webp',
      type: 'image/webp',
      size: 512 * 1024,
    } as unknown as File;
    assert.doesNotThrow(() => validateImageFile(validFile));

    const oversizedFile = {
      name: 'huge.png',
      type: 'image/png',
      size: 11 * 1024 * 1024,
    } as unknown as File;
    assert.throws(() => validateImageFile(oversizedFile), /maximum allowed image size is 10MB/);

    const invalidTypeFile = {
      name: 'payload.svg',
      type: 'image/svg+xml',
      size: 1024,
    } as unknown as File;
    assert.throws(() => validateImageFile(invalidTypeFile), /Unsupported file type/);

    // Owned Storage path is permitted for cleanup
    assert.equal(
      isOwnedProfileStorageUrl(
        'https://firebasestorage.googleapis.com/v0/b/rainbyte-studio.firebasestorage.app/o/profile-images%2FuserA%2F123_pic.jpg?alt=media',
        'userA'
      ),
      true
    );

    // Cross-user Storage path, Google photo, and DiceBear URL are strictly rejected
    assert.equal(
      isOwnedProfileStorageUrl(
        'https://firebasestorage.googleapis.com/v0/b/rainbyte-studio.firebasestorage.app/o/profile-images%2FuserB%2F123_pic.jpg?alt=media',
        'userA'
      ),
      false
    );
    assert.equal(
      isOwnedProfileStorageUrl('https://lh3.googleusercontent.com/a/photo', 'userA'),
      false
    );
    assert.equal(
      isOwnedProfileStorageUrl('https://api.dicebear.com/7.x/bottts/svg?seed=userA', 'userA'),
      false
    );
  });

  it('8. Codebase-wide avatar coverage: zero DiceBear URLs in src/ and shared UserAvatar mounted across all user surfaces', () => {
    const srcFiles = collectSourceFiles(path.join(ROOT_DIR, 'src'));
    for (const file of srcFiles) {
      // avatarUtils.ts & storageService.ts intentionally inspect 'dicebear.com' substring to reject legacy URLs;
      // ensure no file generates `api.dicebear.com` URLs!
      const content = readFileSync(file, 'utf8');
      assert.equal(
        content.includes('api.dicebear.com'),
        false,
        `Legacy api.dicebear.com URL generation must not exist in ${path.relative(ROOT_DIR, file)}`
      );
    }

    const requiredAvatarSurfaces = [
      'src/components/Navigation/Navbar.tsx',
      'src/components/Profile/UserProfileModal.tsx',
      'src/components/Profile/UserCardRow.tsx',
      'src/components/Navigation/GlobalSearchDropdown.tsx',
      'src/components/Pin/PinPreviewCard.tsx',
      'src/components/Pin/PinDetailModal.tsx',
      'src/components/Pin/PinFeedList.tsx',
    ];

    for (const relPath of requiredAvatarSurfaces) {
      const src = readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
      assert.ok(
        src.includes('<UserAvatar'),
        `${relPath} must render the shared <UserAvatar /> component`
      );
    }

    // Verify UserAvatar defines all 5 responsive size presets (xs, sm, md, lg, profile)
    const userAvatarSrc = readFileSync(
      path.join(ROOT_DIR, 'src/components/Common/UserAvatar.tsx'),
      'utf8'
    );
    for (const sizeKey of ['xs:', 'sm:', 'md:', 'lg:', 'profile:']) {
      assert.ok(userAvatarSrc.includes(sizeKey), `UserAvatar must support size preset ${sizeKey}`);
    }
  });
});
