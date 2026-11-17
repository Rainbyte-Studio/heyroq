# Changelog

All notable changes to **Heyroq** (`heyroq`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending Legal & Operator Confirmation
- Complete pre-publication legal review of statutory entity details, postal address, data retention schedules, minimum age threshold, and governing jurisdiction flagged inside `/privacy` and `/terms` (operational support mailbox `help@rainbyte.studio` and public routes are configured in `src/config/publicConfig.ts`).

---

## [0.1.0-beta.1] - 2026-11-17

### Added
- **Official Informational & Legal Pages (`/about`, `/privacy`, `/terms`, `/support`)**:
  - Added zero-dependency HTML5 History SPA routing (`src/utils/appRoutes.tsx`) supporting direct URL entry, browser refresh, Back/Forward history navigation, and unauthenticated public access across desktop, tablet, and mobile viewports.
  - Added shared accessible editorial page shell (`src/components/Legal/InfoPageLayout.tsx`) with skip-to-content keyboard navigation, strict 3-zone top bar, `Back to Map` primary action, sticky desktop section table of contents, and Rainbyte Studio operator attribution footer.
  - Added **About Heyroq** (`/about`), **Privacy Policy** (`/privacy`), **Terms of Service** (`/terms`), and **Help & Support** (`/support`) tailored to Heyroq's verified Firebase & Google Maps Platform implementation.
- **Confirmed Operator Identity (`Rainbyte Studio`)**:
  - Integrated operator attribution (`"Heyroq — A social discovery platform by Rainbyte Studio."`, `https://rainbyte.studio`, proposed support mailbox `help@rainbyte.studio` gated on operational confirmation) across `brandConfig.ts`, `AboutHeyroqModal`, `AuthModal`, `UserProfileModal`, `Navbar`, `App.tsx`, and all informational/legal pages.
- **Application Identity & Centralized SemVer Architecture**:
  - Standardized package name to `heyroq` and canonical version to `0.1.0-beta.1` (`Beta` channel) in root `package.json`.
  - Added `src/config/version.ts` (`APP_VERSION`, `createAppVersionConfig`, `parseSemVer`, `deriveReleaseChannel`, `formatBuildIdentifier`) and build-time metadata injection in `vite.config.ts` with graceful fallback when Git metadata is absent.
- **Brand & Typography System (`src/config/brandConfig.ts`, `src/index.css`)**:
  - Configured `Plus Jakarta Sans` (`400`–`800`) paired with `Manrope` (`400`–`800`) for complete Latin + Greek character support and a metric-adjusted `Plus Jakarta Sans Fallback` `@font-face` to prevent CLS.
- **Release Documentation & Automated Tests**:
  - Added `CHANGELOG.md`, `docs/VERSIONING.md`, `docs/RELEASE_PROCESS.md`, `tests/versionAndBrandFoundation.test.ts`, and `tests/legalAndInfoPagesRegression.test.ts`.
