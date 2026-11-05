/** Resolve public assets under the hosting application's configured Vite base. */
export function gameAssetUrl(path, base = (typeof import.meta.env !== 'undefined' && import.meta.env.BASE_URL) || '/') {
  const value = String(path);
  if (!/^\/(?:assets|media|audio)\//.test(value)) return value;
  const prefix = String(base).endsWith('/') ? String(base) : String(base) + '/';
  return prefix + value.slice(1);
}
