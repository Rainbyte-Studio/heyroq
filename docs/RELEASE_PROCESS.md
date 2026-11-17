# Heyroq Release Process

This runbook defines the standard human-controlled workflow for incrementing versions, verifying release readiness, tagging commits, and publishing **Heyroq** (`heyroq`).

> **Important Governance Rule:** Automated scripts and AI coding assistants must **never** automatically create Git tags, push branches/PRs, deploy Cloud Functions, or publish production releases without explicit operator execution.

---

## 1. Choosing the Next Version

Refer to [`docs/VERSIONING.md`](./VERSIONING.md) to select the next Semantic Version:

- **Next Beta iteration:** `0.1.0-beta.1` → `0.1.0-beta.2`
- **Feature milestone in Beta:** `0.1.0-beta.2` → `0.2.0-beta.1`
- **Release Candidate for 1.0:** `0.9.0-beta.3` → `1.0.0-rc.1`
- **First Stable GA Release:** `1.0.0-rc.1` → `1.0.0`
- **Stable Patch Fix:** `1.0.0` → `1.0.1`

---

## 2. Step-by-Step Version Increment

1. **Update Root `package.json`**
   Edit `"version"` in `/package.json` (or run `npm version <new-version> --no-git-tag-version` so npm does not auto-create a Git commit/tag prematurely):
   ```bash
   npm version 0.1.0-beta.2 --no-git-tag-version
   ```
   *(Note: `functions/package.json` governs isolated Cloud Functions runtime dependencies and does not need to change for frontend UI releases unless backend function packages are versioned separately.)*

2. **Update `CHANGELOG.md`**
   - Move completed items under `## [Unreleased]` into a new dated section:
     ```markdown
     ## [0.1.0-beta.2] - YYYY-MM-DD
     ```
   - Categorize changes under `Added`, `Changed`, `Fixed`, `Security`, or `Removed`.

3. **Verify Public Legal & Support Configuration**
   - Confirm public routes (`/about`, `/privacy`, `/terms`, `/support`), operational support email (`help@rainbyte.studio`), and optional `releaseChangelogUrl` in `src/config/publicConfig.ts`.
   - Any unverified overrides will intentionally render as `Pending verification` in **About Heyroq**.

---

## 3. Pre-Release Verification Suite

Every release candidate must pass all local static, unit, and production build checks before tagging:

```bash
# 1. TypeScript static typecheck
npm run lint

# 2. Automated unit & regression test suite (TypeScript + CJS contract tests)
npm test
node --test tests/firestoreDeployTarget.test.cjs tests/publicProfileBlueprint.test.cjs

# 3. Production frontend bundle compilation
npm run build
```

If backend Cloud Functions or Firestore rules were touched in the release cycle, also run the backend verification steps documented in [`docs/FIREBASE_RELEASE_CHECKLIST.md`](./FIREBASE_RELEASE_CHECKLIST.md):

```bash
npm --prefix functions run build
npm run test:rules:emulator
```

---

## 4. ManualUI & Accessibility Smoke Check

Before publishing, verify in browser preview (desktop `>= 1280px` and mobile `375px`–`430px` viewports):

1. Open the authenticated account dropdown → click **About Heyroq**:
   - Confirm `heyroq.` wordmark, version (`vX.Y.Z`), release channel (`Beta` / `RC` / `Stable`), and `Build Identifier` match `package.json`.
   - Test **Copy Build Info** and confirm `Escape` closes **About Heyroq** cleanly.
2. Open **My Profile & Spots** → verify the **About** action and profile footer version string match `APP_VERSION`, and that pressing `Escape` inside **About Heyroq** returns to Profile without closing Profile underneath.
3. Verify Greek (`Αθήνα`, `Θεσσαλονίκη`, `Εξερεύνηση`) and Latin text render cleanly in `Plus Jakarta Sans` / `Manrope` with zero layout shift.
4. Verify map discovery (`RECENT` / `POPULAR` / `TRENDING`), `HIDE` / `SHOW` pin markers, and `Progression & Badges` navigation work without regression.

---

## 5. Git Tagging (Operator-Executed Only)

Once the release commit is merged to the target branch in Git:

```bash
# Ensure working tree is clean and on the target commit
git status

# Create an annotated SemVer tag prefixed with "v"
git tag -a v0.1.0-beta.1 -m "Heyroq v0.1.0-beta.1 (Beta)"

# Push commit and tag explicitly
git push origin main
git push origin v0.1.0-beta.1
```

---

## 6. Publishing & Deployment Separation

Heyroq separates **Frontend Hosting** from **Firebase Backend Infrastructure** (see [`docs/FIREBASE_RELEASE_CHECKLIST.md`](./FIREBASE_RELEASE_CHECKLIST.md)):

1. **Frontend Web App**:
   - Published through **Google AI Studio** hosting / deployment controls after `npm run build` and `npm run lint` succeed.
   - **Never** run unrestricted `firebase deploy` for frontend releases (`firebase.json` intentionally has no Firebase Hosting target).
2. **Firebase Backend (Firestore Rules, Indexes, Storage, Cloud Functions)**:
   - Deployed **only** when backend files actually changed, using the explicit scoped commands in [`docs/FIREBASE_RELEASE_CHECKLIST.md`](./FIREBASE_RELEASE_CHECKLIST.md) against project `rainbyte-studio` and named Firestore database `ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3`.
