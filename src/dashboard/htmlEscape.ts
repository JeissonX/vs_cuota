/**
 * Utilidades de sanitización y serialización para Webviews (anti-XSS).
 */

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function serializeForScript(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) {
    return 'undefined';
  }
  return json.replace(/</g, '\\u003c');
}
