# Heyroq Versioning Architecture

Heyroq uses **Semantic Versioning 2.0.0** (`MAJOR.MINOR.PATCH[-prerelease][+build]`) with a single canonical source of truth in the root `package.json`.

---

## 1. Canonical Version Source

- **File:** `/package.json`
- **Package Name:** `"heyroq"`
- **Current Version:** `"0.1.0-beta.1"`

All UI surfaces—including the **About Heyroq** modal, navigation dropdown, user profile footer, and desktop status bar—read version data exclusively through `src/config/version.ts` (`APP_VERSION`).

**Rule:** Never hardcode version numbers (such as `v0.1.0` or `v1.0.4`) inside React components, HTML templates, or CSS files.

---

## 2. Semantic Versioning Policy

Version numbers follow `MAJOR.MINOR.PATCH` plus an optional pre-release suffix:

| Segment | When to Increment | Example |
| :--- | :--- | :--- |
| **MAJOR** (`X.0.0`) | Public GA milestone (`1.0.0`) or incompatible architectural/data contract changes after `1.0.0`. | `0.9.2` → `1.0.0` |
| **MINOR** (`0.Y.0` / `1.Y.0`) | Backwards-compatible user-facing features, major discovery enhancements, or new product modules. | `0.1.0-beta.2` → `0.2.0-beta.1` |
| **PATCH** (`0.1.Z` / `1.0.Z`) | Backwards-compatible bug fixes, performance/read-efficiency improvements, accessibility fixes, or security hardening. | `0.1.0` → `0.1.1` |
| **PRE-RELEASE** (`-alpha.N`, `-beta.N`, `-rc.N`) | Iterative pre-release milestones prior to promoting a version to `Stable`. | `0.1.0-beta.1` → `0.1.0-beta.2` → `0.1.0-rc.1` |

---

## 3. Release Channels

`deriveReleaseChannel()` in `src/config/version.ts` automatically resolves the active channel from the SemVer string in `package.json` (with optional typed override via `HEYROQ_PUBLIC_CONFIG.releaseChannelOverride` in `src/config/publicConfig.ts`):

1. **`Alpha`**: Version contains `-alpha` (e.g., `0.1.0-alpha.1`) — internal verification builds.
2. **`Beta`**: Version contains `-beta` (e.g., `0.1.0-beta.1`) or any pre-`1.0.0` (`0.x.y`) version without an `alpha`/`rc` tag — public/closed beta testing.
3. **`RC`**: Version contains `-rc` (e.g., `1.0.0-rc.1`) — feature-frozen release candidate undergoing final regression checks.
4. **`Stable`**: Version is `>= 1.0.0` with no pre-release suffix (e.g., `1.0.0`, `1.2.1`) — general availability production release.

---

## 4. Build Metadata & Git Fallback Behavior

During `vite dev` and `vite build`, `vite.config.ts` populates four non-sensitive compile-time constants:

| Constant | Source | Fallback when Git / CI is Unavailable |
| :--- | :--- | :--- |
| `__HEYROQ_PACKAGE_NAME__` | `package.json` → `name` | `"heyroq"` |
| `__HEYROQ_APP_VERSION__` | `package.json` → `version` | `rootPackage.version` |
| `__HEYROQ_BUILD_DATE__` | `SOURCE_DATE_EPOCH` (if set) or current UTC ISO timestamp | `null` (renders `"Local workspace"`) |
| `__HEYROQ_GIT_COMMIT_SHA__` | `GITHUB_SHA` / `COMMIT_SHA` / `REVISION_ID` or `git rev-parse --short=7 HEAD` | `null` (renders `"Not available"`) |

### Deterministic Build Identifier (`APP_VERSION.buildId`)
- **With build date + Git SHA:** `0.1.0-beta.1+20261117.a1b2c3d`
- **Without Git metadata (e.g. AI Studio container or exported tarball):** `0.1.0-beta.1+20261117`
- **Unit test / zero-metadata environment:** `0.1.0-beta.1+local`

Production builds (`npm run build`) are guaranteed to succeed even when `.git` is absent or the `git` binary is unavailable.

---

## 5. Security & Zero-Secret Guarantee

- `vite.config.ts` **never** serializes `process.env` into client bundles.
- Only `package.json` version/name, UTC timestamp, and a regex-validated 7-character hexadecimal commit hash (`/^[0-9a-f]{7,40}$/i`) are injected.
- API keys (`GEMINI_API_KEY`, service account credentials, private tokens) are never read or exposed by `src/config/version.ts` or `src/config/brandConfig.ts`.

---

## 6. Integrated Legal Routes & Support Mailbox Confirmation

`src/config/brandConfig.ts` uses Heyroq's verified internal SPA routes by default:

- **About Heyroq:** `/about`
- **Privacy Policy:** `/privacy`
- **Terms of Service:** `/terms`
- **Help & Support:** `/support`

Public non-secret configuration values (internal legal/support routes, `help@rainbyte.studio` mailbox status, optional release channel override, and optional hosted changelog URL) are defined centrally in `src/config/publicConfig.ts` (`HEYROQ_PUBLIC_CONFIG`) so preview and production builds never require public-metadata environment variables.

