/**
 * Resolve files in public/ against their actual game bundle, not document.baseURI.
 *
 * In a Portals iframe the document URL or injected <base> may belong to the host
 * viewer, while our Vite JS bundle lives on the game's asset origin.
 * Vite emits this module into assets/index-*.js for the production build, so
 * ../assets and ../media from import.meta.url point to the game bundle's files.
 * For Render and dev, absolute BASE_URL continues to work normally.
 */
export function gameAssetUrl(
  path,
  base = (typeof import.meta.env !== 'undefined' && import.meta.env.BASE_URL) || '/',
  bundleUrl = import.meta.url
) {
  const value = String(path);
  if (!/^\/(?:assets|media|audio)\//.test(value)) return value;
  const prefix = String(base).endsWith('/') ? String(base) : String(base) + '/';
  if (prefix === './') {
    // Vite's dev server serves public/ at the origin root.
    if (import.meta.env?.DEV === true) return '/' + value.slice(1);
    return new URL('../' + value.slice(1), bundleUrl).href;
  }
  return prefix + value.slice(1);
}
