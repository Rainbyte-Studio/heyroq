# Geography Progression Lite v1.1

The existing photo picker and verified upload support JPG, PNG and WebP from desktop
and mobile. A photo's EXIF or device GPS is unnecessary. Choose a pin on the map
or enter its coordinates, then optionally select a country and city. The picker
also offers the catalog city center as a starting point. Photos and ordinary pins
continue to use the existing publishing path.

The create flow stores manually chosen coordinates and a typed location label.
The city-center shortcut uses the local catalog. The Google basemap remains a
display surface for manual pin placement. The create flow no longer calls Google
Places or reverse geocoding. It does not copy Google place IDs, geocoded coordinates,
addresses or city/country labels into the catalog, declaration or rewards ledger.
Existing pins and their historical data are untouched.

## Catalog and license

The app and Functions use the same checked-in snapshot,
`functions/geographyCatalog.json`. It contains 31,801 populated places and 244
country or territory codes represented in that snapshot. Cities use the source's
numeric GeoNames ID as a string. Countries use the source's two-letter code.
Country and region labels help distinguish cities with the same name. The generator
selects the required columns, joins regional labels, excludes sections of populated
places and several historical or abandoned feature types, and sorts by ID. Names
use the source spelling. Smaller localities can be absent, and the catalog does not
model municipal borders or resolve disputed geography.

Data adapted from [GeoNames](https://www.geonames.org/export/),
licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
The in-app selection UI displays attribution. Preserve this notice and in-app attribution
when distributing the snapshot or an adaptation.

The `geonames-2026-11-21` snapshot was built from these GeoNames exports. SHA-256 hashes
identify the inputs, which GeoNames updates in place.

| Export | SHA-256 |
| --- | --- |
| [cities15000.zip](https://download.geonames.org/export/dump/cities15000.zip) | `df53bb7aade75a0fa2160a98405e5e1d014fe4c6f4b0db1d6078b9fd7b50486b` |
| [countryInfo.txt](https://download.geonames.org/export/dump/countryInfo.txt) | `79f8f59ea01cbb40438bf1856dd6c2ff201f03f8fc72d0530b2646aaf603ef04` |
| [admin1CodesASCII.txt](https://download.geonames.org/export/dump/admin1CodesASCII.txt) | `2e4867f5397acb056ea26377601b57af37cb4c81399770225018e9e439e91ad3` |

Extract the city archive and run
`node scripts/generate-geography-catalog.mjs cities15000.txt countryInfo.txt admin1CodesASCII.txt`.
For an update, advance the snapshot version, review IDs that disappear or change country,
and reconcile moved or merged places before awarding against that version. Review
GeoNames coverage and any agreement-specific map-display questions before a pilot.

## Validation and progression

`pins/{pinId}.geographySelection` is an optional, immutable, public user declaration
with only `countryCode` and `cityId`. Rules validate its shape and require a first
publication with the existing atomic publish receipt and an approved photo claim.
A well-formed declaration can be published even if the selected catalog IDs or
pin coordinates fail the server's reward checks. The field itself carries no
verification status or extra privileges.

The dormant server award path accepts only an original creation event for a
public, eligible pin. It looks up the stable city ID, matches the country and
requires the pin within 25 km of the city center. Before committing, the transaction
rechecks the pin incarnation, selection, account deletion lock, publish receipt
and exact approved image claim. This is a proximity check on a self-declared
location. It cannot establish a visit, jurisdiction or photo origin.

For each user, a permanent city event grants +25 XP and a permanent country event
grants +150 XP. IDs are `geo_v1:city:{countryCode}:{cityId}` and
`geo_v1:country:{countryCode}`. Version 2 ledger evidence records the catalog
version, validated IDs, pin ID and UTC publication day. Deterministic event IDs,
the progression transaction and a fresh-ledger retry prevent duplicate awards
from replay or concurrency. At most five distinct pins per account can earn
geography rewards for a UTC publication day. A pin granting both rewards counts
once. The quota affects geography only and is retained with the ledger on pin deletion.

The city totals feed Local Explorer, Urban Scout, Metro Nomad and City Pathfinder
(1, 2, 5 and 10 cities). The country totals feed Cross Borders, World Citizen and
Global Voyager (2, 4 and 8 countries). Existing badge IDs, thresholds, rewards,
already-earned achievements and lifetime XP are preserved. A dimension with
unmapped legacy events or unexplained lifetime counts stays frozen for that
account to avoid duplicate awards or retroactive badge qualification. A review of
legacy identity mapping is required before supporting that dimension. No
migration or backfill is included.

## Dormant release state

The shipped policy returns `undefined`. No environment variable, client field
or Firebase setting can activate geographic XP or awards. Tests inject a local
policy directly into the server handler. Ordinary progression continues and
previously unlocked geography badges remain visible. Activation would require an
explicit reviewed code change and a future cutoff for new publications, with a
separate release decision. Do not deploy this draft.

## Verification

- Frontend: `npm run lint`, `npm run build`, `npm test`.
- Functions: `npm --prefix functions run build` and
  `node --test functions/tests/progressionLocation.test.cjs functions/tests/geographicProgression.test.cjs`.
- Local integration and Rules: follow
  [Functions CI](../.github/workflows/functions-build.yml) and
  [Rules CI](../.github/workflows/firestore-rules.yml), which use demo projects.
  Coverage includes disabled defaults, forged selections, distance, claims,
  historical data, concurrency, replay, the daily cap, and all seven badges.
