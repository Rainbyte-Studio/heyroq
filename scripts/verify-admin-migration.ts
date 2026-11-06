import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  initializeFirestore,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  doc,
  query,
  limit,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

interface TestResult {
  id: string;
  category: string;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: TestResult[] = [];

function recordTest(
  id: string,
  category: string,
  name: string,
  expected: string,
  actual: string,
  passed: boolean,
  details?: string
) {
  const result: TestResult = {
    id,
    category,
    name,
    expected,
    actual,
    status: passed ? 'PASS' : 'FAIL',
    details,
  };
  results.push(result);
  console.log(`[${result.status}] [${id}] ${name}`);
  console.log(`       Expected: ${expected} | Actual: ${actual}`);
  if (details) console.log(`       Details: ${details}`);
}

async function runAudit() {
  console.log('================================================================');
  console.log('    HEYROQ PRODUCTION ADMIN MIGRATION SECURITY VERIFICATION     ');
  console.log('================================================================\n');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(
    app,
    { experimentalForceLongPolling: true },
    firebaseConfig.firestoreDatabaseId
  );

  // -------------------------------------------------------------------------
  // TEST A: Unauthenticated User
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Testing Unauthenticated Access ---');
  await signOut(auth).catch(() => {});

  try {
    const reportsRef = collection(db, 'reports');
    await getDocs(query(reportsRef, limit(1)));
    recordTest('A.1', 'Unauthenticated', 'Read /reports collection', 'DENIED', 'ALLOWED', false);
  } catch (err: any) {
    recordTest('A.1', 'Unauthenticated', 'Read /reports collection', 'DENIED', 'DENIED', true, err.code || err.message);
  }

  try {
    const adminRef = doc(db, 'admins', 'unauth_test');
    await setDoc(adminRef, { admin: true });
    recordTest('A.2', 'Unauthenticated', 'Write to /admins', 'DENIED', 'ALLOWED', false);
  } catch (err: any) {
    recordTest('A.2', 'Unauthenticated', 'Write to /admins', 'DENIED', 'DENIED', true, err.code || err.message);
  }

  // -------------------------------------------------------------------------
  // TEST B & C: Test User (cloudfunction_test_user@example.com)
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Testing Test User (cloudfunction_test_user@example.com) ---');
  let testUserCred;
  try {
    testUserCred = await signInWithEmailAndPassword(
      auth,
      'cloudfunction_test_user@example.com',
      'Password123!'
    );
    console.log('Signed in as test user UID:', testUserCred.user.uid);
  } catch (err: any) {
    console.error('Failed to sign in as test user:', err);
  }

  if (testUserCred) {
    // Check custom claims
    const tokenResult = await testUserCred.user.getIdTokenResult(true);
    const hasAdminClaim = Boolean(tokenResult.claims.admin);
    const hasRoleAdminClaim = tokenResult.claims.role === 'admin';
    recordTest(
      'C.1',
      'Test User',
      'Custom claim admin: true present',
      'NONE',
      hasAdminClaim ? 'PRESENT' : 'NONE',
      !hasAdminClaim
    );

    // Test Reading /reports (Requires isAdmin())
    try {
      const reportsRef = collection(db, 'reports');
      await getDocs(query(reportsRef, limit(1)));
      recordTest('C.2', 'Test User', 'Read /reports (Admin Only)', 'DENIED', 'ALLOWED', false, 'SECURITY BREACH: Test user still has admin read access!');
    } catch (err: any) {
      recordTest('C.2', 'Test User', 'Read /reports (Admin Only)', 'DENIED', 'DENIED', true, `Access blocked: ${err.code}`);
    }

    // Test Writing to /reports (Updating report status - Requires isAdmin())
    try {
      const reportRef = doc(db, 'reports', 'test_fake_report');
      await updateDoc(reportRef, { status: 'resolved' });
      recordTest('C.3', 'Test User', 'Update /reports (Admin Only)', 'DENIED', 'ALLOWED', false, 'SECURITY BREACH: Test user still has admin update access!');
    } catch (err: any) {
      recordTest('C.3', 'Test User', 'Update /reports (Admin Only)', 'DENIED', 'DENIED', true, `Access blocked: ${err.code}`);
    }

    // Test Writing to /admins (Requires isAdmin())
    try {
      const adminDoc = doc(db, 'admins', testUserCred.user.uid);
      await setDoc(adminDoc, { admin: true, assignedAt: new Date().toISOString() });
      recordTest('C.4', 'Test User', 'Write to /admins (Admin Only)', 'DENIED', 'ALLOWED', false, 'SECURITY BREACH: Test user wrote to /admins!');
    } catch (err: any) {
      recordTest('C.4', 'Test User', 'Write to /admins (Admin Only)', 'DENIED', 'DENIED', true, `Access blocked: ${err.code}`);
    }

    // Test Self-Promotion on own user doc: setting role: "admin"
    try {
      const myUserDoc = doc(db, 'users', testUserCred.user.uid);
      await updateDoc(myUserDoc, { role: 'admin' });
      recordTest('E.1', 'Self-Promotion', 'Update user document with role: "admin"', 'DENIED', 'ALLOWED', false, 'SECURITY BREACH: Normal user changed role to admin!');
    } catch (err: any) {
      recordTest('E.1', 'Self-Promotion', 'Update user document with role: "admin"', 'DENIED', 'DENIED', true, `Protected field write blocked: ${err.code}`);
    }

    // Test Self-Promotion on own user doc: setting admin: true
    try {
      const myUserDoc = doc(db, 'users', testUserCred.user.uid);
      await updateDoc(myUserDoc, { admin: true });
      recordTest('E.2', 'Self-Promotion', 'Update user document with admin: true', 'DENIED', 'ALLOWED', false, 'SECURITY BREACH: Normal user added admin field!');
    } catch (err: any) {
      recordTest('E.2', 'Self-Promotion', 'Update user document with admin: true', 'DENIED', 'DENIED', true, `Protected field write blocked: ${err.code}`);
    }

    // Test Self-Promotion on own user doc: setting isAdmin: true
    try {
      const myUserDoc = doc(db, 'users', testUserCred.user.uid);
      await updateDoc(myUserDoc, { isAdmin: true });
      recordTest('E.3', 'Self-Promotion', 'Update user document with isAdmin: true', 'DENIED', 'ALLOWED', false, 'SECURITY BREACH: Normal user added isAdmin field!');
    } catch (err: any) {
      recordTest('E.3', 'Self-Promotion', 'Update user document with isAdmin: true', 'DENIED', 'DENIED', true, `Protected field write blocked: ${err.code}`);
    }

    // Test deleting another user's pin (Requires isOwner or isAdmin)
    try {
      const otherPinDoc = doc(db, 'pins', 'QCi5GdjStN5o2uXyBWlT'); // Pin owned by Nikos
      await updateDoc(otherPinDoc, { title: 'Hacked by test user' });
      recordTest('G.1', 'Privileged Action', 'Modify another user pin without admin', 'DENIED', 'ALLOWED', false);
    } catch (err: any) {
      recordTest('G.1', 'Privileged Action', 'Modify another user pin without admin', 'DENIED', 'DENIED', true, `Access blocked: ${err.code}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST D: Inspect Verified Production Admin & Normal User in Firestore
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Verifying Firestore User States ---');
  // Read production admin profile
  const adminProfileSnap = await getDoc(doc(db, 'users', '1XUiIYnfOWTG7uFU736I25CskZU2'));
  const adminData = adminProfileSnap.data();
  console.log('Production Admin Firestore Doc:', {
    exists: adminProfileSnap.exists(),
    uid: adminData?.uid,
    email: adminData?.email,
    displayName: adminData?.displayName,
    role: adminData?.role,
  });

  recordTest(
    'D.1',
    'Production Admin',
    'Owner profile matches UID & email',
    '1XUiIYnfOWTG7uFU736I25CskZU2 / n.kalogerogiannis@gmail.com',
    `${adminData?.uid} / ${adminData?.email}`,
    adminData?.uid === '1XUiIYnfOWTG7uFU736I25CskZU2' && adminData?.email === 'n.kalogerogiannis@gmail.com'
  );

  // Read normal user profile (drosoulager@gmail.com)
  const normalProfileSnap = await getDoc(doc(db, 'users', 'RDsaxzejcYRty9ZMKvscvgCXLpt2'));
  const normalData = normalProfileSnap.data();
  console.log('Normal User Firestore Doc:', {
    exists: normalProfileSnap.exists(),
    uid: normalData?.uid,
    email: normalData?.email,
    displayName: normalData?.displayName,
    role: normalData?.role,
  });

  recordTest(
    'B.1',
    'Normal User',
    'Normal user drosoulager@gmail.com role is user',
    'user',
    normalData?.role || 'user',
    (normalData?.role || 'user') === 'user'
  );

  // Read system_curator entity
  const curatorSnap = await getDoc(doc(db, 'users', 'system_curator'));
  const curatorData = curatorSnap.data();
  console.log('System Curator Firestore Doc:', {
    exists: curatorSnap.exists(),
    uid: curatorData?.uid,
    displayName: curatorData?.displayName,
    isSystemEntity: curatorData?.isSystemEntity,
  });

  recordTest(
    'S.1',
    'System Entity',
    'system_curator preserved as editorial system entity',
    'system_curator (no auth admin)',
    `${curatorData?.uid} (${curatorData?.displayNameLower || 'heyroq editorial'})`,
    curatorData?.uid === 'system_curator' && curatorData?.role !== 'admin'
  );

  // Read /admins collection
  const adminsCollectionSnap = await getDocs(collection(db, 'admins'));
  recordTest(
    'M.1',
    'Admins Collection',
    '/admins collection document count',
    '0',
    String(adminsCollectionSnap.docs.length),
    adminsCollectionSnap.docs.length === 0,
    'No unnecessary admin records created'
  );

  console.log('\n================================================================');
  console.log('                       VERIFICATION SUMMARY                     ');
  console.log('================================================================');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`Total Tests: ${results.length} | PASSED: ${passCount} | FAILED: ${failCount}\n`);

  process.exit(failCount > 0 ? 1 : 0);
}

runAudit().catch(console.error);
