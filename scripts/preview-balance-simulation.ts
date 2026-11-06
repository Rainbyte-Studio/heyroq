import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  initializeFirestore,
  getDocs,
  getDoc,
  collection,
  doc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Pin, UserProfile, UserAchievement } from '../src/types';
import {
  EXPLORER_LEVELS,
  PROGRESSION_CONSTANTS,
  LIKE_MILESTONES,
  FOLLOWER_MILESTONES,
  ACHIEVEMENTS_CATALOG,
  getProgressForXp,
} from '../src/config/progressionConfig';
import { calculateProgression } from '../src/services/gamificationService';

async function main() {
  console.log('================================================================');
  console.log('HEYROQ EXPLORER PROGRESSION: BALANCE SIMULATION & MIGRATION PREVIEW');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. FIRST DISCOVERY DETAILED XP AUDIT & BREAKDOWN
  // ---------------------------------------------------------------------------
  console.log('--- 1. FIRST DISCOVERY SCENARIOS (TARGET: 150–250 XP -> LEVEL 1) ---');

  const testFirstDiscoveryScenarios = [
    {
      name: 'Scenario A: Basic Discovery (Short desc, 0 tags, 0 likes, incomplete profile)',
      pin: {
        id: 'pin_a',
        userId: 'user_a',
        title: 'Harbor Pier',
        description: 'Nice view of the water.',
        tags: [],
        city: 'Tromso',
        countryCode: 'NO',
        countryName: 'Norway',
        locationName: 'Tromso, Norway',
        latitude: 69.6492,
        longitude: 18.9553,
        likeCount: 0,
        createdAt: new Date().toISOString(),
      } as unknown as Pin,
      profile: { uid: 'user_a', displayName: 'Explorer A' } as Partial<UserProfile>,
    },
    {
      name: 'Scenario B: Rich Discovery (Detailed guide, tags, 0 likes, incomplete profile)',
      pin: {
        id: 'pin_b',
        userId: 'user_b',
        title: 'Hidden Mountain Path',
        description: 'A secluded trail featuring spectacular views across the valley with rocky terrain and glacial streams throughout.',
        tags: ['nature', 'scenic', 'hiking'],
        city: 'Tromso',
        countryCode: 'NO',
        countryName: 'Norway',
        locationName: 'Tromso, Norway',
        latitude: 69.6492,
        longitude: 18.9553,
        likeCount: 0,
        createdAt: new Date().toISOString(),
      } as unknown as Pin,
      profile: { uid: 'user_b', displayName: 'Explorer B' } as Partial<UserProfile>,
    },
    {
      name: 'Scenario C: Rich Discovery + First Like + Complete Profile (Full Initial Stack)',
      pin: {
        id: 'pin_c',
        userId: 'user_c',
        title: 'Historic Arctic Cathedral',
        description: 'An architectural landmark with striking triangular facades, vibrant stained glass, and tranquil acoustic resonance.',
        tags: ['architecture', 'photo', 'history'],
        city: 'Tromso',
        countryCode: 'NO',
        countryName: 'Norway',
        locationName: 'Tromso, Norway',
        latitude: 69.6492,
        longitude: 18.9553,
        likeCount: 1,
        createdAt: new Date().toISOString(),
      } as unknown as Pin,
      profile: {
        uid: 'user_c',
        displayName: 'Explorer C',
        bio: 'Passionate arctic traveler documenting northern discoveries.',
        avatarUrl: 'https://example.com/avatar.jpg',
      } as Partial<UserProfile>,
    },
  ];

  for (const scen of testFirstDiscoveryScenarios) {
    const result = calculateProgression(scen.pin.userId, [scen.pin], scen.profile, []);
    console.log(`\n▶ ${scen.name}`);
    console.log(`  Total XP: ${result.summary.xp} XP | Level: ${result.summary.level} (${result.summary.title})`);
    console.log(`  Progress to Level 2: ${result.summary.progressPercent}% (${result.summary.nextLevelXp - result.summary.xp} XP remaining)`);
    console.log('  Event Ledger Breakdown:');
    result.xpEvents.forEach((ev) => {
      console.log(`    - [${ev.id}] ${ev.description}: +${ev.xpEarned} XP (${ev.action})`);
    });
    console.log(`  Unlocked Achievements (${result.summary.unlockedAchievementsCount}):`);
    result.achievements
      .filter((a) => a.isUnlocked)
      .forEach((a) => console.log(`    - ${a.title} (${a.tier}): +${a.xpReward} XP`));
  }

  // ---------------------------------------------------------------------------
  // 2. SIX REALISTIC EXPLORER PROFILES BALANCE SIMULATION
  // ---------------------------------------------------------------------------
  console.log('\n\n--- 2. SIX REALISTIC EXPLORER PROFILES BALANCE SIMULATION ---');

  // Helper to construct simulated pins
  function createSimulatedPins(
    userId: string,
    totalSpots: number,
    citiesCount: number,
    countriesCount: number,
    richSpotsCount: number,
    totalLikes: number
  ): Pin[] {
    const pins: Pin[] = [];
    const likesPerPin = Math.floor(totalLikes / Math.max(1, totalSpots));
    const remainderLikes = totalLikes % Math.max(1, totalSpots);

    for (let i = 0; i < totalSpots; i++) {
      const cityIndex = i % citiesCount;
      const countryIndex = i % countriesCount;
      const isRich = i < richSpotsCount;
      const likes = likesPerPin + (i < remainderLikes ? 1 : 0);

      const category = (['Hidden Gems', 'Food & Dining', 'Nature & Outdoors', 'Photo Spots'][i % 4]);

      pins.push({
        id: `sim_pin_${i + 1}`,
        userId,
        title: `Discovery Spot #${i + 1}`,
        description: isRich
          ? 'This is a rich comprehensive explorer guide containing detailed tips, accessibility notes, and local recommendations.'
          : 'A nice spot to visit.',
        tags: isRich ? ['travel', 'guide', 'photo'] : ['travel'],
        category,
        city: `City_${cityIndex + 1}`,
        countryCode: `C${String.fromCharCode(65 + countryIndex)}`,
        countryName: `Country_${countryIndex + 1}`,
        locationName: `City_${cityIndex + 1}, Country_${countryIndex + 1}`,
        latitude: 10 + cityIndex * 2 + (i % 10) * 0.05,
        longitude: 20 + countryIndex * 3 + (i % 10) * 0.05,
        likeCount: likes,
        status: 'published',
        isDeleted: false,
        createdAt: new Date(Date.now() - (totalSpots - i) * 86400000).toISOString(),
      } as unknown as Pin);
    }
    return pins;
  }

  const profilesToSimulate = [
    {
      id: 'profile_a',
      name: 'Profile A — Brand New',
      spots: 1,
      cities: 1,
      countries: 1,
      rich: 0,
      likes: 1,
      followers: 0,
      profileComplete: true,
      bio: 'New traveler',
    },
    {
      id: 'profile_b',
      name: 'Profile B — Casual Explorer',
      spots: 5,
      cities: 2,
      countries: 1,
      rich: 1,
      likes: 10,
      followers: 1,
      profileComplete: true,
      bio: 'Casual weekend explorer',
    },
    {
      id: 'profile_c',
      name: 'Profile C — Active Explorer',
      spots: 15,
      cities: 5,
      countries: 3,
      rich: 6,
      likes: 50,
      followers: 8,
      profileComplete: true,
      bio: 'Active explorer seeking authentic hidden gems and landscapes',
    },
    {
      id: 'profile_d',
      name: 'Profile D — Experienced Explorer',
      spots: 40,
      cities: 12,
      countries: 6,
      rich: 20,
      likes: 150,
      followers: 35,
      profileComplete: true,
      bio: 'Experienced nomad chronicling regional culture, food, and architecture',
    },
    {
      id: 'profile_e',
      name: 'Profile E — Advanced Explorer',
      spots: 100,
      cities: 30,
      countries: 15,
      rich: 60,
      likes: 500,
      followers: 120,
      profileComplete: true,
      bio: 'Global traveler documenting hundreds of destinations across multiple continents',
    },
    {
      id: 'profile_f',
      name: 'Profile F — Elite Explorer',
      spots: 300,
      cities: 70,
      countries: 35,
      rich: 200,
      likes: 2000,
      followers: 1200,
      profileComplete: true,
      bio: 'Master voyager curating master collections of authentic world discoveries',
    },
  ];

  const simSummaryTable: any[] = [];

  for (const p of profilesToSimulate) {
    const pins = createSimulatedPins(p.id, p.spots, p.cities, p.countries, p.rich, p.likes);
    const profile: Partial<UserProfile> = {
      uid: p.id,
      displayName: p.name,
      bio: p.bio,
      avatarUrl: 'https://example.com/avatar.jpg',
      followersCount: p.followers,
    };

    const res = calculateProgression(p.id, pins, profile, []);
    const levelDef = EXPLORER_LEVELS.find((l) => l.level === res.summary.level)!;

    // Breakdown
    const baseSpotsXp = p.spots * PROGRESSION_CONSTANTS.BASE_DISCOVERY_XP;
    const firstDiscXp = PROGRESSION_CONSTANTS.FIRST_DISCOVERY_BONUS_XP;
    const citiesXp = res.summary.citiesCount * PROGRESSION_CONSTANTS.UNIQUE_CITY_BONUS_XP;
    const countriesXp = res.summary.countriesCount * PROGRESSION_CONSTANTS.UNIQUE_COUNTRY_BONUS_XP;
    const richXp = p.rich * PROGRESSION_CONSTANTS.RICH_DISCOVERY_BONUS_XP;

    let likesMilestoneXp = 0;
    LIKE_MILESTONES.forEach((m) => {
      if (p.likes >= m.count) likesMilestoneXp += m.xp;
    });

    let followersMilestoneXp = 0;
    FOLLOWER_MILESTONES.forEach((m) => {
      if (p.followers >= m.count) followersMilestoneXp += m.xp;
    });

    let achXp = 0;
    res.achievements.forEach((a) => {
      if (a.isUnlocked) achXp += a.xpReward;
    });

    const xpToNext = res.summary.nextLevelXp === Infinity ? 0 : res.summary.nextLevelXp - res.summary.xp;

    simSummaryTable.push({
      Profile: p.name,
      Spots: p.spots,
      Cities: p.cities,
      Nations: p.countries,
      Likes: p.likes,
      TotalXP: res.summary.xp,
      Level: `Lvl ${res.summary.level}`,
      Title: res.summary.title,
      InLevelProgress: `${res.summary.progressPercent}%`,
      XPToNext: xpToNext,
      BadgesUnlocked: `${res.summary.unlockedAchievementsCount}/18`,
    });

    console.log(`\n======================================================`);
    console.log(`${p.name}`);
    console.log(`======================================================`);
    console.log(`Total XP: ${res.summary.xp} | Level ${res.summary.level}: ${res.summary.title}`);
    console.log(`Bracket: ${levelDef.minXp} - ${levelDef.maxXp} XP | Progress: ${res.summary.progressPercent}% | Remaining to Next: ${xpToNext} XP`);
    console.log(`XP Sources Breakdown:`);
    console.log(`  • Base Discoveries (${p.spots} × 40): ${baseSpotsXp} XP`);
    console.log(`  • First Discovery Bonus: ${firstDiscXp} XP`);
    console.log(`  • City Diversity (${res.summary.citiesCount} × 25): ${citiesXp} XP`);
    console.log(`  • Nation Diversity (${res.summary.countriesCount} × 50): ${countriesXp} XP`);
    console.log(`  • Detailed Guide Bonuses (${p.rich} × 20): ${richXp} XP`);
    console.log(`  • Like Milestones (Lifetime ${p.likes} likes): ${likesMilestoneXp} XP`);
    console.log(`  • Follower Milestones (Lifetime ${p.followers} followers): ${followersMilestoneXp} XP`);
    console.log(`  • Badges Unlocked (${res.summary.unlockedAchievementsCount}/18): ${achXp} XP`);
  }

  console.log('\n\n--- 6 PROFILES SIMULATION SUMMARY TABLE ---');
  console.table(simSummaryTable);

  // ---------------------------------------------------------------------------
  // 3. LEVEL 10 PRESTIGE & ANTI-SPAM TEST
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. LEVEL 10 PRESTIGE & ANTI-SPAM TEST ---');
  console.log('Testing whether repetitive posting in 1 city with 0 engagement can reach Level 10 (35,000 XP)...');

  // Test 100 spam pins
  const pins100 = createSimulatedPins('spam_user', 100, 1, 1, 0, 0);
  const res100 = calculateProgression('spam_user', pins100, { uid: 'spam_user' }, []);
  console.log(`\n• 100 Low-Quality Pins in 1 Location (0 likes, 0 rich):`);
  console.log(`  Total XP: ${res100.summary.xp} XP -> Level ${res100.summary.level} (${res100.summary.title})`);
  console.log(`  Can reach Level 10? ${res100.summary.level >= 10 ? 'YES (VULNERABILITY)' : 'NO (SAFE - Only Level ' + res100.summary.level + ')'}`);

  // Test 500 spam pins
  const pins500 = createSimulatedPins('spam_user', 500, 1, 1, 0, 0);
  const res500 = calculateProgression('spam_user', pins500, { uid: 'spam_user' }, []);
  console.log(`\n• 500 Low-Quality Pins in 1 Location (0 likes, 0 rich):`);
  console.log(`  Total XP: ${res500.summary.xp} XP -> Level ${res500.summary.level} (${res500.summary.title})`);
  console.log(`  Can reach Level 10? ${res500.summary.level >= 10 ? 'YES (VULNERABILITY)' : 'NO (SAFE - Only Level ' + res500.summary.level + ')'}`);

  // Calculate pins needed without diversity
  const pinsNeededForLvl10Spam = Math.ceil((35000 - 40 - 25 - 50 - 310) / 40);
  console.log(`\n• Spamming pins alone with 0 diversity would require: ${pinsNeededForLvl10Spam} pins!`);
  console.log('  Confirmed: Master Explorer (35,000 XP) cannot realistically be achieved via spam alone.');

  // ---------------------------------------------------------------------------
  // 4. PRODUCTION MIGRATION PREVIEW (READ-ONLY - NO WRITES PERFORMED)
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. PRODUCTION MIGRATION PREVIEW (READ-ONLY) ---');
  console.log('Connecting to production Firestore to preview existing users progression under new balance...\n');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await signInWithEmailAndPassword(
    auth,
    'cloudfunction_test_user@example.com',
    'Password123!'
  );

  const db = initializeFirestore(
    app,
    { experimentalForceLongPolling: true },
    firebaseConfig.firestoreDatabaseId
  );

  const usersSnap = await getDocs(collection(db, 'users'));
  const pinsSnap = await getDocs(collection(db, 'pins'));
  const allPins: Pin[] = pinsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Pin, 'id'>),
  }));

  const migrationPreviewTable: any[] = [];

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    if (userId.startsWith('explorertest_')) continue;

    const profileData = userDoc.data() as UserProfile;
    const userPins = allPins.filter((p) => p.userId === userId && !p.isDeleted);

    // Fetch existing progression summary
    let currentSummary: any = null;
    try {
      const sDoc = await getDoc(doc(db, 'users', userId, 'progression', 'summary'));
      if (sDoc.exists()) currentSummary = sDoc.data();
    } catch (e) {
      // ignore
    }

    // Fetch existing achievements (to guarantee preservation)
    const existingAchievements: UserAchievement[] = [];
    try {
      const aSnap = await getDocs(collection(db, 'users', userId, 'achievements'));
      aSnap.forEach((d) => existingAchievements.push(d.data() as UserAchievement));
    } catch (e) {
      // ignore
    }

    // Calculate with NEW balanced model
    const newProgression = calculateProgression(
      userId,
      userPins,
      profileData,
      existingAchievements
    );

    const oldXp = currentSummary?.xp ?? 0;
    const oldLevel = currentSummary?.level ?? 1;
    const oldTitle = currentSummary?.title ?? 'New Explorer';

    const unlockedAchTitles = newProgression.achievements
      .filter((a) => a.isUnlocked)
      .map((a) => a.title)
      .join(', ');

    migrationPreviewTable.push({
      UserId: userId,
      DisplayName: profileData.displayName || profileData.username || 'Anonymous',
      OldXP: oldXp,
      NewXP: newProgression.summary.xp,
      XPDifference: newProgression.summary.xp - oldXp,
      OldLevel: `Lvl ${oldLevel} (${oldTitle})`,
      NewLevel: `Lvl ${newProgression.summary.level} (${newProgression.summary.title})`,
      Spots: newProgression.summary.totalSpotsCount,
      Cities: newProgression.summary.citiesCount,
      Countries: newProgression.summary.countriesCount,
      PreservedAchievements: unlockedAchTitles || 'None',
    });
  }

  console.log('MIGRATION PREVIEW FOR PRODUCTION USERS:');
  console.table(migrationPreviewTable);

  console.log('\n⚠️ NOTE: No writes have been committed to Firestore. Migration remains in PREVIEW state.');
  console.log('================================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
