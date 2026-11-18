# Server-verified geography XP release

Provider and activation require explicit operator approval. The server sends
only pin coordinates to the [Geoapify Boundaries API](https://apidocs.geoapify.com/docs/boundaries/).
It uses containing administrative/place boundaries. Geoapify is separate from
the Google Maps and Google AI Studio setup. Review the provider agreement,
coordinate processing, attribution, plan quota and overage behavior before
creating credentials or enabling traffic. Use a plan with an approved spend
limit. No paid Google API is required. No external calls run during CI.
See [Geoapify pricing](https://www.geoapify.com/pricing/) and
[storage and attribution terms](https://www.geoapify.com/geocoding-api/).

## Activation

1. Merge the dependency patch before the geography change. Build with Node 22
   and verify the named database in the release checklist.
2. In an approved staging Google Cloud project, set up Firebase Secret Manager
   and store the API key as `GEOAPIFY_BOUNDARIES_KEY` with
   `firebase functions:secrets:set GEOAPIFY_BOUNDARIES_KEY --project <project-id>`.
   Give the pin-create function's execution identity access to that secret.
   Secret Manager and Functions have their own Google Cloud billing.
3. Set `GEOGRAPHY_XP_START_AT` in `functions/.env.<project-id>` to a future UTC
   instant using `YYYY-MM-DDTHH:mm:ssZ`. Set it after the intended rollout time
   and set it once per rollout. An omitted or invalid value pauses new geography
   awards. The secret binding must still exist for this version to deploy.
4. After approval, deploy the Functions in `europe-west2` using the existing
   named Firestore database. For production the exact target is
   `firebase deploy --project rainbyte-studio --only functions`. No Firestore
   rules, indexes, data migration, or Firebase Hosting deployment is needed.
   Publish the help-page attribution and privacy disclosure with the existing Google AI Studio
   republish workflow before enabling production geography XP.
5. In staging, validate city and country results for representative locations,
   border and water locations, quotas, timeouts, and attribution. After production
   approval, repeat a small smoke test with a disposable account and confirm
   ledger totals. To pause new geographic awards, remove the start setting,
   redeploy the pin-create function, and retain all history.

## Historical behavior

The cutoff uses Firestore document creation time. Geography is evaluated only
by the pin-create event. Legacy pins, edits and callable recalculation do not
receive geographic backfill. Existing ledger entries, summary high-water marks,
and unlocked achievements stay intact. Existing summary-only counts do not
grant new geography achievements or associated XP. Country-only results can earn a country
award. Missing or ambiguous results do not supply a city. The pin records a
selected map location. No claim of physical presence is made.

The XP ledger uses country plus normalized city name for legacy compatibility,
with a hash for names the legacy ASCII normalizer cannot represent. Historical
unscoped city awards conservatively suppress the same normalized name. Cities
with indistinguishable normalized names in one country share an award. Existing
deterministic award IDs and optional provider boundary IDs prevent duplicate
geographic rewards. Provider timeouts, HTTP 429 and 5xx can retry only within
the first hour after pin creation. Delivery retries can repeat provider calls
and consume quota. Keep the old progression backfill scripts out of this rollout.
