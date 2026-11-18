# Server-verified geography XP release

The server sends pin coordinates without account identifiers to the
[Geoapify Boundaries API](https://apidocs.geoapify.com/docs/boundaries/)
at `api-eu.geoapify.com`. See the [EU endpoint documentation](https://www.geoapify.com/european-alternative-to-google-maps/)
and [DPA](https://www.geoapify.com/data-processing-agreement/).
CI uses stubbed provider responses.

## Production rollout

1. Build with Node 22 and run CI. Confirm the project is `rainbyte-studio`
   and both the Admin SDK and Eventarc database filter target
   `ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3`.
   Compare the functions in source with deployed functions before choosing
   a deployment scope. The Functions region is `europe-west2` and the
   Firestore database and its Eventarc trigger are in `us-west1`.
2. In Geoapify MyProjects, create a key on the Free plan. Check the account's
   quota and overage terms before using the key. The advertised Free limits
   are 3,000 credits/day and 5 requests/second. A point response costs one
   credit per group of up to 20 boundaries. Retries consume quota. Treat the
   provider's soft limits as usage thresholds and confirm overage terms with
   Geoapify before activation. See [pricing](https://www.geoapify.com/pricing/)
   and [terms](https://www.geoapify.com/terms-and-conditions/).
3. After approval to enable Secret Manager, set the secret via the private
   prompt from `firebase functions:secrets:set GEOAPIFY_BOUNDARIES_KEY --project rainbyte-studio`.
   Verify that an enabled version exists and that the pin-create runtime
   identity can access it. Secret Manager and Functions are billed separately
   from Geoapify. Keep the key out of command arguments, repository files,
   frontend configuration and logs.
4. Use the key for a small provider smoke test with public coordinates for a
   city, both sides of a land border and open sea. Check boundary parsing and
   attribution with the production endpoint and request parameters. This
   check requires no Firestore writes.
5. After deployment approval, deploy the reviewed Functions scope with
   `GEOGRAPHY_XP_START_AT` unset so geographic awards remain paused.
   Verify the deployed runtime, named database and trigger without modifying
   records. Stop if the CLI proposes unexpected deletions or other resources.
6. Pull the reviewed `main` in AI Studio's GitHub settings. Preview Help and
   Privacy, then use Republish to publish the attribution and disclosure.
   Verify both on the live app before approval to activate.
7. After activation and deployment approval, set `GEOGRAPHY_XP_START_AT` to
   the agreed future UTC instant in `functions/.env.rainbyte-studio` using
   `YYYY-MM-DDTHH:mm:ssZ`. Redeploy only `functions:onPinCreatedProgression`.
   Verify awards and receipts with an agreed test pin. To pause new awards,
   remove the start setting and redeploy the same function. Existing history
   stays in place. This rollout requires no migration, backfill, rules,
   indexes or Firebase Hosting deployment.

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
