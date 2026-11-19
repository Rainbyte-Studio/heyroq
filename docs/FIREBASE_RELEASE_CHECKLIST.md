# Heyroq Firebase release checklist

The frontend is hosted by **Google AI Studio**, not Firebase Hosting. Do not deploy `hosting` through Firebase.

## Production target
- Project: `rainbyte-studio`
- Named Firestore database: `ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3`
- Functions region: `europe-west2`

## Candidate and authorization

PR #30 follow-up changes are a local candidate. Earlier CI results apply to
the earlier head. Hold push, merge and any release action until checks and the
relevant rollout gates are authorized. Use the geographic XP runbook for
pin-image transition, endpoint retry matching, avatar upload closure and deletion-queue recovery. Checked-in Functions runtime parity and both live cleanup dependencies are release gates.

## Before any production write
1. Confirm the latest GitHub Actions checks (frontend, rules emulator, functions emulator) pass.
2. Confirm Google AI Studio's published frontend is compatible with the backend changes; GitHub merges do not publish the AI Studio frontend automatically.
3. Review current production Firebase rules, indexes, deployed Functions, IAM access, and available backups/rollback plan. For the geographic XP freeze, follow the [Functions release and recovery plan](GEOGRAPHY_XP_RELEASE.md).
4. Run locally: `node --test tests/firestoreDeployTarget.test.cjs tests/publicProfileBlueprint.test.cjs`, `npm run lint`, `npm run build`, `npm test`, and `npm --prefix functions run build`.
5. Confirm Firebase CLI identity and target with `firebase login`, `firebase projects:list`, and `firebase use rainbyte-studio`.

## Operator-approved deployment
For the pin image cutover, use the [ordered Rules, Functions and AI Studio release sequence](GEOGRAPHY_XP_RELEASE.md#pin-image-release-sequence) and the [identity release plan](IDENTITY_RELEASE.md). The Firebase Functions predeploy hook blocks the shared codebase. Use separately reviewed Gen 2 plans for any additional Functions. Gen 1 Auth cleanup is outside the rollout scope.

```sh
npx --yes firebase-tools@14.27.0 deploy --project rainbyte-studio --only firestore:rules,firestore:indexes
```

Do **not** run an unrestricted `firebase deploy`, which might deploy Firebase Hosting. Check the CLI identifies the intended named database; stop otherwise. Do not approve unexpected function deletions.

## Legacy email cleanup: separate approval and backup
The existing migration defaults to dry run. With authorized Firebase Admin application credentials:

```sh
export GOOGLE_CLOUD_PROJECT=rainbyte-studio
export FIRESTORE_DATABASE_ID=ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3
node scripts/redact-public-profile-emails.mjs
```

Review the candidate count and verify a recoverable backup. **Only after explicit approval**:

```sh
node scripts/redact-public-profile-emails.mjs --apply --confirm-project=rainbyte-studio
```

Never execute this migration automatically in CI or as part of deployment.

## Post-release smoke test
Check login (Google and email/password), account deletion, pin publishing/deletion, likes, comments, follows, map, XP ledger/summary consistency, and that public user documents do not expose email. Review Cloud Functions logs, permissions errors, and record the deployed commit and recovery steps.

This document does **not** perform a deployment or migration.
