/**
 * Escapes user-controlled text before it is interpolated into an HTML string
 * (e.g. custom Google Maps marker content built with innerHTML).
 *
 * Pin titles are user input: without escaping, a title such as
 * `<img src=x onerror=...>` would execute for every visitor of the map (stored XSS).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
