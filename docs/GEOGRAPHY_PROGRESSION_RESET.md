# Geography v1.1 progression reset

The reset drops old progression for existing profiles. The client displays
Level 1 and 0 XP when the summary is absent. Missing achievements use the
locked catalog defaults. The migration deletes the existing per-user
`progression`, `achievements`, and `xpEvents` documents, and removes only
the two legacy profile fields `citiesCount` and `countriesCount`. Auth,
user documents, usernames, photos, pins, posts, follows, and publication
receipts remain outside the deletion scope.

## Inventory and rehearsal

Run `node scripts/reset-explorer-progression.mjs plan NEW_BACKUP_PATH`
with a short-lived Firestore read token supplied through
`HEYROQ_FIRESTORE_READ_TOKEN`. The named production database is fixed.
Keep the inventory file private because it contains Firestore paths and
unredacted progression documents. The transaction supplies one snapshot,
the backup preserves Firestore value types, and the file records the exact
document operations and preconditions. The command prints counts and the
SHA-256 after reading the backup back. It has no production write mode.

The same script's `rehearse` mode requires the loopback emulator, an explicit
`{schemaVersion: 1, mode: "frozen"}` control document, and uses
the fixed demo project. It checks document versions and commits the reset
and backup-checksum marker atomically. After an uncertain result, the
marker prevents a second pass from deleting newly earned records. The
selective operation deliberately aborts if it finds preserved pins,
posts, publication receipts, follow edges, or nonzero follower counts.
The current progression engine reads those inputs during recalculation.
If any exist, use epoch-aware eligibility before attempting a reset and
prove preserved historical inputs cannot recreate old awards. Abort on
any data or runtime path outside the reviewed inventory.

## Production release gates

1. Refresh the actual deployed sources, IAM, Cloud Run routes and tags,
   Functions and Scheduler inventory, Eventarc trigger filters and delivery
   identities, and Pub/Sub subscriptions and dead-letter settings. Review
   direct Firestore writers and maintenance tooling as well. Compare with
   `progression-deployment-manifest.json` and pin the exact frontend,
   Rules, and Functions artifacts. Verify the frontend supports managed
   photo claims and same-commit publication receipts.
2. Deploy the freeze-capable runtime while production still has its old data.
   The `progressionMaintenance/writers` document must be explicitly frozen.
   Missing or unrecognized state also closes the writer. The actual XP write
   transaction verifies the same control document version as the computation.
   Account-deletion intake and new worker leases also honor the freeze.
   Existing deletion leases must drain before a reset. Replace every
   legacy writer in place while preserving triggers and identities.
   Include pin create/delete, both like handlers, both follower handlers,
   profile progression updates, and callable recalculation. Include pin
   update when provisioned. Inspect comment handlers and account-deletion
   intake, Gen1 Auth deletion and queued deletion work for cascades.
   Preserve delivery for non-progression side effects during the freeze.
3. Establish that tagged URLs and all other legacy destinations are
   unreachable, that in-flight legacy requests have drained, and that
   queued deliveries resolve only to safe runtimes. Keep the destination
   service, trigger, filters and subscription intact across in-place source
   updates. Verify there are no old revision routes or tags. Confirm old
   revision instance counts have reached zero with current metrics and
   account for monitoring latency. An HTTP timeout can leave an old instance
   executing. Inspect Scheduler dispatches and held account-deletion leases.
   Compare Firestore audit evidence during the freeze if available. Verify the rollback
   destinations too. A client write freeze or 100% latest-revision
   traffic alone does not establish these conditions. Use an explicit
   cutoff enforced on the persisted pin creation timestamp and reject
   delayed pre-cutoff Geography awards.
4. Under the verified freeze, repeat the inventory and check exact paths
   and values against the backup. Rehearse restoration of that snapshot
   in the emulator. Implement the production commit against the same
   inspected snapshot with concurrency preconditions and the atomic
   marker. Verify the result while writers are frozen and reconcile
   protected account/profile/content inventories. Keep the snapshot and
   its hash private. On drift, stop before committing and take a new
   snapshot after resolving the cause.
5. Run full CI on the exact merge candidate. Use
   `HEYROQ_GEOGRAPHY_V11_CAPABLE=true` only on an explicitly authorized
   Geography award runtime. Set the server control's `geographyStartsAtMs` to
   an integer millisecond cutoff strictly after the reset marker create time.
   A capable revision requires a valid reset marker and checks its version
   in the award transaction. Recovery omits the capability and can run
   ordinary progression while preserving existing awards.
   Build the active badge presentation with
   `VITE_GEOGRAPHY_V11_AVAILABLE=true` after verifying backend awarding.
   Verify routes, identities, named Rules,
   and delivery after each update. Smoke-test first qualifying city
   (+25 XP) and country (+150 XP), repeated and concurrent delivery,
   same-city publication and the seven badge definitions. Track Geography
   XP separately from publication and badge XP. Keep the compatible
   awards-disabled recovery artifact available for any post-activation
   fault. Restoring old progression is a separate operation that requires
   a freeze and reconciliation with awards issued after the reset.

## Read-only production preflight

The `writerFreezePreflight` manifest section captures live API responses from
the named database, Cloud Run, Functions and Eventarc on 2026-11-21.
The deployed pin-create and recalculation source archives contain the legacy
award implementation. The current Gen1 Auth deletion archive records
deduplicated deletion receipts and does not enqueue a deletion job or remove
progression. Its role is distinct from the Gen2 legacy reconciliation worker,
which can recursively delete an outgoing profile and its progression.
This snapshot establishes the baseline for per-function updates. It does not
prove that the revisions have drained or that production is frozen.
