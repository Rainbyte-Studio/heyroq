import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {execSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

interface RootPackageJson {
  name?: string;
  version?: string;
}

function readCanonicalPackageMetadata(): {name: string; version: string} {
  try {
    const pkgPath = path.resolve(__dirname, 'package.json');
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as RootPackageJson;
    return {
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'heyroq',
      version: typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : '0.1.0-beta.1',
    };
  } catch {
    return {name: 'heyroq', version: '0.1.0-beta.1'};
  }
}

function resolveGitCommitSha(): string | null {
  const ciCandidates = [
    process.env.GITHUB_SHA,
    process.env.COMMIT_SHA,
    process.env.SHORT_SHA,
    process.env.REVISION_ID,
  ];
  for (const candidate of ciCandidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (/^[0-9a-f]{7,40}$/i.test(trimmed)) {
        return trimmed.slice(0, 7).toLowerCase();
      }
    }
  }

  try {
    const sha = execSync('git rev-parse --short=7 HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : null;
  } catch {
    // Production builds must succeed cleanly when .git metadata is unavailable.
    return null;
  }
}

function resolveBuildDateIso(): string {
  const sourceEpoch = process.env.SOURCE_DATE_EPOCH;
  if (sourceEpoch && /^\d+$/.test(sourceEpoch.trim())) {
    const ms = Number(sourceEpoch.trim()) * 1000;
    if (Number.isFinite(ms) && ms > 0) {
      return new Date(ms).toISOString();
    }
  }
  return new Date().toISOString();
}

export default defineConfig(({ mode }) => {
  const pkg = readCanonicalPackageMetadata();
  const gitCommitSha = resolveGitCommitSha();
  const buildDate = resolveBuildDateIso();

  return {
    appType: 'spa',
    plugins: [react(), tailwindcss()],
    define: {
      __HEYROQ_BROWSER_EMULATOR__: mode === 'browser-emulator',
      __HEYROQ_PACKAGE_NAME__: JSON.stringify(pkg.name),
      __HEYROQ_APP_VERSION__: JSON.stringify(pkg.version),
      __HEYROQ_BUILD_DATE__: JSON.stringify(buildDate),
      __HEYROQ_GIT_COMMIT_SHA__: JSON.stringify(gitCommitSha),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
