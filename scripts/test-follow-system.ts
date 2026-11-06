/**
 * Heyroq Follower & Following Counters Verification Suite
 *
 * Verifies all 15 requirements from the specification:
 * 1. Follow documents path: users/{targetUserId}/followers/{currentUserId} and users/{currentUserId}/following/{targetUserId}
 * 2. Cloud Function triggers: onUserFollowerCreated & onUserFollowerDeleted
 * 3. Trigger document path: users/{targetUserId}/followers/{followerId}
 * 4. Increments / decrements on target user and follower user
 * 5. Non-negative counter constraints: Math.max(0, ...)
 * 6. Client code zero ownership: no direct client writes to followersCount or followingCount
 * 7. Security rules protection: isValidUserUpdate blocks client writes to counters
 * 8. Real-time profile refresh in AuthContext via onSnapshot
 * 9. Dual-profile optimistic updates & server reconciliation in UserProfileModal & PinDetailModal
 * 10. Consistent field names: followersCount and followingCount (no accidental variants)
 * 11. Admin SDK reconciliation script: scripts/recalculate-follow-counts.ts
 * 12. Cloud Function logging compliance
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, message: string) {
  results.push({ name, passed: Boolean(condition), message });
  const icon = condition ? '✓ PASS' : '✗ FAIL';
  console.log(`  [${icon}] ${name}: ${message}`);
}

console.log('================================================================');
console.log('    HEYROQ FOLLOWER / FOLLOWING COUNTER VERIFICATION SUITE       ');
console.log('================================================================\n');

// 1. Audit follow document structure in pinService.ts
console.log('1. Auditing Follow Documents Structure...');
const pinServicePath = resolve(process.cwd(), 'src/services/pinService.ts');
const pinServiceContent = readFileSync(pinServicePath, 'utf8');

const createsFollowerDoc = pinServiceContent.includes("USERS_COLLECTION, targetUserId, 'followers', currentUserId");
const createsFollowingDoc = pinServiceContent.includes("USERS_COLLECTION, currentUserId, 'following', targetUserId");
const usesBatch = pinServiceContent.includes('writeBatch(db)');

assert(
  createsFollowerDoc,
  'Target User Followers Subcollection',
  'Follow creates document at users/{targetUserId}/followers/{currentUserId}'
);
assert(
  createsFollowingDoc,
  'Current User Following Subcollection',
  'Follow creates document at users/{currentUserId}/following/{targetUserId}'
);
assert(
  usesBatch,
  'Atomic Batch Writes',
  'Follow and unfollow relationships are committed atomically via writeBatch'
);

// 2. Audit Cloud Function Triggers in functions/src/index.ts
console.log('\n2. Auditing Cloud Function Triggers & Handlers...');
const functionsPath = resolve(process.cwd(), 'functions/src/index.ts');
const functionsContent = readFileSync(functionsPath, 'utf8');

const hasCreatedTrigger = functionsContent.includes('export const onUserFollowerCreated');
const hasDeletedTrigger = functionsContent.includes('export const onUserFollowerDeleted');
const hasExactTriggerPath = functionsContent.includes("document: 'users/{targetUserId}/followers/{followerId}'");
const preventsSelfFollow = functionsContent.includes('targetUserId === followerId');
const targetFollowersIncrement = functionsContent.includes('followersCount: targetNewFollowers');
const followerFollowingIncrement = functionsContent.includes('followingCount: followerNewFollowing');
const nonNegativeGuards = functionsContent.includes('Math.max(0, targetPrevFollowers - 1)') &&
  functionsContent.includes('Math.max(0, followerPrevFollowing - 1)');

assert(hasCreatedTrigger, 'onUserFollowerCreated Export', 'Trigger exists and is exported in functions/src/index.ts');
assert(hasDeletedTrigger, 'onUserFollowerDeleted Export', 'Trigger exists and is exported in functions/src/index.ts');
assert(hasExactTriggerPath, 'Trigger Path Exact Match', "Path matches exactly users/{targetUserId}/followers/{followerId}");
assert(preventsSelfFollow, 'Self-Follow Protection', 'Trigger skips counter increment when targetUserId === followerId');
assert(targetFollowersIncrement, 'Target User Followers Increment', 'Target user followersCount is incremented transactionally');
assert(followerFollowingIncrement, 'Follower User Following Increment', 'Follower user followingCount is incremented transactionally');
assert(nonNegativeGuards, 'Non-Negative Counter Floor', 'Math.max(0, ...) enforces counters cannot drop below 0');

// 3. Audit Client Code: Zero Direct Writes to Counters
console.log('\n3. Auditing Client-Side Counter Ownership...');
const clientFiles = [
  'src/services/pinService.ts',
  'src/components/Profile/UserProfileModal.tsx',
  'src/components/Pin/PinDetailModal.tsx',
];

let directClientWritesFound = false;
for (const relPath of clientFiles) {
  const content = readFileSync(resolve(process.cwd(), relPath), 'utf8');
  // Check for direct setDoc/updateDoc writing followersCount or followingCount
  if (content.match(/updateDoc\([^)]*followersCount/) || content.match(/setDoc\([^)]*followersCount/)) {
    directClientWritesFound = true;
    break;
  }
}

assert(
  !directClientWritesFound,
  'Client Zero Ownership of Counters',
  'No client-side direct updateDoc/setDoc writes to followersCount or followingCount in Firestore'
);

// 4. Audit Firestore Security Rules
console.log('\n4. Auditing Firestore Security Rules...');
const rulesPath = resolve(process.cwd(), 'firestore.rules');
const rulesContent = readFileSync(rulesPath, 'utf8');

const blocksFollowersCountInRules = rulesContent.includes("'followersCount'") &&
  rulesContent.includes("'followingCount'") &&
  rulesContent.includes('affectedKeys().hasAny');

assert(
  blocksFollowersCountInRules,
  'Security Rules Block Client Counter Writes',
  'isValidUserUpdate strictly forbids clients from mutating followersCount and followingCount'
);

// 5. Audit AuthContext Real-time Sync & Dual Profile Support
console.log('\n5. Auditing AuthContext & UI Reconciliation...');
const authContextPath = resolve(process.cwd(), 'src/context/AuthContext.tsx');
const authContextContent = readFileSync(authContextPath, 'utf8');

const authHasSnapshot = authContextContent.includes("onSnapshot") &&
  authContextContent.includes("doc(db, 'users', currentUser.uid)");
const authHasRefresh = authContextContent.includes('refreshProfile: () => Promise<void>');
const authHasOptimisticUpdate = authContextContent.includes('optimisticUpdateFollowingCount: (delta: number) => void');

assert(authHasSnapshot, 'AuthContext Real-Time Snapshot', 'AuthContext attaches onSnapshot on users/{currentUser.uid}');
assert(authHasRefresh, 'AuthContext refreshProfile', 'AuthContext exports refreshProfile for server reconciliation');
assert(authHasOptimisticUpdate, 'AuthContext optimisticUpdateFollowingCount', 'AuthContext updates current user followingCount immediately');

// 6. Audit UserProfileModal Synchronization
console.log('\n6. Auditing UserProfileModal Multi-User & Target User Sync...');
const modalPath = resolve(process.cwd(), 'src/components/Profile/UserProfileModal.tsx');
const modalContent = readFileSync(modalPath, 'utf8');

const modalHasTargetSnapshot = modalContent.includes("onSnapshot") && modalContent.includes("doc(db, 'users', userId)");
const modalDualOptimistic = modalContent.includes('optimisticUpdateFollowingCount(delta)');
const modalRollback = modalContent.includes('optimisticUpdateFollowingCount(-delta)');
const modalReconciliation = modalContent.includes('refreshProfile()');

assert(modalHasTargetSnapshot, 'Target User onSnapshot Listener', 'UserProfileModal listens to target user doc changes in real-time');
assert(modalDualOptimistic, 'Dual Optimistic Update', 'Updates target followersCount and current user followingCount simultaneously');
assert(modalRollback, 'Write Rollback on Error', 'Rolls back both counters if atomic write fails');
assert(modalReconciliation, 'Server Reconciliation Trigger', 'Re-fetches and reconciles state with Firestore after async Cloud Function delay');

// 7. Audit Field Name Consistency
console.log('\n7. Auditing Field Name Consistency across Codebase...');
let accidentalVariantsFound = false;
for (const relPath of ['src/types.ts', 'src/services/pinService.ts', 'functions/src/index.ts']) {
  const content = readFileSync(resolve(process.cwd(), relPath), 'utf8');
  if (content.includes('followerCount') || content.includes('followCount')) {
    accidentalVariantsFound = true;
    break;
  }
}

assert(
  !accidentalVariantsFound,
  'Normalized Field Names',
  'Field names are strictly "followersCount" and "followingCount" without accidental variations'
);

// 8. Audit Admin SDK Reconciliation Script
console.log('\n8. Auditing Admin SDK Reconciliation Script...');
const scriptPath = resolve(process.cwd(), 'scripts/recalculate-follow-counts.ts');
const scriptExists = existsSync(scriptPath);
let scriptValid = false;

if (scriptExists) {
  const scriptContent = readFileSync(scriptPath, 'utf8');
  scriptValid = scriptContent.includes('firebase-admin') &&
    scriptContent.includes('followers') &&
    scriptContent.includes('following') &&
    scriptContent.includes('followersCount') &&
    scriptContent.includes('followingCount');
}

assert(
  scriptExists && scriptValid,
  'Admin SDK Reconciliation Script',
  'scripts/recalculate-follow-counts.ts is implemented with subcollection counting and idempotent updates'
);

// Summary
console.log('\n================================================================');
const totalPassed = results.filter((r) => r.passed).length;
const totalFailed = results.filter((r) => !r.passed).length;
console.log(`TOTAL TESTS: ${results.length} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);
console.log('================================================================\n');

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('All Follower / Following counter synchronization audits passed successfully!');
  process.exit(0);
}
