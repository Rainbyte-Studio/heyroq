# Heyroq Achievement System v1.1

The catalog contains 26 badges across Exploration (5), Geography (7), Discovery (6), Community (5), and Special (3). The 10 XP thresholds are 0, 300, 750, 1,500, 3,000, 5,500, 9,000, 14,000, 22,000, and 35,000.

| Addition | Evidence | Tier | XP |
| --- | --- | --- | ---: |
| Master Curator | 50 distinct qualifying published spots | Platinum | 250 |
| Local Explorer | 1 verified city, paused | Bronze | 25 |
| City Pathfinder | 10 verified cities, paused | Gold | 150 |
| Global Voyager | 8 verified countries, paused | Platinum | 250 |
| Versatile Explorer | 4 supported categories across distinct qualifying spots | Silver | 75 |
| Detailed Guide | 5 distinct qualifying spots with different rich descriptions | Silver | 75 |
| Trusted Voice | Likes from 50 distinct eligible accounts | Gold | 150 |
| Heyroq Legend | Reach 35,000 earned XP before the award | Platinum | 500 |

## Evidence and compatibility

- A qualifying discovery is a live published pin with a title, supported category, and valid coordinates. A missing legacy status counts as published. The existing discovery grid collapses pins within the same rounded 0.001° cell. It limits duplicate submissions and uses coordinates for spot deduplication only. It cannot attest that a place exists, and near-identical pins can fall on opposite sides of a cell boundary.
- Rich descriptions use at least 80 characters after Unicode and whitespace normalization and at least two distinct normalized nonempty tags. A copied normalized description contributes once. Future +25 rich bonuses use the same criteria and are restricted to one reward per cell and description per author. The XP ledger stores the cell and a SHA-256 description fingerprint. It preserves prior rich awards. Legacy awards can seed deduplication when the corresponding pin and qualifying content still exist. Deleted legacy pins without fingerprints lack evidence for this check.
- Visual Storyteller requires a distinct qualifying pin with a published HTTPS image URL. Current user uploads are covered by the server-approved image claim and immutable URL rules. Legacy HTTPS links are accepted as stored publication evidence without requesting external URLs. Existing unlocks stay permanent. The optional server-written legacyPhotoProgress field retains the original counter, and qualifiedPhotoProgress keeps the independently validated high-water mark.
- Trusted Voice reads canonical like documents on published pins and counts each eligible account once across the author's pins. It excludes self-likes, missing or deleting profiles, deletion locks, excluded fixture accounts, mismatched actor IDs, and likes from before the active pin document's creation. Existing Firestore rules require an authenticated non-anonymous actor. Positive pin counters select which collections to inspect, while only canonical records contribute to this badge. Independently controlled accounts and collusion cannot be verified from this data. Existing community badges and engagement XP milestones keep their previous metrics.
- Existing badge records and canonical achievement ledger entries preserve unlocks, timestamps, rarity, and recorded rewards. Pioneer Voyager retains its 250 XP catalog reward and uses Gold for future awards. Historical Platinum is kept, including for old Pioneer ledger entries without tier metadata. The ledger records the tier for future awards. An unlocked historical badge with a missing ledger event is treated as already earned. Its XP is never blindly added again.
- New non-geographic badges can recognize eligible current evidence during the user's next regular server progression calculation. Level-based badges use earned XP carried forward from the ledger and summary, plus awards queued in the same transaction. Historical new-badge progress uses the highest previously validated result. Trusted Voice tracks currently eligible likes until unlocking. There is no bulk write job. An offline preview cannot establish the new awards. The legacy migration scripts are outside this release path and must stay unused.
- The transaction keeps the existing summary-version fence and deletion-lock check. Achievement events have deterministic IDs and use transactional create. The pin update handler is limited to publication, title, category, description, tag, and image changes, with existing creation and deletion handlers covering the other lifecycle events. Counter-only writes skip the new handler. Optional fields are stored in existing server-owned documents. No new collection, Firestore rule, or composite index is required.
- Geographic XP has a zero award path in this version. The +25/+150 city/country values remain in configuration for a future separately approved design. Existing earned geographic records and progress are retained. Existing client footprint display is independent of rewards. New locked badges start at zero, regardless of legacy counts.

## XP balance with geography paused

The deterministic model in tests/achievementSystemV11.test.ts uses catalog and milestone constants. It varies publication rate, rich and photo participation, incoming likes, unique liker share, followers and category coverage. It assumes eligible distinct publications and a completed profile. Estimates describe scenarios and use no production telemetry.

| Cohort | Eligible pins/month | Level 5 | Level 8 | Level 10 | Level 10 in v1.0 model |
| --- | ---: | --- | --- | --- | --- |
| Casual | 2 | 45 pins / 22.5 mo | 236 / 118 mo | 629 / 314.5 mo | 638 pins |
| Active | 8 | 33 pins / 4.1 mo | 203 / 25.4 mo | 550 / 68.8 mo | 560 pins |
| Power | 24 | 29 pins / 1.2 mo | 168 / 7.0 mo | 469 / 19.5 mo | 477 pins |

The added pre-cap rewards total at most 550 XP with geography paused. Legend XP lands after Level 10. The largest pacing gap is Levels 8–10 for casual and active users. Keep thresholds for v1.1. Review actual progression and eligible XP sources across cohorts before choosing a future high-level pacing change. Geographic rewards need their own simulation with licensed data and sparse/ambiguous placement cases once designed.

## Release sequence

1. Run the PR checks and validate the exact reviewed commit in an isolated Firebase/AI Studio preview. Confirm both lockfiles and Maps key isolation after importing the commit. Confirm the named database, image claims, duplicate/draft pin behavior, likes, old profiles, and the geography pause.
2. Before any separately approved backend cutover, capture the live endpoint/trigger inventory and read-only progression samples. Load-test Trusted Voice on authors with many liked pins, including accounts with substantial duplicate or ineligible engagement. Measure Firestore reads and p95 function duration. Decide whether the account-level anti-fraud rule and legacy HTTPS evidence are acceptable for rollout.
3. Coordinate all existing progression writers and the single new update trigger in one cutover plan. Keep v1.0 writers from processing progression after v1.1 awards are enabled. Mixed versions may overwrite summary counts or display tiers. Verify delivery and counter-write suppression in staging, preserve the existing account deletion and scheduler setup, then validate a limited authorized cohort before a broader rollout. Use a compatible forward rollback that keeps earned badge documents and XP events.
4. After separate production approval and the backend acceptance checks, publish the reviewed frontend through the existing AI Studio project. Verify both domains, Cloud Run revision/traffic, Maps key isolation, and the profile display. Geography requires a separate licensing, verification, emulator, preview and production approval milestone.
