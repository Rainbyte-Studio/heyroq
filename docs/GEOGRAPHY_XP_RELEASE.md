# Geographic XP rollout

New city and country awards are paused in this revision. The pin-create
trigger runs ordinary progression in the existing named database without
calling a geography provider. The existing transaction is covered with
synthetic resolver results. Existing XP events, receipts, summary high-water
marks and achievements stay available. There is no backfill or migration.
A pin represents a location chosen by its author. Physical presence is unverified.

## Google Geocoding approval gate

Google describes [reverse geocoding](https://developers.google.com/maps/documentation/geocoding/reverse-geocoding)
as an estimate of a nearby addressable location. It cannot establish polygon
containment or reliably distinguish every coastal or border coordinate.
A future Google integration would require an explicit product decision that
city and country XP is based on an estimated pin location. If strict
containment is required, keep awards paused for this provider.

Verify the billing account address and the governing agreement. The
[EEA terms §3.2.3](https://cloud.google.com/terms/maps-platform/eea) and
[standard terms §3.2.3](https://cloud.google.com/maps-platform/terms)
restrict creating content based on Google Maps Content. The
[EEA Geocoding terms §6](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms)
limit use with maps and provide narrow caching permissions. The place ID
exception in the [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies)
addresses caching. It does not itself authorize durable XP, geography counts,
badges, or deduplication identities derived from Geocoding. Obtain a documented
determination covering the actual license and these exact outputs before wiring an
adapter. Seek custom licensing from Google Maps Platform Sales if required.

## Release without staging

1. After separate release approval, verify the production project is
   `rainbyte-studio`, the function region is `europe-west2`, and the Firestore
   database is `ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3`.
   Confirm the deployed revision and capture a rollback reference. Check whether
   any previous geography resolver was active before scheduling the pause.
2. Once checks pass, deploy only `functions:onPinCreatedProgression` to the
   verified project and publish the corresponding help and privacy pages
   through the existing Google AI Studio workflow. Remove obsolete provider
   configuration from the rollout and review old secret access after confirming
   no remaining consumers. No billing or new API is needed for this revision.
3. Use a disposable account to publish a pin and verify ordinary XP, no new city
   or country ledger events or receipts, and unchanged historical achievements.
   Monitor trigger errors and ordinary XP after release. If rollback is needed,
   verify the target revision has its geography activation disabled before
   redeploying it.

## Conditional follow-up for Google

- Gate Google calls with a server-only switch defaulting off, a future UTC
  server creation-time cutoff, and an initial allowlist of operator test
  accounts. Disable the switch to stop calls and awards. Never backfill.
- Send only pin coordinates via a bounded server-side request. Use dedicated
  restricted credentials, avoid logging coordinates, API responses and keys,
  and update disclosures and attribution before sending traffic. Review
  existing browser map and label storage separately under the governing terms.
- Approve the [Geocoding SKU and quota settings](https://developers.google.com/maps/documentation/geocoding/usage-and-billing).
  Verify available quota controls in the actual project. Use a transactional
  application-side request cap that counts attempts, including failures and
  retries, plus billing alerts. A billing alert does not cap spend.
- Reject missing or conflicting results, water or coarse-only responses, and
  uncorroborated locality data. An unresolved or conflicting country precludes
  both awards. Conflicting city results should yield no bonus. A confident
  country result with no city can be considered independently only when there
  is affirmative address-level evidence and no ambiguity. Test representative
  inland, open-water, coastal and disputed-border coordinates. Keep the switch
  off if this does not meet the agreed accuracy requirement.
- Keep provider output in memory and review every Firestore write against the
  approval, including identifiers, event payloads, receipts, counts and
  achievements. Keep client labels and geohashes outside award decisions.
  Preserve atomic ledger writes, concurrency protection, and legacy deduplication.
  With separate production approval, run the restricted smoke test before
  widening the allowlist. Monitor request rates, failures, award rates and
  spend without recording precise coordinates or lookup content.
