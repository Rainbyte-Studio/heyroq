# Geography v1.1 progression reset

Activation establishes a fresh authoritative generation and leaves legacy
summaries, achievements and XP events untouched. The client displays Level 1
and 0 XP when the active summary is absent. Missing achievements use locked
catalog defaults. The activation marker closes legacy progression client reads.
Account, username, profile, pin, photo and relationship records are preserved.

## Inventory and rehearsal

Run `node scripts/reset-explorer-progression.mjs inventory`
with a short-lived Firestore read token supplied through
`HEYROQ_FIRESTORE_READ_TOKEN`. The named production database is fixed.
The command prints counts from a read-only transaction and creates no
backup or file. This command does not write production data.

The script's `rehearse-no-backup` mode requires the loopback emulator, an explicit
`{schemaVersion: 1, mode: "frozen"}` control document, and uses
the fixed demo project. It checks document versions and commits the reset
and versioned reset marker atomically. After an uncertain result, the
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
3. Verify that every route can reach only the intended compatible revision
   for new invocations, and that the account-deletion worker has no active
   lease on a preserved profile. Keep stable Eventarc and Scheduler targets.
   A delayed legacy progression write confined to its old paths is harmless.
   No assumption about old process retirement is needed for those writes.
4. After the compatible Rules and frontend are verified, run
   `node scripts/reset-explorer-progression.mjs initialize-frozen-generation`
   using `HEYROQ_FIRESTORE_RELEASE_TOKEN` in the authorized operator session.
   Expect one marker write and a returned server commit time. The command
   verifies that the generation is empty and the control is frozen. A
   repeat reports the existing marker and cutoff without changing any data.
   Leave legacy records in place. An inventory or rollout mismatch keeps the
   generation frozen. Reconcile forward with the generation-compatible build.
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

### Generation and maintenance cutover

The active summary, achievements and ledger live at
`progressionV11/{uid}/state/summary`, `progressionV11/{uid}/achievements`
and `progressionV11/{uid}/xpEvents`. Neither legacy progression writes
under `users/{uid}` nor a legacy recursive delete of that profile reaches
the active ledger. Updated readers have no fallback to the legacy summary.
Only the compatible account-deletion worker explicitly removes the active
ledger for a legitimate account deletion.

1. Run `node release/progression-isolation.mjs` with the Google session's
   read credential in `HEYROQ_RELEASE_READ_TOKEN`. Exit 2 with the scoped
   routes means the inventory ran and cannot certify retirement. Any
   unexpected endpoint, route or identity blocks production mutations.
2. Pin all replacement artifacts and the awards-disabled recovery package
   from the **same generation**. Older recovery archives use legacy paths
   and are ineligible after the switch.
3. Set the server-only writer document to schema version 1 and frozen.
   Publish compatible Rules, then verify that authorized writes for
   pins, likes, comments and follows are rejected while profile reads
   still work. Record the current image and account-deletion Scheduler
   destinations. Pause the account-deletion job with
   `gcloud scheduler jobs pause heyroq-reconcile-account-deletion --project rainbyte-studio --location europe-west2`.
   Expect state PAUSED on describe. An already dispatched invocation can
   still run. Verify no protected profile has a pending deletion job and
   prove old worker execution retirement independently.
4. Replace existing Functions in place with awarding disabled. Compare
   the source generation, revision, routing, settings, identities,
   Eventarc destination, filters and subscription after each update.
   Keep the Eventarc-managed push subscriptions and stable destinations.
   An incomplete roll keeps the control frozen and account deletion paused.
   Recover forward from the pinned compatible artifact and repeat the
   comparison. During maintenance a new entry point can accept a delayed
   event without awarding it because the active generation is frozen.
5. Verify that any remaining legacy executions are confined to the inactive
   paths. Legacy account-deletion work can affect preserved profiles and
   must be checked independently. Do not use temporary account-deletion
   tombstones as a fence because legacy avatar finalize can remove a file
   when its owner has a tombstone. Defer the legacy physical purge.
6. After verified logical initialization, set `generation: "progressionV11"` and
   `progressionStartsAtMs` to a server-controlled cutoff at or after
   the reset. Verify that legacy inputs are absent before reopening.
   The running control requires both fields. Continue to use the
   separate, post-reset geographic cutoff. With verified compatible
   routing, resume the Scheduler job using the same command with
   `resume` in place of `pause` and expect state ENABLED.

The PR frontend artifact is a smoke build without the production Maps key.
Use the Frontend Release Candidate workflow's `production_profile` dispatch
input for the exact reviewed revision. Expect
`geography-v11-maps-configured` in `BUILD_PROFILE` and verify its artifact
checksum and the published origin. Provision a production-configured immutable
image and verify the live service is compatible with its entrypoint before
routing traffic. An active Geography badge build should only serve once the
award endpoint and Rules are ready.

Legacy cleanup is a separate future operation. Inventory and remove only
old-generation documents after confirming that no supported reader relies on
them and all legacy writers and leases have retired. The release command does
not delete historical progression.
