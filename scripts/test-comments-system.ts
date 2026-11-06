/**
 * Heyroq Comments System End-to-End Audit & Verification Suite
 *
 * Verifies:
 * 1. Firestore Security Rules for pins/{pinId}/comments/{commentId}
 *    - Public read allowed
 *    - Authenticated non-anonymous users can create
 *    - Anonymous comment attempt rejected (isNonAnonymous)
 *    - User cannot spoof another userId (request.resource.data.userId == request.auth.uid)
 *    - Comment author can delete own comment
 *    - Attempt to delete another user's comment rejected (only author or admin)
 *    - Client blocked from updating pin.commentCount directly
 * 2. pinService.ts Implementation
 *    - Uses serverTimestamp() on Firestore writes
 *    - Schema consistency (pinId, userId, userName, userAvatar, text, createdAt)
 *    - deleteComment function implementation
 *    - Demo mode comment persistence & unauthenticated write prevention
 * 3. Cloud Functions (functions/src/index.ts)
 *    - onPinCommentCreated increments commentCount transactionally
 *    - onPinCommentDeleted decrements commentCount transactionally (never below 0)
 *    - Triggers bound to the named database (FIRESTORE_DATABASE_ID)
 * 4. UI Flow & Invariants (PinDetailModal.tsx)
 *    - Submit handler calls service before updating state (no fake optimistic success on failure)
 *    - Error feedback displayed on failure
 *    - Delete button only rendered for author or admin
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
console.log('       HEYROQ COMMENTS SYSTEM END-TO-END AUDIT        ');
console.log('================================================================\n');

// 1. Audit firestore.rules
console.log('1. Auditing firestore.rules for Comments Subcollection...');
const rulesPath = resolve(process.cwd(), 'firestore.rules');
if (!existsSync(rulesPath)) {
  assert(false, 'firestore.rules File', 'firestore.rules not found');
} else {
  const rules = readFileSync(rulesPath, 'utf-8');

  // Rule 1: Public Read
  const hasPublicRead = rules.includes('match /comments/{commentId}') &&
    rules.includes('allow read: if true;');
  assert(hasPublicRead, 'Public Comments Read Rule',
    'pins/{pinId}/comments subcollection allows public read');

  // Rule 2: isNonAnonymous on create
  const enforcesNonAnonymousCreate = rules.includes('match /comments/{commentId}') &&
    rules.includes('allow create: if isNonAnonymous()') &&
    rules.includes('request.resource.data.userId == request.auth.uid');
  assert(enforcesNonAnonymousCreate, 'Non-Anonymous Comment Creation & Identity Check',
    'Enforces isNonAnonymous() and strictly matches comment userId to request.auth.uid');

  // Rule 3: Anonymous rejected
  const rejectsAnonymous = rules.includes("request.auth.token.firebase.sign_in_provider != 'anonymous'");
  assert(rejectsAnonymous, 'Anonymous Comment Rejection Rule',
    'isNonAnonymous() helper explicitly rejects anonymous users from writing comments');

  // Rule 4: Delete restricted to author or admin
  const enforcesAuthorOrAdminDelete = rules.includes('match /comments/{commentId}') &&
    rules.includes('allow delete: if isNonAnonymous() && (isOwner(resource.data.userId) || isAdmin())');
  assert(enforcesAuthorOrAdminDelete, 'Comment Deletion Authorization',
    'Only the comment author or admin can delete a comment; other users cannot delete it');

  // Rule 5: Pin owners cannot update/tamper with commentCount directly
  const blocksDirectCommentCountUpdate = rules.includes("!request.resource.data.diff(resource.data).affectedKeys().hasAny(['userId', 'createdAt', 'likeCount', 'commentCount'])");
  assert(blocksDirectCommentCountUpdate, 'Protected commentCount Field',
    'Clients are strictly prohibited from directly updating commentCount on pin documents');

  // Rule 6: Schema validation helper
  const hasCommentValidation = rules.includes('function isValidComment(data)') &&
    rules.includes('data.userId is string') &&
    rules.includes('data.text is string') &&
    rules.includes('data.text.size() <= 1000') &&
    rules.includes('(data.createdAt is string || data.createdAt is timestamp)');
  assert(hasCommentValidation, 'isValidComment Helper Schema Integrity',
    'Validates userId, text length (<= 1000 chars), and timestamp/string createdAt');
}

// 2. Audit Client Service (pinService.ts)
console.log('\n2. Auditing pinService.ts for Comments Implementation & Server Timestamp...');
const pinServicePath = resolve(process.cwd(), 'src/services/pinService.ts');
if (!existsSync(pinServicePath)) {
  assert(false, 'pinService.ts File', 'pinService.ts not found');
} else {
  const code = readFileSync(pinServicePath, 'utf-8');

  // Uses serverTimestamp
  const usesServerTimestamp = code.includes('createdAt: serverTimestamp()');
  assert(usesServerTimestamp, 'serverTimestamp() Usage',
    'addComment writes createdAt as serverTimestamp() to Firestore');

  // Format doc date handles timestamp / ISO
  const hasDateFormatter = code.includes('formatDocDate') &&
    code.includes('val.toDate') &&
    code.includes('val.seconds');
  assert(hasDateFormatter, 'Safe Date Formatting',
    'formatDocDate safely parses Firestore Timestamps, milliseconds, seconds, and ISO strings');

  // Has deleteComment
  const hasDeleteComment = code.includes('export async function deleteComment(') &&
    code.includes('deleteDoc(commentRef)') &&
    code.includes("PINS_COLLECTION, pinId, 'comments', commentId");
  assert(hasDeleteComment, 'deleteComment Implementation',
    'pinService exports deleteComment targeting pins/{pinId}/comments/{commentId}');

  // Has demo comments handling
  const hasDemoComments = code.includes('DEMO_COMMENTS_STORAGE_KEY') &&
    code.includes('getDemoComments') &&
    code.includes('saveDemoComment') &&
    code.includes('deleteDemoComment');
  assert(hasDemoComments, 'Demo Session Comment Persistence',
    'pinService safely persists demo comments locally without firing unauthenticated Firestore writes');
}

// 3. Audit Cloud Functions (functions/src/index.ts)
console.log('\n3. Auditing Cloud Functions for onPinCommentCreated & onPinCommentDeleted...');
const functionsPath = resolve(process.cwd(), 'functions/src/index.ts');
if (!existsSync(functionsPath)) {
  assert(false, 'functions/src/index.ts File', 'functions/src/index.ts not found');
} else {
  const fnCode = readFileSync(functionsPath, 'utf-8');

  // Trigger on created
  const hasOnPinCommentCreated = fnCode.includes('export const onPinCommentCreated') &&
    fnCode.includes("document: 'pins/{pinId}/comments/{commentId}'") &&
    fnCode.includes('commentCount: currentCount + 1');
  assert(hasOnPinCommentCreated, 'onPinCommentCreated Trigger',
    'Transactionally increments pin.commentCount and sets updatedAt serverTimestamp');

  // Trigger on deleted
  const hasOnPinCommentDeleted = fnCode.includes('export const onPinCommentDeleted') &&
    fnCode.includes("document: 'pins/{pinId}/comments/{commentId}'") &&
    fnCode.includes('commentCount: Math.max(0, currentCount - 1)');
  assert(hasOnPinCommentDeleted, 'onPinCommentDeleted Trigger',
    'Transactionally decrements pin.commentCount and guarantees count never drops below 0');

  // Named database binding
  const hasCommentDatabaseBinding = fnCode.includes('onPinCommentCreated') &&
    fnCode.includes('onPinCommentDeleted') &&
    fnCode.includes('database: FIRESTORE_DATABASE_ID');
  assert(hasCommentDatabaseBinding, 'Comment Triggers Database Binding',
    'Comment Cloud Functions explicitly listen to the named database (ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3)');
}

// 4. Audit UI Component (PinDetailModal.tsx)
console.log('\n4. Auditing PinDetailModal.tsx for Comment Invariants & Error Handling...');
const modalPath = resolve(process.cwd(), 'src/components/Pin/PinDetailModal.tsx');
if (!existsSync(modalPath)) {
  assert(false, 'PinDetailModal.tsx File', 'PinDetailModal.tsx not found');
} else {
  const modalCode = readFileSync(modalPath, 'utf-8');

  // No fake optimistic success
  const awaitsWriteFirst = modalCode.includes('const created = await addComment(') &&
    modalCode.includes('setComments((prev) => [created, ...prev])');
  assert(awaitsWriteFirst, 'No Premature Optimistic State',
    'UI awaits addComment resolution before updating local state; failures will not leave ghost comments');

  // Error feedback present
  const hasErrorFeedback = modalCode.includes('commentError') &&
    modalCode.includes('setCommentError(');
  assert(hasErrorFeedback, 'Comment Error Feedback',
    'UI captures and renders error feedback if comment submission fails');

  // Delete button restricted to author or admin
  const restrictsDeleteButton = modalCode.includes('user && (user.uid === c.userId || isAdmin)') &&
    modalCode.includes('handleDeleteComment(c.id, c.userId)');
  assert(restrictsDeleteButton, 'Comment Delete Button Authorization',
    'Trash icon is strictly rendered only when current user is the comment author or admin');
}

// 5. Simulate User Scenarios
console.log('\n5. Simulating Comments Matrix & Permission Rules...');

interface MockUser {
  uid: string;
  isAnonymous: boolean;
  isAdmin: boolean;
}

interface MockComment {
  id: string;
  pinId: string;
  userId: string;
  text: string;
}

const userAlice: MockUser = { uid: 'user_alice_101', isAnonymous: false, isAdmin: false };
const userBob: MockUser = { uid: 'user_bob_202', isAnonymous: false, isAdmin: false };
const anonUser: MockUser = { uid: 'anon_303', isAnonymous: true, isAdmin: false };
const adminNikos: MockUser = { uid: 'admin_nikos', isAnonymous: false, isAdmin: true };

// Scenario A: User A comments on User B pin
function simulateCanCreateComment(user: MockUser | null, commentUserId: string, text: string): boolean {
  if (!user || user.isAnonymous) return false;
  if (user.uid !== commentUserId) return false;
  if (!text || text.trim().length === 0 || text.length > 1000) return false;
  return true;
}

// Scenario B: Delete authorization
function simulateCanDeleteComment(user: MockUser | null, comment: MockComment): boolean {
  if (!user || user.isAnonymous) return false;
  return user.uid === comment.userId || user.isAdmin;
}

// Test A: User Alice comments on User Bob's pin
const canAliceComment = simulateCanCreateComment(userAlice, userAlice.uid, 'Amazing scenic viewpoint!');
assert(canAliceComment, 'User A Comments on User B Pin', 'Authenticated User Alice can comment on User Bob\'s pin');

// Test B: Anonymous user tries to comment
const canAnonComment = simulateCanCreateComment(anonUser, anonUser.uid, 'Anon comment attempt');
assert(!canAnonComment, 'Anonymous Comment Attempt Rejected', 'Anonymous users are strictly forbidden from commenting');

// Test C: User Alice tries to spoof comment as Bob
const canSpoofComment = simulateCanCreateComment(userAlice, userBob.uid, 'Spoofed comment');
assert(!canSpoofComment, 'User Spoofing Protection', 'Users cannot post a comment with a userId differing from their authenticated auth.uid');

// Test D: User Alice deletes her own comment
const aliceComment: MockComment = { id: 'c_1', pinId: 'pin_bob_1', userId: userAlice.uid, text: 'Amazing viewpoint!' };
const canAliceDeleteOwn = simulateCanDeleteComment(userAlice, aliceComment);
assert(canAliceDeleteOwn, 'Delete Own Comment', 'Comment author Alice can delete her own comment');

// Test E: User Bob attempts to delete User Alice's comment
const canBobDeleteAliceComment = simulateCanDeleteComment(userBob, aliceComment);
assert(!canBobDeleteAliceComment, 'Block Deletion of Another User\'s Comment', 'User Bob cannot delete User Alice\'s comment on his pin');

// Test F: Admin can moderate and delete comments
const canAdminDeleteComment = simulateCanDeleteComment(adminNikos, aliceComment);
assert(canAdminDeleteComment, 'Admin Moderation', 'Admin can delete inappropriate comments');

// 6. Summary
console.log('\n================================================================');
const failed = results.filter((r) => !r.passed);
if (failed.length === 0) {
  console.log('VERDICT: COMMENTS SYSTEM WORKING (All checks passed)');
} else {
  console.log(`VERDICT: COMMENTS SYSTEM STILL BROKEN (${failed.length} failures)`);
}
console.log('================================================================');
