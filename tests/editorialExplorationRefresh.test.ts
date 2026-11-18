import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORDMARK_ASSETS } from '../src/config/brandConfig';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');

function collectSrcFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...collectSrcFiles(fullPath));
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.css')) {
      results.push(fullPath);
    }
  }
  return results;
}

test('Concept B brand SVG assets exist in public/, contain vector paths, and contain zero <text> nodes', () => {
  const expectedAssets = Object.values(WORDMARK_ASSETS);
  assert.equal(expectedAssets.length, 6);

  for (const publicRelPath of expectedAssets) {
    const diskPath = path.join(ROOT_DIR, 'public', publicRelPath.replace(/^\//, ''));
    assert.ok(existsSync(diskPath), `Missing SVG asset ${diskPath}`);
    const svgContent = readFileSync(diskPath, 'utf8');
    assert.ok(svgContent.includes('<svg'), `${publicRelPath} must be a valid SVG`);
    assert.ok(svgContent.includes('<path'), `${publicRelPath} must contain vector <path> outlines`);
    assert.equal(
      svgContent.includes('<text'),
      false,
      `${publicRelPath} must not contain runtime font-dependent <text> nodes`
    );
  }
});

test('Editorial Exploration eliminates external Unsplash stock fallbacks and wires SpotPhotoFallback cleanly', () => {
  const srcFiles = collectSrcFiles(path.join(ROOT_DIR, 'src'));
  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf8');
    assert.equal(
      content.includes('images.unsplash.com'),
      false,
      `External Unsplash URL found in ${path.relative(ROOT_DIR, file)}`
    );
    assert.equal(
      content.includes('animate-bounce'),
      false,
      `Distracting animate-bounce found in ${path.relative(ROOT_DIR, file)}`
    );
    assert.equal(
      content.includes('animate-pulse'),
      false,
      `Distracting animate-pulse found in ${path.relative(ROOT_DIR, file)}`
    );
  }

  for (const componentPath of [
    'src/components/Pin/PinFeedList.tsx',
    'src/components/Pin/PinPreviewCard.tsx',
    'src/components/Pin/PinDetailModal.tsx',
  ]) {
    const src = readFileSync(path.join(ROOT_DIR, componentPath), 'utf8');
    assert.ok(
      src.includes('<SpotPhotoFallback'),
      `${componentPath} must render <SpotPhotoFallback /> when no photo is present`
    );
  }
});

test('Editorial Exploration palette tokens and restrained interior card primitives are enforced in src/index.css', () => {
  const css = readFileSync(path.join(ROOT_DIR, 'src/index.css'), 'utf8');

  for (const token of [
    '#FAF9F6',
    '#F3F1ED',
    '#202124',
    '#E6E3DE',
    '#17181B',
    '#222327',
    '#2B2C31',
    '#F5F4F1',
    '#38393E',
    '.heyroq-btn-secondary',
    '.heyroq-btn-destructive',
  ]) {
    assert.ok(css.includes(token), `src/index.css must define Editorial Exploration token ${token}`);
  }

  const cardRuleMatch = css.match(/\.liquid-glass-card\s*\{[^}]*\}/);
  assert.ok(cardRuleMatch, '.liquid-glass-card rule must exist');
  assert.equal(
    cardRuleMatch[0].includes('backdrop-filter'),
    false,
    '.liquid-glass-card must never stack backdrop-filter'
  );
});
