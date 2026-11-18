# Geography XP containment

The Functions progression engine preserves earned city and country ledger
entries, summary high-water marks, and unlocked achievements. It pauses new
city and country awards and stops using pin labels to advance geography counts.
New explorers start with zero countries and cities in XP progression. The map,
profile footprint, and ordinary discovery XP still use their existing logic.
Pin coordinates represent a selected map location, not proof of physical presence.

No data migration or replay is required. Do not run the historical progression
migration or backfill scripts as part of this release. They derive geography from
pin metadata and were written for earlier progression versions.

After merge and explicit production approval, use the Functions procedures in
[FIREBASE_RELEASE_CHECKLIST.md](FIREBASE_RELEASE_CHECKLIST.md). The deployment
targets the existing Functions codebase and named Heyroq Firestore database
`ai-studio-heyroq-1fe92aa9-dbc6-4461-813f-e3a63d7e92a3`. Verify in a demo
emulator that legacy ledger entries survive and new pins still earn regular
discovery XP. This change requires no Firestore rules release or Google AI Studio
republish.

To restore geographic awards, resolve city and country on the server from pin
coordinates, then test canonical identifiers and deduplication against existing
ledger IDs before enabling awards. Plan any retroactive awards separately.
Reverting this containment would restore the original trust in pin labels.
