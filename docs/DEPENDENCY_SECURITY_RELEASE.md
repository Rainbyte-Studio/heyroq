# Dependency security release

The Functions lockfile upgrades Firebase Admin to 14.5.1 and Firebase Functions
to 7.4.0. The Realtime Database compatibility dependency is pinned to 2.1.7
because the next release requires Node 24. The Functions runtime is Node 22.
Remove the pin when the runtime and SDK support a newer compatible release.

The frontend retains its Bun lockfile and adds an npm lockfile for CI. Both
resolve the patched gRPC dependency and the other updated transitive packages.
When updating frontend dependencies, refresh both lockfiles and check both
installation paths. The frontend and Functions CI jobs use `npm ci` to
exercise the reviewed dependency trees.

Verification from a clean checkout on Node 22:

- Run `npm ci`, `npm run lint`, `npm run build`, `npm test` and `npm audit`.
- Verify a clean `bun install --frozen-lockfile`, frontend build and `bun audit`.
- Run `npm ci --prefix functions --engine-strict`, `npm --prefix functions run build`
  and `npm --prefix functions audit`.
- Run the Functions progression and Firestore rules suites on demo emulators.
  After a Functions SDK major upgrade, check function loading and trigger registration.

No data migration is required. After explicit approval, follow
[FIREBASE_RELEASE_CHECKLIST.md](FIREBASE_RELEASE_CHECKLIST.md) for the Functions
release and [RELEASE_PROCESS.md](RELEASE_PROCESS.md) for the existing Google AI
Studio publish flow. Before production, smoke-test pin creation and progression,
sign-in, and callable account deletion with disposable staging users. Confirm
that the Functions bind to the named Heyroq database
`ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3`.
