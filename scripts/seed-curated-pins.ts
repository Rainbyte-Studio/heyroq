/**
 * Heyroq - Production Curator & Launch Content Seeding Script
 *
 * Uses the Firebase Admin SDK to connect directly to the Heyroq Firestore database
 * (ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3 on project rainbyte-studio).
 *
 * Capabilities:
 * - 100% IDEMPOTENT: Uses deterministic document IDs (curated_pin_1 .. curated_pin_12).
 *   Will never duplicate pins or re-upload existing storage images when run multiple times.
 * - Creates verified production curator profiles (users/system_curator & users/demo_user_maya).
 * - Matches exact production schema: geohash, coordinates, category, tags, timestamps.
 * - Supports optional --upload-images flag to mirror external assets into Firebase Storage:
 *   pins/system_curator/{pinId}/{fileName}
 * - Supports --dry-run for audit verification without modifying data.
 *
 * Usage:
 *   # Standard execution with Google Application Default Credentials:
 *   npx tsx scripts/seed-curated-pins.ts
 *
 *   # With a specific service account key:
 *   GOOGLE_APPLICATION_CREDENTIALS=serviceAccountKey.json npx tsx scripts/seed-curated-pins.ts
 *
 *   # With local Firestore Emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/seed-curated-pins.ts
 *
 *   # Dry-run audit mode:
 *   npx tsx scripts/seed-curated-pins.ts --dry-run
 *
 *   # Mirror images into Firebase Storage:
 *   npx tsx scripts/seed-curated-pins.ts --upload-images
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { geohashForLocation } from 'geofire-common';

// Load applet config
const configPath = resolve(process.cwd(), 'firebase-applet-config.json');
if (!existsSync(configPath)) {
  throw new Error(`Config file not found at ${configPath}`);
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const PROJECT_ID = config.projectId || 'rainbyte-studio';
const DATABASE_ID = config.firestoreDatabaseId || 'ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3';
const STORAGE_BUCKET = config.storageBucket || 'rainbyte-studio.firebasestorage.app';

// Parse command-line flags
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const UPLOAD_IMAGES = args.includes('--upload-images');
const OVERWRITE = args.includes('--overwrite');

console.log('='.repeat(65));
console.log(' Heyroq Production Launch Seeding Tool');
console.log('='.repeat(65));
console.log(`• Target Project  : ${PROJECT_ID}`);
console.log(`• Target Database : ${DATABASE_ID}`);
console.log(`• Storage Bucket  : ${STORAGE_BUCKET}`);
console.log(`• Dry-Run Mode    : ${IS_DRY_RUN ? 'YES (No writes will occur)' : 'NO'}`);
console.log(`• Upload Images   : ${UPLOAD_IMAGES ? 'YES (Mirror to Firebase Storage)' : 'NO (Keep CDN URLs)'}`);
console.log(`• Overwrite Docs  : ${OVERWRITE ? 'YES' : 'NO (Idempotent merge/skip)'}`);
console.log('='.repeat(65));

// Initialize Firebase Admin
let app: App;
if (getApps().length === 0) {
  const serviceAccountEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountEnv && existsSync(serviceAccountEnv)) {
    console.log(`• Using Service Account Credentials: ${serviceAccountEnv}`);
    const sa = JSON.parse(readFileSync(serviceAccountEnv, 'utf8'));
    app = initializeApp({
      credential: cert(sa),
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    });
  } else {
    console.log('• Using Application Default / Environment Credentials');
    app = initializeApp({
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    });
  }
} else {
  app = getApps()[0];
}

const db = getFirestore(app, DATABASE_ID);
const bucket = getStorage(app).bucket(STORAGE_BUCKET);

// Curator Profile Definitions
export const CURATOR_PROFILES = [
  {
    uid: 'system_curator',
    displayName: 'Heyroq Editorial',
    username: 'heyroq',
    email: 'curator@heyroq.com',
    bio: 'Official curated spots, hidden gems, and iconic vistas vetted by the Heyroq editorial team.',
    photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    accountType: 'official_curator',
    role: 'curator',
    followersCount: 145,
    followingCount: 0,
    pinsCount: 12,
  },
  {
    uid: 'demo_user_maya',
    displayName: 'Maya Lin',
    username: 'maya_travels',
    email: 'maya@heyroq.com',
    bio: 'Travel photographer & Aegean explorer mapping coastal vistas, secret staircases, and hidden courtyards.',
    photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    accountType: 'explorer',
    role: 'member',
    followersCount: 89,
    followingCount: 12,
    pinsCount: 6,
  },
];

// Production Curated Launch Content (All 12 Curated Spots with Deterministic IDs)
export const CURATED_LAUNCH_PINS = [
  {
    id: 'curated_pin_1',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    title: 'Secret Rooftop Garden at Montmartre',
    description: 'A tranquil hideaway tucked above the vineyard hills with panoramic views of the Paris skyline and artisanal roasted coffee.',
    latitude: 48.8867,
    longitude: 2.3431,
    locationName: 'Paris, France',
    category: 'Hidden Gems',
    tags: ['rooftop', 'paris', 'coffee', 'viewpoint'],
    imageUrls: [
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1000&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 42,
    commentCount: 5,
  },
  {
    id: 'curated_pin_2',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    title: 'Lantern Alley Ramen & Jazz Cellar',
    description: 'Down a flight of steps in Shimokitazawa, authentic tonkotsu broth paired with vintage vinyl jazz playing all evening.',
    latitude: 35.6617,
    longitude: 139.6677,
    locationName: 'Tokyo, Japan',
    category: 'Food',
    tags: ['ramen', 'jazz', 'nightlife', 'tokyo'],
    imageUrls: [
      'https://images.unsplash.com/photo-1552611052-33e04de081de?w=1000&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 88,
    commentCount: 14,
  },
  {
    id: 'curated_pin_3',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    title: 'Twin Peaks Twilight Fog Overlook',
    description: 'Best spot in San Francisco to watch the Karl the Fog roll over Sutro Tower and illuminate the bay with golden sunset hour.',
    latitude: 37.7544,
    longitude: -122.4477,
    locationName: 'San Francisco, CA',
    category: 'Photography',
    tags: ['sunset', 'fog', 'bayarea', 'scenic'],
    imageUrls: [
      'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 65,
    commentCount: 9,
  },
  {
    id: 'curated_pin_4',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    title: 'Cliffside Caldera Sunset Perch',
    description: 'Far from the crowded Oia steps, this private volcanic trail cliff gives uninterrupted Aegean sunset vistas.',
    latitude: 36.4618,
    longitude: 25.3753,
    locationName: 'Santorini, Greece',
    category: 'Travel',
    tags: ['santorini', 'sunset', 'mediterranean', 'cliffs'],
    imageUrls: [
      'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 112,
    commentCount: 18,
  },
  {
    id: 'curated_pin_5',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    title: 'Acoustic Amphitheater Under the Pines',
    description: 'Natural stone amphitheater hosting weekend acoustic jam sessions and indie folk gatherings deep in the redwoods.',
    latitude: 37.8972,
    longitude: -122.5811,
    locationName: 'Muir Woods, CA',
    category: 'Events',
    tags: ['music', 'acoustic', 'forest', 'nature'],
    imageUrls: [
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 34,
    commentCount: 4,
  },
  {
    id: 'curated_pin_6',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
    title: 'Secret Tide Pools & Sea Cave Arch',
    description: 'Low tide reveals natural emerald saltwater plunge pools and an ancient natural limestone tunnel right onto black sand.',
    latitude: -8.6500,
    longitude: 115.1300,
    locationName: 'Canggu, Bali',
    category: 'Nature',
    tags: ['ocean', 'tidepools', 'caves', 'bali'],
    imageUrls: [
      'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 97,
    commentCount: 11,
  },
  {
    id: 'curated_pin_7',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    title: 'Navagio Shipwreck High Cliff Edge',
    description: 'Breathtaking electric-blue waters framed by white vertical cliffs. Best viewed in late afternoon light.',
    latitude: 37.8594,
    longitude: 20.6249,
    locationName: 'Zakynthos, Greece',
    category: 'Photography',
    tags: ['zakynthos', 'greece', 'shipwreck', 'cliffs'],
    imageUrls: [
      'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 68,
    commentCount: 8,
  },
  {
    id: 'curated_pin_8',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    title: 'Keri Lighthouse Sunset Rocks',
    description: 'Dramatic limestone pinnacles towering out of the Ionian sea as the sun melts into the open horizon.',
    latitude: 37.6611,
    longitude: 20.8167,
    locationName: 'Zakynthos, Greece',
    category: 'Travel',
    tags: ['sunset', 'keri', 'zakynthos', 'ionian'],
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 54,
    commentCount: 6,
  },
  {
    id: 'curated_pin_9',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    title: 'Anafiotika Hidden White Stairs',
    description: 'A pocket of Cycladic village whitewashed houses clinging to the northeast slope of the Acropolis.',
    latitude: 37.9722,
    longitude: 23.7289,
    locationName: 'Athens, Greece',
    category: 'Hidden Gems',
    tags: ['athens', 'acropolis', 'cycladic', 'secret'],
    imageUrls: [
      'https://images.unsplash.com/photo-1555993539-1732b0258235?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 91,
    commentCount: 12,
  },
  {
    id: 'curated_pin_10',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    title: 'Pont des Arts Twilight Musician Nook',
    description: 'Wooden footbridge overlooking the Seine and Île de la Cité with accordion chords lingering at dusk.',
    latitude: 48.8583,
    longitude: 2.3375,
    locationName: 'Paris, France',
    category: 'Events',
    tags: ['paris', 'seine', 'dusk', 'music'],
    imageUrls: [
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 77,
    commentCount: 9,
  },
  {
    id: 'curated_pin_11',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    title: 'Neal’s Yard Secret Colourful Courtyard',
    description: 'Vibrant painted facades, organic apothecary teas, and calm benches hidden inside Covent Garden.',
    latitude: 51.5144,
    longitude: -0.1264,
    locationName: 'London, United Kingdom',
    category: 'Hidden Gems',
    tags: ['london', 'nealsyard', 'colourful', 'cafe'],
    imageUrls: [
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 63,
    commentCount: 7,
  },
  {
    id: 'curated_pin_12',
    userId: 'system_curator',
    userName: 'Heyroq Editorial',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    title: 'DUMBO Water Street Manhattan Bridge Vista',
    description: 'Classic red brick alley framing the Manhattan Bridge archway with the Empire State Building aligned between its legs.',
    latitude: 40.7033,
    longitude: -73.9896,
    locationName: 'New York, United States',
    category: 'Photography',
    tags: ['nyc', 'dumbo', 'brooklyn', 'architecture'],
    imageUrls: [
      'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1000&auto=format&fit=crop&q=80',
    ],
    likeCount: 104,
    commentCount: 15,
  },
];

/**
 * Downloads a remote image buffer and uploads it to Firebase Storage if not already present.
 */
async function mirrorImageToStorage(url: string, destinationPath: string): Promise<string> {
  if (IS_DRY_RUN) {
    return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(destinationPath)}?alt=media`;
  }

  const file = bucket.file(destinationPath);
  const [exists] = await file.exists();
  if (exists && !OVERWRITE) {
    console.log(`    ↳ Storage asset exists: ${destinationPath} (reusing)`);
    return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(destinationPath)}?alt=media`;
  }

  console.log(`    ↳ Uploading remote image to: ${destinationPath}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image ${url}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await file.save(buffer, {
    metadata: {
      contentType: 'image/jpeg',
      customMetadata: {
        curatedBy: 'system_curator',
        seededAt: new Date().toISOString(),
      },
    },
    public: true,
  });

  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(destinationPath)}?alt=media`;
}

async function runSeed() {
  console.log('\n[1/3] Processing Curator Profiles...');
  let profilesCreated = 0;
  let profilesExisting = 0;

  for (const profile of CURATOR_PROFILES) {
    if (IS_DRY_RUN) {
      console.log(`  + [DRY RUN] Would check & create curator profile: users/${profile.uid} (@${profile.username})`);
      profilesCreated++;
      continue;
    }

    try {
      const userRef = db.collection('users').doc(profile.uid);
      const snap = await userRef.get();

      if (snap.exists && !OVERWRITE) {
        console.log(`  ✓ Curator profile already exists: users/${profile.uid} (@${profile.username})`);
        profilesExisting++;
      } else {
        console.log(`  + Creating curator profile: users/${profile.uid} (@${profile.username})`);
        await userRef.set(
          {
            ...profile,
            createdAt: snap.exists ? (snap.data()?.createdAt || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        profilesCreated++;
      }
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        console.error('\n✖ Permission Denied connecting to Cloud Firestore.');
        console.error('To seed real production data from your terminal or CI environment, ensure you provide:');
        console.error('1) GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"');
        console.error('   OR');
        console.error('2) Run "gcloud auth application-default login" with appropriate Firestore Admin privileges.');
        console.error('   OR');
        console.error('3) FIRESTORE_EMULATOR_HOST="localhost:8080" for emulator testing.\n');
        throw err;
      }
      throw err;
    }
  }

  console.log('\n[2/3] Processing Curated Launch Pins...');
  let pinsCreated = 0;
  let pinsSkipped = 0;
  let storageAssetsUploaded = 0;

  for (const pin of CURATED_LAUNCH_PINS) {
    const geohash = geohashForLocation([pin.latitude, pin.longitude]);

    if (IS_DRY_RUN) {
      console.log(`  + [DRY RUN] Would seed: ${pin.id} — "${pin.title}" [${pin.category}] (geohash: ${geohash}, likes: ${pin.likeCount})`);
      pinsCreated++;
      continue;
    }

    const pinRef = db.collection('pins').doc(pin.id);
    const snap = await pinRef.get();

    if (snap.exists && !OVERWRITE) {
      console.log(`  ✓ Curated pin exists: ${pin.id} — "${pin.title}" (skipping)`);
      pinsSkipped++;
      continue;
    }

    console.log(`  + Processing: ${pin.id} — "${pin.title}" [${pin.category}]`);

    let finalImageUrls = [...pin.imageUrls];
    if (UPLOAD_IMAGES) {
      try {
        const uploadedUrls: string[] = [];
        for (let i = 0; i < pin.imageUrls.length; i++) {
          const destPath = `pins/system_curator/${pin.id}/cover_${i + 1}.jpg`;
          const cdnUrl = await mirrorImageToStorage(pin.imageUrls[i], destPath);
          uploadedUrls.push(cdnUrl);
          storageAssetsUploaded++;
        }
        finalImageUrls = uploadedUrls;
      } catch (err: any) {
        console.warn(`    ⚠ Storage mirroring warning for ${pin.id}: ${err.message}. Keeping CDN URLs.`);
      }
    }

    const firestoreDocument = {
      userId: pin.userId,
      userName: pin.userName,
      userAvatar: pin.userAvatar,
      title: pin.title,
      description: pin.description,
      latitude: pin.latitude,
      longitude: pin.longitude,
      geohash,
      locationName: pin.locationName,
      category: pin.category,
      tags: pin.tags,
      imageUrls: finalImageUrls,
      likeCount: pin.likeCount,
      commentCount: pin.commentCount,
      createdAt: snap.exists ? (snap.data()?.createdAt || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await pinRef.set(firestoreDocument, { merge: true });
    console.log(`    ↳ Successfully written document pins/${pin.id} (geohash: ${geohash})`);
    pinsCreated++;
  }

  console.log('\n[3/3] Final Seeding Summary:');
  console.log('-'.repeat(50));
  console.log(`• Curated Pins Prepared        : ${CURATED_LAUNCH_PINS.length}`);
  console.log(`• Pins Created / Updated       : ${pinsCreated}`);
  console.log(`• Existing Pins Skipped        : ${pinsSkipped}`);
  console.log(`• Curator Profiles Maintained  : ${CURATOR_PROFILES.length} (${profilesCreated} created/updated, ${profilesExisting} existing)`);
  console.log(`• Storage Assets Processed     : ${storageAssetsUploaded}`);
  console.log(`• Execution Mode               : ${IS_DRY_RUN ? 'DRY-RUN (No data altered)' : 'COMMITTED TO FIRESTORE'}`);
  console.log('-'.repeat(50));

  if (!IS_DRY_RUN && pinsCreated > 0) {
    console.log('✔ Production curated launch content is ready in Firestore.');
  }
}

runSeed().catch((err) => {
  console.error('\n✖ Seeding script failed:', err);
  process.exit(1);
});
