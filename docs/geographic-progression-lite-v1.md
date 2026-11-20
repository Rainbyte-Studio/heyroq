# Geographic Progression Lite v1.0

This candidate layers a dormant resolver and geographic rewards over
[Achievement System v1.1](achievement-system-v1-1.md). The compiled policy returns
undefined. No credentials, dataset, network provider, new database, or frontend
map changes are included. An environment variable alone cannot activate rewards.

## Coverage and licensing decision

| Source | Suitability |
| --- | --- |
| [Natural Earth 1:10m Admin 0](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/) | Best country prototype input. Its [public domain terms](https://www.naturalearthdata.com/about/terms-of-use/) permit copying and modification, including keeping derived IDs and an offline index. Its generalized boundaries represent a de facto worldview. Islands, coastlines, disputed claim overlays and territory-to-ISO mapping require review before use. |
| [GeoNames offline export](https://www.geonames.org/export/) | Attribution license permits local copies and durable derived outputs subject to attribution and the applicable license. Gazetteer centers and IDs can inform the city catalog. A nearby center alone cannot prove city containment or securely distinguish neighboring settlements. Pin a release, retain origin and attribution, and curate mergers, duplicates and successors behind stable Heyroq IDs. |
| [geoBoundaries gbOpen](https://www.geoboundaries.org/api.html) | Potential country/municipal inputs, with per-boundary origin and license metadata. Verify licenses and obligations per feature and the coverage of actual urban localities before accepting a version. Administrative units have different meanings by jurisdiction. |
| Google Maps / Places / Geocoding | Display only in this release. The [EEA service terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms), [standard platform terms](https://cloud.google.com/maps-platform/terms) and [Geocoding policy](https://developers.google.com/maps/documentation/geocoding/policies) need agreement-specific review. The place ID caching exception does not establish permission to retain derived rewards and counts. |

Current production coverage of this resolver is **zero**. No exact licensed
corpus has been approved for reward-grade coverage. A candidate should define
“city” as a curated populated locality with a reviewed interior footprint:
one stable ID per locality, across languages and refreshes, independent of
neighborhood names, municipality hierarchy or metro area. City can abstain
within a confident country. Require a single confident country with an assigned
[ISO 3166-1 alpha-2 code](https://www.iso.org/glossary-for-iso-3166.html).
Treat overlapping claims, conflicting polygons, uncertain territory/ISO
relations, ocean and uncovered points as unresolved. Define boundary and coast
buffers for each reviewed dataset using its generalization error and measured
test fixtures. Include small islands, enclaves, antimeridian, disputed areas and
border/coast cases. A worldwide basemap provides no assurance of worldwide
reward coverage. Publish supported areas and omission policy before a pilot.

Prefer an immutable, checksummed server-side spatial index with bounded
candidate lookup. Review its license, notices, corpus hash, attribution,
coordinate provenance and permanent storage of IDs/counts/XP. In particular,
audit the UI's coordinate origin: manually chosen user coordinates and
coordinates returned by a licensed map/place service may have different terms.
Review GPS and coordinates separately from geocoded Google labels. Approve a
durable crosswalk and exclusion test corpus before replacing the policy stub.
No map or provider data is downloaded by the candidate.

## Reward processing

- Only the pin-create Firestore trigger can propose geography. It uses the
  Firestore creation timestamp, pilot allowlist and configured cutoff. A missing
  status on a new pin follows the existing publish convention. Draft-to-public
  transitions, unavailable evidence and missed deliveries can leave pins
  unawarded. There is no scheduled scan, callable backfill or replay of historic
  pins. Timeout is 750 ms for asynchronous resolution and the adapter must
  cooperate with cancellation. Publish coordinates describe the pin location.
  They do not establish that its author visited the location.
- The adapter receives just latitude and longitude. A versioned Ed25519
  receipt binds the named database, UID, pin path, full creation timestamp and
  exact point by digest, and signs the canonical country/city result. The
  transaction checks the current pin against the receipt again, and checks the
  deletion tombstone, profile existence and summary version. Provider retries
  can repeat lookup. Concurrent progression writers retry their summary
  calculation without reissuing the same lookup inside the transaction.
- Geography uses `geo_v1:country:<ISO>` (+150 XP) and
  `geo_v1:city:<ISO>:<stable-id>` (+25 XP), one immutable per-user event per
  canonical identity. Its receipt is stored on the award event. The same
  transaction commits the ledger entries, summary and achievements. Only the
  server SDK writes these records under the proposed Rules. A Firestore IAM
  principal with direct write access remains a trusted operator.
- Lifetime XP, counts and unlocks stay permanent. Unreconciled legacy city or
  country history freezes new awards and unlocks only for the affected
  dimension. This prevents paying twice for legacy labels or summary-only
  counts whose canonical identity is unknown. Review privately sampled legacy
  data and a conservative crosswalk before opening those dimensions. No legacy
  conversion or XP clawback is included. Deleting an account continues through
  the existing worker, including recursive removal of its progression data.
- The dormant build makes no resolver calls and adds no geographic point reads.
  In a future allowlisted pilot, candidate validation adds a pin and deletion
  lock lookup before resolution and one pin read per award transaction attempt.
  A provider outage preserves ordinary progression. The current no-retry
  Eventarc setting intentionally permits missed geographic credit. Avoid
  announcing guaranteed credit or enabling bulk recovery.

## XP sensitivity

Run `npx tsx --test tests/achievementSystemV11.test.ts`. The model uses the
existing cohort assumptions for distinct pins, likes, followers, photo/rich
participation, categories and completed profiles, with repeated visits
within each place. It introduces at most one new city per 55/28/14 pins and
country per 170/85/48 pins (casual/active/power), with cohort caps. Restricted
coverage verifies 35% of modeled cities and 50% of countries. Broad coverage
verifies 70% and 100%. These are scenario assumptions, not coverage forecasts.

Months, frozen / restricted / broad:

| Cohort | Level 8 | Level 9 | Level 10 |
| --- | --- | --- | --- |
| Casual (2 pins/mo) | 118.0 / 116.0 / 113.0 | 191.5 / 189.0 / 185.0 | 314.5 / 310.0 / 304.5 |
| Active (8 pins/mo) | 25.4 / 24.9 / 24.0 | 41.8 / 40.9 / 39.6 | 68.8 / 67.1 / 64.9 |
| Power (24 pins/mo) | 7.0 / 6.7 / 6.3 | 11.9 / 11.4 / 10.9 | 19.5 / 18.6 / 17.9 |

If pilot telemetry confirms the long tail, evaluate 13k / 20k / 30k XP as a
separate Levels 8–10 scenario against current 14k / 22k / 35k, including
late-stage unlocks for existing users and geography coverage bias. This PR
changes no thresholds.

## Coordinated release and recovery gates

1. Review this PR, the exact commit and CI, and obtain separate merge approval.
   Use a disposable project/AI Studio copy with its own Firebase named database,
   Auth, Storage, endpoints and preview-origin Maps key. Confirm the build
   cannot use the production backend or Maps key. Exercise normal pin, profile,
   like, follow, recalculation and deletion flows. Test both stale tabs and the
   old supported upload path against the intended transition. Local browser
   emulation is supplemental to a hosted rehearsal.
2. Before production approval, reconcile every progression writer and indirect
   trigger against [the deployment manifest](progression-deployment-manifest.json)
   and [existing release/recovery plan](GEOGRAPHY_XP_RELEASE.md). Inventory
   immutable source/image identities, active revisions, Eventarc filters,
   retry settings, IAM, schedulers and the current AI Studio snapshot/source
   mapping. Treat `heyroq-00024-4xb` in `us-west1` as last reported, pending
   a fresh read-only preflight. Record and verify the immutable compatible
   rollback artifact. Confirm operator tools no longer rely on browser admin
   writes to progression paths before applying the proposed named Rules.
3. First approved production cutover ships v1.1 and this code with geography
   frozen. Gate and drain all legacy progression ingress, including Firestore
   callbacks, deletion cascades and callable recalculation, through an approved
   mechanism that accounts for queued events. Firebase updates are non-atomic.
   If the team cannot prove quiescence and safe delivery, stop before rollout.
   Cut over all affected writers together from one immutable package; preserve
   unrelated worker settings and follow the existing managed-image/identity
   ordering for Rules and frontend. Verify exact deployed identities, named DB
   binding and absence of legacy XP writers before opening ingress. Preview,
   publish, traffic, IAM and local-vs-live test authority remain separate.
4. With separate live test-data approval, verify historical and new ledger IDs,
   badge permanence and pin/delete flows using disposable accounts. Measure
   Trusted Voice reads and p95 latency in staging/production canary separately
   from local fixtures. Below 50 distinct eligible likers, repeated likes can
   require scanning all like documents across qualifying pins. The local
   benchmark exercises 306 like docs over 12 pages and 98 actor/lock lookups.
   Agree on latency/read budgets before broadening rollout. The Functions
   runtime audit reports 10 moderate dependency nodes from `qs` and `uuid`
   advisories and their parent chains. This code adds no dependencies or new
   external parser/UUID entry points. Track patched transitive trees in a
   separate dependency change and repeat compatible Firebase-runtime tests.
5. Geography activation requires a reviewed corpus and second approved change.
   Add a default-off operational control and future UTC cutoff to the approved
   adapter wiring. Isolate signing keys per environment and preserve old key
   IDs/public keys for receipt inspection. Start with operator UIDs. Check
   eligibility and abstention rates, country-only counts, award volume, race
   retries, missing evidence and cross-version deduplication. Hold rollout on
   mixed writers, misclassification, unexpected awards or budget breach.
6. To recover from any future geography pilot, stop awards, drain relevant
   deliveries and redeploy the reviewed dormant baseline if required. Preserve
   v1 receipts, counts and ledger XP. Roll forward on any shared baseline
   defect. Never route traffic back to a source with label-based geography or
   incompatible image, identity, deletion or Rules behavior.
