import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GlobalSearchDropdown } from '../src/components/Navigation/GlobalSearchDropdown';

test('search results have distinct region identifiers and announce status', () => {
  const noop = () => {};
  const desktop = {
    id: 'desktop-search-results', isOpen: true, onClose: noop, query: 'coffee',
    results: { spots: [], people: [], cities: [], tags: [], totalCount: 0 },
    isLoading: true, onSelectSpot: noop, onSelectPerson: noop, onSelectCity: noop, onSelectTag: noop,
  };
  const loading = renderToStaticMarkup(createElement(GlobalSearchDropdown, desktop));
  const complete = renderToStaticMarkup(createElement(GlobalSearchDropdown, {
    ...desktop, id: 'mobile-search-results', isLoading: false,
  }));
  assert.match(loading, /id="desktop-search-results" role="region" aria-label="Search results"/);
  assert.match(loading, /role="status"[^>]*>Searching</);
  assert.match(complete, /id="mobile-search-results"/);
  assert.match(complete, /role="status"[^>]*>0 search results</);
  assert.equal(renderToStaticMarkup(createElement(GlobalSearchDropdown, { ...desktop, isOpen: false })), '');
});
