import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escapeHtml } from '../src/utils/html';

describe('Map marker XSS regression', () => {
  it('escapes HTML tags and attribute-breaking characters', () => {
    assert.equal(
      escapeHtml('<img src=x onerror="alert(1)">'),
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
    assert.equal(escapeHtml(`Tom & Jerry's`), 'Tom &amp; Jerry&#39;s');
  });

  it('leaves normal titles (incl. Greek and emoji) readable', () => {
    assert.equal(escapeHtml('Παραλία Ναυάγιο 🏖️'), 'Παραλία Ναυάγιο 🏖️');
  });

  it('handles null/undefined/non-string input safely', () => {
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(42), '42');
  });

  it('ClusteredMarkers never interpolates the raw pin title into innerHTML', () => {
    const src = readFileSync(new URL('../src/components/Map/ClusteredMarkers.tsx', import.meta.url), 'utf8');
    assert.ok(!src.includes('${pin.title}'), 'raw ${pin.title} found in marker HTML');
    assert.ok(src.includes('${escapeHtml(pin.title)}'), 'pin title must be escaped');
  });
});
